/**
 * Share-link integration-tester.
 * Verifiserer at /delt/[token] er privacy-filtrert:
 *   - Eksponerer KUN: tittel, status, klientnavn, milepæler, deadline
 *   - Eksponerer IKKE: matching-rules, time-entries-detaljer, beløp
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import 'express-async-errors';
import authRouter from '../routes/auth';
import sakerRouter from '../routes/saker';
import { authRouter as shareAuthRouter, publicRouter as sharePublicRouter } from '../routes/share';
import { authMiddleware } from '../middleware/auth';
import { cleanupTestData, testEmail } from './helpers';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(authMiddleware);
  app.use('/auth', authRouter);
  app.use('/saker', sakerRouter);
  app.use('/saker', shareAuthRouter);
  app.use('/public', sharePublicRouter);
});

afterAll(async () => {
  await cleanupTestData();
});

describe('Share-link flow', () => {
  it('genererer token, henter offentlig, revokerer', async () => {
    // Setup: lag bruker + sak
    const email = testEmail();
    const reg = await request(app)
      .post('/auth/register')
      .send({ email, password: 'Test123!', name: 'X', organizationName: 'Y' });
    const token = reg.body.token;

    const sak = await request(app)
      .post('/saker')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Delt sak' });

    // Generer share-link
    const share = await request(app)
      .post(`/saker/${sak.body.id}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expiresInDays: 7 });
    expect(share.status).toBe(201);
    expect(share.body.link.token).toBeTruthy();
    expect(share.body.link.token.length).toBeGreaterThanOrEqual(30); // 24 bytes base64url

    const shareToken = share.body.link.token;

    // Public access — uten auth
    const publicRes = await request(app).get(`/public/sak/${shareToken}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.sak.title).toBe('Delt sak');

    // Privacy: matching-rules SKAL IKKE være i public-respons
    expect(publicRes.body.sak.matchingRules).toBeUndefined();
    expect(publicRes.body.sak.hourlyRate).toBeUndefined();

    // Revoker
    const revoke = await request(app)
      .delete(`/saker/${sak.body.id}/share`)
      .set('Authorization', `Bearer ${token}`);
    expect(revoke.status).toBe(200);

    // Etter revoke: 404
    const dead = await request(app).get(`/public/sak/${shareToken}`);
    expect(dead.status).toBe(404);
  });

  it('avviser ugyldig token-format med 404 (ingen DB-treff)', async () => {
    const res = await request(app).get('/public/sak/!!!ugyldig!!!');
    expect(res.status).toBe(404);
  });

  it('avviser kort token (< 16 tegn)', async () => {
    const res = await request(app).get('/public/sak/kort');
    expect(res.status).toBe(404);
  });
});
