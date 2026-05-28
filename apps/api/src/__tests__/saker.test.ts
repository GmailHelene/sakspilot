/**
 * Saker-CRUD integration-tester.
 * Sjekker at multi-tenant-isolering virker (bruker fra org A kan ikke se org Bs saker).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import 'express-async-errors';
import authRouter from '../routes/auth';
import sakerRouter from '../routes/saker';
import { authMiddleware } from '../middleware/auth';
import { cleanupTestData, testEmail, testPassword } from './helpers';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(authMiddleware);
  app.use('/auth', authRouter);
  app.use('/saker', sakerRouter);
});

afterAll(async () => {
  await cleanupTestData();
});

async function registerUser() {
  const email = testEmail();
  const password = testPassword();
  const res = await request(app)
    .post('/auth/register')
    .send({
      email,
      password,
      name: 'Test',
      organizationName: 'Test AS',
    });
  return { token: res.body.token, userId: res.body.user.id, orgId: res.body.user.organizationId };
}

describe('Saker CRUD + multi-tenant', () => {
  it('opprett, hent, oppdater, slett — full CRUD-syklus', async () => {
    const { token } = await registerUser();

    // Opprett
    const created = await request(app)
      .post('/saker')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test-sak' });
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Test-sak');
    const sakId = created.body.id;

    // Hent én
    const fetched = await request(app)
      .get(`/saker/${sakId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(sakId);

    // Oppdater
    const updated = await request(app)
      .patch(`/saker/${sakId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pagaaende' });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('pagaaende');

    // Slett
    const deleted = await request(app)
      .delete(`/saker/${sakId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleted.status).toBe(200);

    // Bekreft slettet
    const after = await request(app)
      .get(`/saker/${sakId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(404);
  });

  it('multi-tenant: bruker B kan ikke se sak fra bruker A', async () => {
    const userA = await registerUser();
    const userB = await registerUser();

    const created = await request(app)
      .post('/saker')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: 'A sin private sak' });
    expect(created.status).toBe(201);

    // Bruker B prøver å lese den → 404 (ikke 403, for å skjule eksistens)
    const stolen = await request(app)
      .get(`/saker/${created.body.id}`)
      .set('Authorization', `Bearer ${userB.token}`);
    expect(stolen.status).toBe(404);
  });

  it('avviser uautentiserte requests med 401', async () => {
    const res = await request(app).get('/saker');
    expect(res.status).toBe(401);
  });
});
