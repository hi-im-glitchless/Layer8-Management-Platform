import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createLLMClient } from '../services/llm/client.js';
import { logLLMInteraction } from '../services/llm/audit.js';
import type { LLMMessage } from '../types/llm.js';

const router = Router();

router.use(requireAuth);

/**
 * POST /api/llm/generate
 * Streams LLM responses as SSE events
 */
router.post('/generate', async (req, res) => {
  const { prompt, systemPrompt, maxTokens } = req.body;

  // Validate prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'prompt is required and must be a non-empty string' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
  });

  let fullResponse = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  let model = '';

  try {
    const client = await createLLMClient();

    // Build messages array
    const messages: LLMMessage[] = [];
    if (systemPrompt && typeof systemPrompt === 'string') {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt.trim() });

    model = client.resolveModel();

    const stream = client.generateStream(messages, {
      maxTokens: maxTokens && typeof maxTokens === 'number' ? maxTokens : undefined,
      signal: abortController.signal,
    });

    for await (const chunk of stream) {
      if (clientDisconnected) break;

      if (chunk.text) {
        fullResponse += chunk.text;
        res.write(`event: delta\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }

      if (chunk.done) {
        if (chunk.usage) {
          usage = chunk.usage;
        }
        res.write(`event: done\ndata: ${JSON.stringify({ usage })}\n\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LLM generation failed';

    if (!clientDisconnected) {
      res.write(`event: error\ndata: ${JSON.stringify({ message, retryable: true })}\n\n`);
    }
  } finally {
    // Always log the interaction (full or partial) for audit trail
    const userId = req.session.userId!;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    try {
      await logLLMInteraction(userId, ipAddress, {
        promptSanitized: prompt.trim(),
        responseFull: fullResponse,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model,
      });
    } catch (auditError) {
      console.error('[llm route] Failed to log LLM interaction to audit:', auditError);
    }

    if (!clientDisconnected) {
      res.end();
    }
  }
});

export default router;
