import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@/middleware/auth.js';
import {
  sanitizeText,
  desanitizeText,
  checkSanitizerHealth,
  getMappings,
} from '@/services/sanitization.js';
import { getAllActiveTerms } from '@/services/denyList.js';
import { logAuditEvent } from '@/services/audit.js';

const router = Router();

// Validation schemas
const sanitizeSchema = z.object({
  text: z.string().max(500000),
  language: z.string().optional(),
  entities: z.array(z.string()).optional(),
  denyListTerms: z.array(z.string()).optional(),
});

const desanitizeSchema = z.object({
  text: z.string().max(500000),
});

/**
 * POST /api/sanitize
 * Sanitize text with PII detection and deny list terms
 */
router.post('/sanitize', requireAuth, async (req, res) => {
  try {
    const sess = req.session as any;
    const userId = sess.userId;

    // Validate request body
    const validation = sanitizeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.issues,
      });
    }

    const { text, language, entities, denyListTerms } = validation.data;

    // Get global deny list terms
    const globalTerms = await getAllActiveTerms();

    // Merge global terms with per-request terms (deduplicated)
    const requestTerms = denyListTerms || [];
    const mergedTerms = [...new Set([...globalTerms, ...requestTerms])];

    // Call sanitization service
    const result = await sanitizeText(text, req.session.id, mergedTerms, {
      language,
      entities,
    });

    // Log audit event (do NOT log original text or detected entities - security)
    await logAuditEvent({
      userId,
      action: 'sanitize',
      resourceType: 'text',
      resourceId: null,
      details: {
        entityCounts: result.entityCounts,
        language: result.language,
        textLength: text.length,
      },
      ipAddress: req.ip || req.socket.remoteAddress || '',
    });

    // Return result (do NOT include mappings - server-side only)
    res.json({
      sanitizedText: result.sanitizedText,
      entities: result.entities,
      language: result.language,
      entityCounts: result.entityCounts,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[sanitization routes] Sanitize error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not ready')) {
        return res.status(503).json({
          error: 'Sanitization service not ready',
          details: error.message,
        });
      }
      if (error.message.includes('unavailable')) {
        return res.status(503).json({
          error: 'Sanitization service unavailable',
          details: error.message,
        });
      }
    }

    res.status(500).json({
      error: 'Sanitization failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/desanitize
 * Desanitize text using session mappings
 */
router.post('/desanitize', requireAuth, async (req, res) => {
  try {
    const sess = req.session as any;
    const userId = sess.userId;

    // Validate request body
    const validation = desanitizeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.issues,
      });
    }

    const { text } = validation.data;

    // Call desanitization service
    const result = await desanitizeText(text, req.session.id);

    // Log audit event
    await logAuditEvent({
      userId,
      action: 'desanitize',
      resourceType: 'text',
      resourceId: null,
      details: {
        complete: result.complete,
        unresolvedCount: result.unresolvedPlaceholders.length,
        textLength: text.length,
      },
      ipAddress: req.ip || req.socket.remoteAddress || '',
    });

    res.json({
      text: result.text,
      complete: result.complete,
      unresolvedPlaceholders: result.unresolvedPlaceholders,
    });
  } catch (error) {
    console.error('[sanitization routes] Desanitize error:', error);

    if (error instanceof Error) {
      if (error.message.includes('No mappings found')) {
        return res.status(404).json({
          error: 'No mappings found for session',
          details: error.message,
        });
      }
      if (error.message.includes('not ready')) {
        return res.status(503).json({
          error: 'Sanitization service not ready',
          details: error.message,
        });
      }
      if (error.message.includes('unavailable')) {
        return res.status(503).json({
          error: 'Sanitization service unavailable',
          details: error.message,
        });
      }
    }

    res.status(500).json({
      error: 'Desanitization failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sanitize/health
 * Check Python sanitizer service health
 */
router.get('/sanitize/health', requireAuth, async (req, res) => {
  try {
    const health = await checkSanitizerHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/sanitize/mappings
 * Get mapping summary for current session
 */
router.get('/sanitize/mappings', requireAuth, async (req, res) => {
  try {
    const mappings = await getMappings(req.session.id);

    if (!mappings) {
      return res.json({
        hasMappings: false,
        entityCounts: {},
      });
    }

    // Count entities by type from placeholder names (e.g., PERSON_1, EMAIL_1)
    const entityCounts: Record<string, number> = {};
    for (const placeholder of Object.keys(mappings.reverse)) {
      // Extract entity type from placeholder (e.g., "PERSON_1" -> "PERSON")
      const match = placeholder.match(/^([A-Z_]+)_\d+$/);
      if (match) {
        const entityType = match[1];
        entityCounts[entityType] = (entityCounts[entityType] || 0) + 1;
      }
    }

    res.json({
      hasMappings: true,
      entityCounts,
    });
  } catch (error) {
    console.error('[sanitization routes] Get mappings error:', error);
    res.status(500).json({
      error: 'Failed to retrieve mapping summary',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
