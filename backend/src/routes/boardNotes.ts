import { Router } from 'express';

/**
 * Sub-router for board card notes routes. Mounted from `board.ts` at
 * `/cards/:cardId/notes` with `mergeParams: true`. Empty in plan 23-01 — the
 * `PATCH /cards/:id/notes` route is added by wave-2 plan 05 (notes editor).
 * Keeping this file in place lets wave-2 plans modify only their own router
 * file in parallel without touching `board.ts` or each other.
 */
const router = Router({ mergeParams: true });

export default router;
