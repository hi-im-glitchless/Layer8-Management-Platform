import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireAuth } from '../middleware/auth.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  getAllActiveTerms,
  listTerms,
  createTerm,
  updateTerm,
  deleteTerm,
  bulkCreateTerms,
} from '../services/denyList.js';

const router = Router();

/**
 * GET /api/deny-list/active
 * Get active deny list terms (term strings only)
 * Used by sanitization service - requires auth but not admin
 */
router.get('/active', requireAuth, async (req, res) => {
  try {
    const terms = await getAllActiveTerms();
    res.json({ terms });
  } catch (error) {
    console.error('[deny-list routes] Error getting active terms:', error);
    res.status(500).json({ error: 'Failed to get active terms' });
  }
});

/**
 * GET /api/deny-list
 * List all deny list terms with full details
 * Admin only - for management UI
 */
router.get('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const terms = await listTerms({ includeInactive });
    res.json({ terms });
  } catch (error) {
    console.error('[deny-list routes] Error listing terms:', error);
    res.status(500).json({ error: 'Failed to list terms' });
  }
});

/**
 * POST /api/deny-list
 * Create a new deny list term
 * Admin only
 */
router.post('/', requireRole('ADMIN'), auditMiddleware('deny_list.create'), async (req, res) => {
  try {
    const createSchema = z.object({
      term: z
        .string()
        .min(1, 'Term is required')
        .max(200, 'Term must be 200 characters or less'),
      description: z.string().optional(),
    });

    const validated = createSchema.parse(req.body);
    const userId = (req.session as any).userId;

    const term = await createTerm(
      validated.term,
      validated.description ?? null,
      userId
    );

    res.status(201).json({ term });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues.map((issue) => issue.message),
      });
    }

    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    console.error('[deny-list routes] Error creating term:', error);
    res.status(500).json({ error: 'Failed to create term' });
  }
});

/**
 * PUT /api/deny-list/:id
 * Update a deny list term
 * Admin only
 */
router.put('/:id', requireRole('ADMIN'), auditMiddleware('deny_list.update'), async (req, res) => {
  try {
    const updateSchema = z.object({
      term: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
    });

    const validated = updateSchema.parse(req.body);
    const id = req.params.id as string;

    const term = await updateTerm(id, validated);

    res.json({ term });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues.map((issue) => issue.message),
      });
    }

    if (error instanceof Error && error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    console.error('[deny-list routes] Error updating term:', error);
    res.status(500).json({ error: 'Failed to update term' });
  }
});

/**
 * DELETE /api/deny-list/:id
 * Delete a deny list term
 * Admin only
 */
router.delete('/:id', requireRole('ADMIN'), auditMiddleware('deny_list.delete'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const success = await deleteTerm(id);

    if (!success) {
      return res.status(404).json({ error: 'Term not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('[deny-list routes] Error deleting term:', error);
    res.status(500).json({ error: 'Failed to delete term' });
  }
});

/**
 * POST /api/deny-list/bulk
 * Bulk create deny list terms
 * Admin only
 */
router.post('/bulk', requireRole('ADMIN'), auditMiddleware('deny_list.bulk_create'), async (req, res) => {
  try {
    const bulkSchema = z.object({
      terms: z
        .array(
          z.object({
            term: z.string().min(1).max(200),
            description: z.string().optional(),
          })
        )
        .max(100, 'Maximum 100 terms per bulk request'),
    });

    const validated = bulkSchema.parse(req.body);
    const userId = (req.session as any).userId;

    const result = await bulkCreateTerms(validated.terms, userId);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues.map((issue) => issue.message),
      });
    }

    console.error('[deny-list routes] Error bulk creating terms:', error);
    res.status(500).json({ error: 'Failed to bulk create terms' });
  }
});

export default router;
