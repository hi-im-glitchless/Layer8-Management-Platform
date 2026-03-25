import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as scheduleService from '../services/scheduleService.js';
import * as assignmentService from '../services/assignmentService.js';
import * as absenceService from '../services/absenceService.js';
import * as holidayService from '../services/holidayService.js';
import * as clientService from '../services/clientService.js';
import { VALID_TAGS } from '../services/assignmentService.js';

const router = Router();

// ── Team Members ──────────────────────────────────────────────────

/**
 * GET /team-members
 * List all active team members with user info
 */
router.get('/team-members', requireAuth, readRateLimiter, async (req, res) => {
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
 * Create a new team member (PM+)
 */
router.post('/team-members', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({ userId: z.string().min(1) });
    const data = schema.parse(req.body);
    const teamMember = await scheduleService.createTeamMember(data.userId);
    res.status(201).json({ teamMember });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'This user is already a team member' });
    }
    console.error('[schedule routes] Error creating team member:', error);
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

/**
 * PUT /team-members/reorder
 * Reorder team members (PM+)
 * Must be defined before /:id to avoid route conflict
 */
router.put('/team-members/reorder', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
 * Update a team member (PM+)
 */
router.put('/team-members/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      status: z.string().min(1).optional(),
      displayOrder: z.number().int().min(0).optional(),
      displayName: z.string().max(50).nullable().optional(),
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
 * POST /team-members/add-backlog
 * Add a single backlog ("No Man's Landing") row (PM+)
 */
router.post('/team-members/add-backlog', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const member = await assignmentService.addBacklogMember();
    res.status(201).json({ member });
  } catch (error) {
    console.error('[schedule routes] Error adding backlog member:', error);
    res.status(500).json({ error: 'Failed to add backlog row' });
  }
});

/**
 * DELETE /team-members/:id
 * Archive a team member (ADMIN+)
 */
router.delete('/team-members/:id', requireRole('ADMIN'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    await scheduleService.archiveTeamMember(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[schedule routes] Error archiving team member:', error);
    res.status(500).json({ error: 'Failed to archive team member' });
  }
});

/**
 * DELETE /team-members/backlog/:id
 * Delete a backlog row and its assignments (PM+)
 */
router.delete('/team-members/backlog/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const member = await prisma.teamMember.findUnique({ where: { id } });
    if (!member || !member.isBacklog) {
      res.status(404).json({ error: 'Backlog row not found' });
      return;
    }
    // Delete assignments first, then the member
    await prisma.assignment.deleteMany({ where: { teamMemberId: id } });
    await prisma.teamMember.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[schedule routes] Error deleting backlog member:', error);
    res.status(500).json({ error: 'Failed to delete backlog row' });
  }
});

// ── Assignments ───────────────────────────────────────────────────

/**
 * GET /assignments/me
 * List the authenticated user's assignments filtered by year and optional quarter.
 * Resolves the user's TeamMember record via userId, then delegates to assignmentService.
 * Must be defined before GET /assignments to avoid Express matching "/me" as a param.
 */
router.get('/assignments/me', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      year: z.coerce.number().int().min(2000).max(2100),
      quarter: z.coerce.number().int().min(1).max(4).optional(),
    });
    const params = schema.parse(req.query);

    const teamMember = await prisma.teamMember.findUnique({
      where: { userId: req.session.userId },
    });

    if (!teamMember) {
      return res.status(404).json({ error: 'No team member profile linked to your account' });
    }

    const assignments = await assignmentService.listAssignments({
      ...params,
      teamMemberId: teamMember.id,
    });
    res.json({ assignments });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[schedule routes] Error listing user assignments:', error);
    res.status(500).json({ error: 'Failed to list assignments' });
  }
});

/**
 * GET /assignments
 * List assignments filtered by year and optional quarter
 */
