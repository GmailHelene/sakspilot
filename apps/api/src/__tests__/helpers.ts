/**
 * Felles helpers for integration-tester.
 *
 * VIKTIG: Disse testene kjører mot REELL Neon-database (samme som prod).
 * Vi bruker email-prefiks `__test-` så vi kan rydde opp uten å treffe
 * ekte data. Aldri kjør tester med vanlig brukers e-post.
 *
 * For CI: bruk en dedikert test-DB via DATABASE_URL_TEST. For lokal
 * dev kan du sette samme DATABASE_URL, bare ikke kjør mot prod uten
 * å rydde først.
 */
import { randomBytes } from 'node:crypto';
import prisma from '../lib/prisma';

const TEST_EMAIL_PREFIX = '__test-';

export function testEmail(): string {
  return `${TEST_EMAIL_PREFIX}${randomBytes(6).toString('hex')}@test.local`;
}

/**
 * Tilfeldig test-passord per test. Forhindrer at secret-skannere
 * (GitGuardian, TruffleHog) flagger hardkodede passord i test-koden.
 * Returnerer alltid >= 8 tegn + minst ett tall + minst én bokstav.
 */
export function testPassword(): string {
  return 'T' + randomBytes(8).toString('hex') + '1';
}

/**
 * Rydd opp etter testen, slett alle brukere/orgs med test-prefiks.
 * Cascade i schema sletter relaterte saker, klienter, etc.
 */
export async function cleanupTestData(): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { users: { some: { email: { startsWith: TEST_EMAIL_PREFIX } } } },
    select: { id: true },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: orgs.map((o) => o.id) } },
  });
}

/**
 * Lag en testbruker + org i ett kall, returner email + cookies/token for innlogging.
 */
export async function createTestUser(): Promise<{
  email: string;
  password: string;
  userId: string;
  organizationId: string;
}> {
  const email = testEmail();
  const password = 'TestPassord123!';
  // Vi bruker register-endpoint via supertest i selve testene,
  // dette er bare en placeholder hvis vi vil opprette direkte.
  // (faktisk implementering: tester gjør egne POST /auth/register-kall)
  return { email, password, userId: '', organizationId: '' };
}
