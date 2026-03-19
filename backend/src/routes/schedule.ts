import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireRole } from '../middleware/auth.js';
import * as scheduleService from '../services/scheduleService.js';
import * as assignmentService from '../services/assignmentService.js';
import * as absenceService from '../services/absenceService.js';
import * as holidayService from '../services/holidayService.js';

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
 * POST /team-members/init-backlog
 * Initialize 4 backlog ("No Man's Landing") entries if they don't exist (MANAGER+)
 */
router.post('/team-members/init-backlog', requireRole('MANAGER'), async (req, res) => {
  try {
    const backlogMembers = await assignmentService.getOrCreateBacklogMembers(4);
    res.status(201).json({ backlogMembers });
  } catch (error) {
    console.error('[schedule routes] Error initializing backlog members:', error);
    res.status(500).json({ error: 'Failed to initialize backlog members' });
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

// ── Assignments ───────────────────────────────────────────────────

/**
 * GET /assignments
 * List assignments filtered by year and optional quarter
 */
router.get('/assignments', async (req, res) => {
  try {
    const schema = z.object({
      year: z.coerce.number().int().min(2000).max(2100),
      quarter: z.coerce.number().int().min(1).max(4).optional(),
    });
    const params = schema.parse(req.query);
    const assignments = await assignmentService.listAssignments(params);
    res.json({ assignments });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error listing assignments:', error);
    res.status(500).json({ error: 'Failed to list assignments' });
  }
});

/**
 * POST /assignments
 * Create or upsert an assignment (MANAGER+)
 */
router.post('/assignments', requireRole('MANAGER'), async (req, res) => {
  try {
    const schema = z.object({
      teamMemberId: z.string().min(1),
      projectName: z.string().min(1).max(100),
      projectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      status: z.enum(['placeholder', 'needs-reqs', 'confirmed']),
      weekStart: z.string().min(1),
      splitProjectName: z.string().max(100).nullable().optional(),
      splitProjectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
      splitProjectStatus: z.enum(['placeholder', 'needs-reqs', 'confirmed']).nullable().optional(),
    });
    const data = schema.parse(req.body);
    const assignment = await assignmentService.upsertAssignment({
      ...data,
      weekStart: new Date(data.weekStart),
      createdBy: req.session.userId ?? null,
    });
    res.status(201).json({ assignment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Assignment conflict' });
    }
    console.error('[schedule routes] Error creating assignment:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

/**
 * POST /assignments/swap
 * Swap two assignments (MANAGER+)
 * Must be defined before /:id to avoid route conflict
 */
router.post('/assignments/swap', requireRole('MANAGER'), async (req, res) => {
  try {
    const schema = z.object({
      idA: z.string().min(1),
      idB: z.string().min(1),
    });
    const data = schema.parse(req.body);
    await assignmentService.swapAssignments(data.idA, data.idB);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error swapping assignments:', error);
    res.status(500).json({ error: 'Failed to swap assignments' });
  }
});

/**
 * PUT /assignments/:id
 * Update an assignment (MANAGER+)
 */
router.put('/assignments/:id', requireRole('MANAGER'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      projectName: z.string().min(1).max(100).optional(),
      projectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      status: z.enum(['placeholder', 'needs-reqs', 'confirmed']).optional(),
      isLocked: z.boolean().optional(),
      splitProjectName: z.string().max(100).nullable().optional(),
      splitProjectColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
      splitProjectStatus: z.enum(['placeholder', 'needs-reqs', 'confirmed']).nullable().optional(),
      teamMemberId: z.string().min(1).optional(),
      weekStart: z.string().min(1).optional(),
    });
    const data = schema.parse(req.body);
    const updateData: Record<string, unknown> = { ...data, createdBy: req.session.userId ?? null };
    if (data.weekStart) {
      updateData.weekStart = new Date(data.weekStart);
    }
    const assignment = await assignmentService.updateAssignment(id, updateData);
    res.json({ assignment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Error && error.message.includes('locked')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('[schedule routes] Error updating assignment:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

/**
 * DELETE /assignments/:id
 * Delete an assignment (MANAGER+), 409 if locked
 */
router.delete('/assignments/:id', requireRole('MANAGER'), async (req, res) => {
  try {
    const id = req.params.id as string;
    await assignmentService.deleteAssignment(id);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('locked')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('[schedule routes] Error deleting assignment:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

/**
 * POST /assignments/:id/lock
 * Toggle lock status on an assignment (MANAGER+)
 */
router.post('/assignments/:id/lock', requireRole('MANAGER'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const assignment = await assignmentService.toggleLock(id);
    res.json({ assignment });
  } catch (error) {
    console.error('[schedule routes] Error toggling assignment lock:', error);
    res.status(500).json({ error: 'Failed to toggle assignment lock' });
  }
});

// ── Absences ──────────────────────────────────────────────────────

/**
 * GET /absences
 * List absences filtered by date range and optional team member
 */
router.get('/absences', async (req, res) => {
  try {
    const schema = z.object({
      teamMemberId: z.string().min(1).optional(),
      dateStart: z.string().min(1),
      dateEnd: z.string().min(1),
    });
    const params = schema.parse(req.query);
    const absences = await absenceService.listAbsences({
      teamMemberId: params.teamMemberId,
      dateStart: new Date(params.dateStart),
      dateEnd: new Date(params.dateEnd),
    });
    res.json({ absences });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error listing absences:', error);
    res.status(500).json({ error: 'Failed to list absences' });
  }
});

/**
 * POST /absences/toggle
 * Toggle an absence (create if missing, delete if exists) (MANAGER+)
 */
router.post('/absences/toggle', requireRole('MANAGER'), async (req, res) => {
  try {
    const schema = z.object({
      teamMemberId: z.string().min(1),
      date: z.string().min(1),
      type: z.enum(['holiday', 'sick', 'vacation', 'other']),
    });
    const data = schema.parse(req.body);
    const result = await absenceService.toggleAbsence(
      data.teamMemberId,
      new Date(data.date),
      data.type
    );
    res.json({
      absence: result,
      action: result ? 'created' : 'deleted',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error toggling absence:', error);
    res.status(500).json({ error: 'Failed to toggle absence' });
  }
});

// ── Holidays ──────────────────────────────────────────────────────

/**
 * GET /holidays
 * List all holidays
 */
router.get('/holidays', async (req, res) => {
  try {
    const holidays = await holidayService.listHolidays();
    res.json({ holidays });
  } catch (error) {
    console.error('[schedule routes] Error listing holidays:', error);
    res.status(500).json({ error: 'Failed to list holidays' });
  }
});

/**
 * POST /holidays
 * Create a holiday (ADMIN+)
 */
router.post('/holidays', requireRole('ADMIN'), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      isRecurring: z.boolean().default(true),
    });
    const data = schema.parse(req.body);
    const holiday = await holidayService.createHoliday(data);
    res.status(201).json({ holiday });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error creating holiday:', error);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

/**
 * PUT /holidays/:id
 * Update a holiday (ADMIN+)
 */
router.put('/holidays/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      month: z.number().int().min(1).max(12).optional(),
      day: z.number().int().min(1).max(31).optional(),
      isRecurring: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    const holiday = await holidayService.updateHoliday(id, data);
    res.json({ holiday });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error updating holiday:', error);
    res.status(500).json({ error: 'Failed to update holiday' });
  }
});

/**
 * DELETE /holidays/:id
 * Delete a holiday (ADMIN+)
 */
router.delete('/holidays/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    await holidayService.deleteHoliday(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[schedule routes] Error deleting holiday:', error);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

// ── Project Colors ────────────────────────────────────────────────

/**
 * GET /project-colors
 * Search project colors for autocomplete
 */
router.get('/project-colors', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const projectColors = await scheduleService.searchProjectColors(search);
    res.json({ projectColors });
  } catch (error) {
    console.error('[schedule routes] Error searching project colors:', error);
    res.status(500).json({ error: 'Failed to search project colors' });
  }
});

export default router;
