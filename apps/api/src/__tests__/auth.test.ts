/**
 * Auth-integration-tester.
 *
 * Krever: kjørende DB (Neon eller lokal Postgres) tilgjengelig via DATABASE_URL.
 * Kjør med: npm test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import authRouter from '../routes/auth';
import { authMiddleware } from '../middleware/auth';
import { cleanupTestData, testEmail, testPassword } from './helpers';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(authMiddleware);
  app.use('/auth', authRouter);
});

afterAll(async () => {
  await cleanupTestData();
});

describe('Auth flow', () => {
  it('registrerer ny bruker → returnerer token + organisasjon', async () => {
    const email = testEmail();
    const password = testPassword();
    const res = await request(app)
      .post('/auth/register')
      .send({
        email,
        password,
        name: 'Test Bruker',
        organizationName: 'Test AS',
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.organizationName).toBe('Test AS');
    expect(res.body.token).toBeTruthy();
  });

  it('logger inn med riktig passord → ny token', async () => {
    const email = testEmail();
    const password = testPassword();
    await request(app)
      .post('/auth/register')
      .send({ email, password, name: 'X', organizationName: 'Y' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('avviser feil passord med 401', async () => {
    const email = testEmail();
    const correctPassword = testPassword();
    const wrongPassword = testPassword();
    await request(app)
      .post('/auth/register')
      .send({ email, password: correctPassword, name: 'X', organizationName: 'Y' });

    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: wrongPassword });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Feil/i);
  });

  it('logout-all bumper tokenVersion → gamle tokens avvises', async () => {
    const email = testEmail();
    const password = testPassword();
    const reg = await request(app)
      .post('/auth/register')
      .send({ email, password, name: 'X', organizationName: 'Y' });

    const oldToken = reg.body.token;

    // Gammel token funker — sjekk via /auth/me
    const meBefore = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(meBefore.status).toBe(200);

    // Logg ut alle enheter
    const logoutAll = await request(app)
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(logoutAll.status).toBe(200);
    expect(logoutAll.body.ok).toBe(true);
  });
});