router.get('/assignments', requireAuth, readRateLimiter, async (req, res) => {
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
 * Create or upsert an assignment (PM+)
 */
router.post('/assignments', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
      splitClientId: z.string().cuid().nullable().optional(),
      splitTags: z.array(z.string()).optional(),
      clientId: z.string().cuid().nullable().optional(),
      tags: z.array(z.string()).optional(),
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
 * Swap two assignments (PM+)
 * Must be defined before /:id to avoid route conflict
 */
router.post('/assignments/swap', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
 * Update an assignment (PM+)
 */
router.put('/assignments/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
      splitClientId: z.string().cuid().nullable().optional(),
      splitTags: z.array(z.string()).optional(),
      teamMemberId: z.string().min(1).optional(),
      weekStart: z.string().min(1).optional(),
      clientId: z.string().cuid().nullable().optional(),
      tags: z.array(z.string()).optional(),
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
 * Delete an assignment (PM+), 409 if locked
 */
router.delete('/assignments/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
 * Toggle lock status on an assignment (PM+)
 */
router.post('/assignments/:id/lock', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
router.get('/absences', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      teamMemberId: z.string().min(1).optional(),
      dateStart: z.string().min(1),
      dateEnd: z.string().min(1),
    });
    const params = schema.parse(req.query);

    const isAdmin = req.session.role === 'ADMIN';
    let effectiveTeamMemberId = params.teamMemberId;

    if (!isAdmin) {
      // Look up the requesting user's own TeamMember record
      const ownMember = await prisma.teamMember.findUnique({
        where: { userId: req.session.userId },
        select: { id: true },
      });

      if (params.teamMemberId) {
        // Non-admin requesting another user's absences — verify ownership
        if (!ownMember || params.teamMemberId !== ownMember.id) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } else {
        // No teamMemberId specified — scope to own record
        if (!ownMember) {
          return res.json({ absences: [] });
        }
        effectiveTeamMemberId = ownMember.id;
      }
    }

    const absences = await absenceService.listAbsences({
      teamMemberId: effectiveTeamMemberId,
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
 * Toggle an absence (create if missing, delete if exists) (PM+)
 */
router.post('/absences/toggle', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
router.get('/holidays', requireAuth, readRateLimiter, async (req, res) => {
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
router.post('/holidays', requireRole('ADMIN'), mutationRateLimiter, async (req, res) => {
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
router.put('/holidays/:id', requireRole('ADMIN'), mutationRateLimiter, async (req, res) => {
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
router.delete('/holidays/:id', requireRole('ADMIN'), mutationRateLimiter, async (req, res) => {
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
router.get('/project-colors', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const projectColors = await scheduleService.searchProjectColors(search);
    res.json({ projectColors });
  } catch (error) {
    console.error('[schedule routes] Error searching project colors:', error);
    res.status(500).json({ error: 'Failed to search project colors' });
  }
});

// ── Clients ──────────────────────────────────────────────────────

/**
 * GET /clients
 * List all clients (accessible to all authenticated users)
 */
router.get('/clients', requireAuth, readRateLimiter, async (_req, res) => {
  try {
    const clients = await clientService.listClients();
    res.json({ clients });
  } catch (error) {
    console.error('[schedule routes] Error listing clients:', error);
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

/**
 * POST /clients
 * Create a client (PM+)
 */
router.post('/clients', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    });
    const data = schema.parse(req.body);
    const client = await clientService.createClient(data.name, data.color);
    res.status(201).json({ client });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('[schedule routes] Error creating client:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

/**
 * PUT /clients/:id
 * Update a client (PM+)
 */
router.put('/clients/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    });
    const data = schema.parse(req.body);
    const client = await clientService.updateClient(id, data);
    res.json({ client });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('[schedule routes] Error updating client:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

/**
 * DELETE /clients/:id
 * Delete a client (PM+)
 */
router.delete('/clients/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    await clientService.deleteClient(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[schedule routes] Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// ── Project Tags ─────────────────────────────────────────────────

/**
 * GET /project-tags
 * Return the predefined list of project tags (static, no DB needed)
 */
router.get('/project-tags', requireAuth, readRateLimiter, (_req, res) => {
  res.json({ tags: [...VALID_TAGS] });
});

// ── Delete Entire Schedule ──────────────────────────────────────

/**
 * DELETE /purge
 * Delete all assignments, absences, and project colors (ADMIN only)
 */
router.delete('/purge', requireRole('ADMIN'), mutationRateLimiter, async (req, res) => {
  try {
    const { confirmation } = req.body || {};

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Confirmation text "DELETE" is required' });
    }

    const [assignments, absences, projectColors] = await prisma.$transaction([
      prisma.assignment.deleteMany({}),
      prisma.absence.deleteMany({}),
      prisma.projectColor.deleteMany({}),
    ]);

    res.json({
      success: true,
      deleted: {
        assignments: assignments.count,
        absences: absences.count,
        projectColors: projectColors.count,
      },
    });
  } catch (error) {
    console.error('[schedule routes] Error purging schedule:', error);
    res.status(500).json({ error: 'Failed to purge schedule data' });
  }
});

export default router;
