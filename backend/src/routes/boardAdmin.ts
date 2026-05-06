import { Router } from 'express';

/**
 * Sub-router for board card admin routes. Mounted from `board.ts` at
 * `/cards/:cardId/admin` with `mergeParams: true`. Empty in plan 23-01 — the
 * `POST /cards/:id/archive` (admin archive) endpoint is added by wave-2 plan 05.
 * Schedule isolation reminder: the archive handler MUST NOT write to
 * Assignment / TeamMember / Absence / Holiday tables.
 */
const router = Router({ mergeParams: true });

export default router;
