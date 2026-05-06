import { Router } from 'express';

/**
 * Sub-router for board notification routes. Mounted from `board.ts` at
 * `/notifications`. Empty in plan 23-01 — `GET /notifications/unread-count`
 * and `POST /notifications/mark-read` are added by wave-2 plan 05 once the
 * `BoardNotification` model (added in plan 23-01's migration) is wired into
 * the comment / mention flow.
 */
const router = Router();

export default router;
