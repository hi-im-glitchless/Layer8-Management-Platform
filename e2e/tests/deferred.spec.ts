import { test } from '@playwright/test';

/**
 * COVERAGE BACKLOG — the "all use cases" items not yet implemented in the first
 * scaffold pass. Each is marked test.fixme() so it shows up in the report as a
 * known gap (skipped, not failing) and documents exactly what to build next.
 *
 * Most of these need either seeded board/schedule data, a second browser
 * context (realtime), external services (ClamAV/Gotenberg/LLM), or TOTP code
 * generation (otplib is already a dependency for this).
 */

test.describe('DEFERRED — Authentication & MFA', () => {
  test.fixme('first-login onboarding: forced password change + TOTP setup wizard', async () => {});
  test.fixme('TOTP login: enable MFA, then log in entering an otplib-generated code', async () => {});
  test.fixme('trusted-device: rememberDevice skips TOTP on next login', async () => {});
  test.fixme('account lock after 5 failed attempts returns 429 / lock message', async () => {});
  test.fixme('logout clears the session and protected routes redirect to /login', async () => {});
});

test.describe('DEFERRED — Profile', () => {
  test.fixme('edit + save display name persists and reflects in the nav', async () => {});
  test.fixme('upload avatar then delete it (reverts to initials)', async () => {});
  test.fixme('change password requires current password + complexity rules', async () => {});
  test.fixme('setup TOTP: scan QR, verify code, MFA becomes enabled', async () => {});
});

test.describe('DEFERRED — Schedule (PM mutations)', () => {
  test.fixme('create assignment appears in the grid', async () => {});
  test.fixme('edit assignment updates name/color/client', async () => {});
  test.fixme('delete assignment removes it', async () => {});
  test.fixme('swap two assignments swaps their weeks', async () => {});
  test.fixme('lock/unlock assignment blocks editing when locked', async () => {});
  test.fixme('add / remove / reorder team members', async () => {});
  test.fixme('manage clients (create/edit/delete)', async () => {});
  test.fixme('manage holidays (recurring by month/day)', async () => {});
  test.fixme('mark absence (holiday/sick/vacation/other)', async () => {});
  test.fixme('export schedule to HTML downloads a file', async () => {});
});

test.describe('DEFERRED — Board card interactions', () => {
  test.fixme('drag a card between stage columns persists the new stage', async () => {});
  test.fixme('filter by client / pentester narrows visible cards', async () => {});
  test.fixme('show-archived toggle reveals archived cards', async () => {});
  test.fixme('open card detail modal via ?card=<id>', async () => {});
  test.fixme('checklist: add/toggle/remove items persists', async () => {});
  test.fixme('notes editor records last-edited-by metadata', async () => {});
  test.fixme('comments: add, @mention autocomplete, edit (10-min window), soft-delete', async () => {});
  test.fixme('files: upload (DISABLE_VIRUS_SCAN=true), download (audit-logged), delete', async () => {});
  test.fixme('files: quarantined file download is blocked', async () => {});
  test.fixme('archive card via dialog removes it from default view', async () => {});
  test.fixme('PM auto-move advances ready cards to the next stage', async () => {});
});

test.describe('DEFERRED — Admin', () => {
  test.fixme('create user → can log in; edit role/displayName/active', async () => {});
  test.fixme('reset password forces change on next login', async () => {});
  test.fixme('reset/enable MFA regenerates TOTP secret', async () => {});
  test.fixme('delete user cascades sessions/comments/files', async () => {});
  test.fixme('sessions: list active, terminate a session, cleanup', async () => {});
  test.fixme('audit: filter logs, export CSV, verify chain integrity', async () => {});
});

test.describe('DEFERRED — Realtime (Socket.IO)', () => {
  test.fixme('two contexts: card moved by user A appears for user B without refresh', async () => {});
  test.fixme('two contexts: comment/file added by A appears for B', async () => {});
  test.fixme('two contexts: PM schedule change reflects in another client', async () => {});
});

test.describe('DEFERRED — Feature-flagged wizards', () => {
  test.fixme('template-adapter wizard (FEATURE_TEMPLATE_ADAPTER) upload→map→preview→download', async () => {});
  test.fixme('executive-report wizard (FEATURE_EXECUTIVE_REPORT) upload→sanitize→generate', async () => {});
  test.fixme('documents (FEATURE_DOCUMENT_PROCESSING) DOCX/PDF → Gotenberg convert + preview', async () => {});
  test.fixme('disabled feature flags → route is gated (403 / redirect)', async () => {});
});
