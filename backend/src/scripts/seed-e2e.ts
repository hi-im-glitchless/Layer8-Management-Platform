/**
 * Seed deterministic users for the Playwright E2E suite.
 *
 * MFA is mandatory in this app (a user with totpEnabled=false is forced through
 * the TOTP-setup wizard on login), so E2E users are seeded with TOTP ALREADY
 * enabled using a fixed shared secret. The Playwright suite generates valid
 * 6-digit codes from that same secret with otplib (see e2e/support/roles.ts).
 *
 * Users created (all: mustResetPassword=false, isActive=true, totpEnabled=true):
 *   e2e_admin / e2e_pm / e2e_normal  — one per role, reused via storageState
 *   e2e_login                        — NORMAL, used ONLY by the fresh-login test
 *                                      so no user logs in twice within the TOTP
 *                                      replay window (per-user, 90s).
 *
 * Idempotent: upserts by username.
 *
 * Usage:  cd backend && npm run seed:e2e   (local dev DB only — never production)
 */

import { prisma } from '../db/prisma.js';
import { hashPassword } from '../services/auth.js';

// Shared password — satisfies complexity policy (>=12, upper/lower/digit/special).
export const E2E_PASSWORD = 'E2eTestPass123!';

// Fixed base32 TOTP secret shared by all E2E users. MUST stay in sync with
// E2E_TOTP_SECRET in e2e/support/roles.ts. Validated against the backend's
// otplib config (ScureBase32Plugin + NobleCryptoPlugin).
export const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export const E2E_USERS = [
  { username: 'e2e_admin', role: 'ADMIN' as const, displayName: 'E2E Admin' },
  { username: 'e2e_pm', role: 'PM' as const, displayName: 'E2E ProjectManager' },
  { username: 'e2e_normal', role: 'NORMAL' as const, displayName: 'E2E Pentester' },
  { username: 'e2e_login', role: 'NORMAL' as const, displayName: 'E2E LoginProbe' },
];

async function main() {
  console.log('🌱 Seeding E2E users (TOTP enabled)...');
  const passwordHash = await hashPassword(E2E_PASSWORD);

  for (const u of E2E_USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        passwordHash,
        role: u.role,
        displayName: u.displayName,
        isActive: true,
        mustResetPassword: false,
        totpEnabled: true,
        totpSecret: E2E_TOTP_SECRET,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        username: u.username,
        passwordHash,
        role: u.role,
        displayName: u.displayName,
        isActive: true,
        mustResetPassword: false,
        totpEnabled: true,
        totpSecret: E2E_TOTP_SECRET,
      },
    });
    console.log(`   ✅ ${user.username} (${user.role})`);
  }

  console.log(`\n   Password: ${E2E_PASSWORD}`);
  console.log(`   TOTP secret: ${E2E_TOTP_SECRET}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ E2E seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
