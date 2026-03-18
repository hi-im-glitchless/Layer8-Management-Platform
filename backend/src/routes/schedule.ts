import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import * as scheduleService from '../services/scheduleService.js';

const router = Router();

// ── Team Members ──────────────────────────────────────────────────

/**
 * GET /team-members
 * List all active team members with user info
 */
router.get('/team-members', async (req, res) => {
  try {
    const teamMembers = await scheduleService.listTeamMembers();
    res.json({ teamMembers });
  } catch (error) {
    console.error('[schedule routes] Error listing team members:', error);
    res.status(500).json({ error: 'Failed to list team members' });
  }
});

/**
 * POST /team-members
 * Create a new team member (MANAGER+)
 */
router.post('/team-members', requireRole('MANAGER'), async (req, res) => {
  try {
    const schema = z.object({ userId: z.string().min(1) });
    const data = schema.parse(req.body);
    const teamMember = await scheduleService.createTeamMember(data.userId);
    res.status(201).json({ teamMember });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error creating team member:', error);
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

/**
 * PUT /team-members/reorder
 * Reorder team members (MANAGER+)
 * Must be defined before /:id to avoid route conflict
 */
router.put('/team-members/reorder', requireRole('MANAGER'), async (req, res) => {
  try {
    const schema = z.object({
      orderedIds: z.array(z.string().min(1)).min(1),
    });
    const data = schema.parse(req.body);
    await scheduleService.reorderTeamMembers(data.orderedIds);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error reordering team members:', error);
    res.status(500).json({ error: 'Failed to reorder team members' });
  }
});

/**
 * PUT /team-members/:id
 * Update a team member (MANAGER+)
 */
router.put('/team-members/:id', requireRole('MANAGER'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      status: z.string().min(1).optional(),
      displayOrder: z.number().int().min(0).optional(),
    });
    const data = schema.parse(req.body);
    const teamMember = await scheduleService.updateTeamMember(id, data);
    res.json({ teamMember });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error updating team member:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

/**
 * DELETE /team-members/:id
 * Archive a team member (ADMIN+)
 */
router.delete('/team-members/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    await scheduleService.archiveTeamMember(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[schedule routes] Error archiving team member:', error);
    res.status(500).json({ error: 'Failed to archive team member' });
  }
});

export default router;
