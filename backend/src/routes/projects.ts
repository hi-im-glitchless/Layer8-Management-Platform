import { Router } from 'express';
import { z } from 'zod';
import * as projectService from '../services/projectService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/projects/search
 *
 * Phase 24-R03 — picker autocomplete for the AssignmentModal. Returns up to
 * 50 projects matching `q` (case-insensitive substring on name) optionally
 * filtered by `clientId`. Used to surface existing Projects when a PM is
 * about to type a project name on a schedule cell — they can pick an
 * existing one to share the Planner card, or skip the picker and create
 * a new Project just by typing.
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      q: z.string().optional(),
      clientId: z.string().optional(),
    });
    const { q, clientId } = schema.parse(req.query);
    const projects = await projectService.searchProjects({
      q,
      clientId: clientId ?? null,
    });
    res.json({ projects });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[projects route] search error:', error);
    res.status(500).json({ error: 'Failed to search projects' });
  }
});

export default router;
