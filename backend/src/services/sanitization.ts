import { redisClient } from '@/db/redis.js';
import { config } from '@/config.js';

// Session TTL to match session cookie maxAge (30 days)
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

/**
 * Detected entity from sanitization
 */
export interface DetectedEntity {
  entityType: string;
  start: number;
  end: number;
  score: number;
  text: string;
  placeholder: string;
}

/**
 * Result from sanitize operation
 */
export interface SanitizeResult {
  sanitizedText: string;
  entities: DetectedEntity[];
  language: string;
  entityCounts: Record<string, number>;
  warning?: string;
}

/**
 * Result from desanitize operation
 */
export interface DesanitizeResult {
  text: string;
  complete: boolean;
  unresolvedPlaceholders: string[];
}

/**
 * Health check response from sanitizer service
 */
interface HealthResponse {
  healthy: boolean;
  models_loaded: boolean;
  supported_languages: string[];
}

/**
 * Check sanitizer service health
 * @returns Health status
 */
export async function checkSanitizerHealth(): Promise<HealthResponse> {
  try {
    const response = await fetch(`${config.SANITIZER_URL}/health`);
    const data = await response.json();

    return {
      healthy: data.healthy || false,
      models_loaded: data.models_loaded || false,
      supported_languages: data.supported_languages || [],
    };
  } catch (error) {
    return {
      healthy: false,
      models_loaded: false,
      supported_languages: [],
    };
  }
}

/**
 * Wait for sanitizer service to be ready
 * @param maxWaitMs Maximum time to wait in milliseconds
 * @param intervalMs Check interval in milliseconds
 * @returns True if ready, false if timeout
 */
export async function waitForSanitizer(
  maxWaitMs = 30000,
  intervalMs = 2000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const health = await checkSanitizerHealth();

    if (health.models_loaded) {
      console.log('[sanitization] Sanitizer service ready');
      return true;
    }

    console.log('[sanitization] Waiting for sanitizer models to load...');
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  console.warn('[sanitization] Sanitizer service readiness timeout');
  return false;
}

/**
 * Sanitize text and store mappings in Redis
 * @param text Text to sanitize
 * @param sessionId Session ID for mapping storage
 * @param denyListTerms Deny list terms to apply
 * @param options Optional language and entity filters
 * @returns Sanitize result
 */
export async function sanitizeText(
  text: string,
  sessionId: string,
  denyListTerms: string[],
  options?: { language?: string; entities?: string[] }
): Promise<SanitizeResult> {
  try {
    // Build request payload
    const payload: any = {
      text,
      session_id: sessionId,
      deny_list_terms: denyListTerms,
    };

    if (options?.language) {
      payload.language = options.language;
    }

    if (options?.entities) {
      payload.entities = options.entities;
    }

    // POST to Python sanitizer service
    const response = await fetch(`${config.SANITIZER_URL}/sanitize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Handle error responses
    if (response.status === 503) {
      throw new Error('Sanitization service not ready -- models still loading');
    }

    if (!response.ok) {
      let errorMessage = 'Sanitization failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.error || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Transform response to our interface
    const entities: DetectedEntity[] = (data.entities || []).map((e: any) => ({
      entityType: e.entity_type,
      start: e.start,
      end: e.end,
      score: e.score,
      text: e.text,
      placeholder: e.placeholder,
    }));

    const result: SanitizeResult = {
      sanitizedText: data.sanitized_text,
      entities,
      language: data.language,
      entityCounts: data.entity_counts || {},
      warning: data.warning,
    };

    // Store mappings in Redis if provided
    if (data.mappings && Object.keys(data.mappings).length > 0) {
      // Compute reverse map (placeholder -> original)
      const reverseMap: Record<string, string> = {};
      for (const [original, placeholder] of Object.entries(data.mappings)) {
        reverseMap[placeholder as string] = original;
      }

      // Store both forward and reverse mappings with counters
      const mappingData = {
        forward: data.mappings,
        reverse: reverseMap,
        counters: data.counters || {},
      };

      const redisKey = `layer8:mappings:${sessionId}`;
      await redisClient.set(redisKey, JSON.stringify(mappingData), {
        EX: SESSION_TTL_SECONDS,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      // Check for connection errors
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        throw new Error('Sanitization service unavailable');
      }
      throw error;
    }
    throw new Error('Sanitization failed');
  }
}

/**
 * Desanitize text using mappings from Redis
 * @param text Text to desanitize
 * @param sessionId Session ID to load mappings
 * @returns Desanitize result
 */
export async function desanitizeText(
  text: string,
  sessionId: string
): Promise<DesanitizeResult> {
  try {
    // Load mappings from Redis
    const redisKey = `layer8:mappings:${sessionId}`;
    const mappingDataStr = await redisClient.get(redisKey);

    if (!mappingDataStr) {
      throw new Error('No mappings found for session -- may have expired');
    }

    const mappingData = JSON.parse(mappingDataStr);
    const reverseMappings = mappingData.reverse || {};

    // POST to Python sanitizer service
    const response = await fetch(`${config.SANITIZER_URL}/desanitize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        session_id: sessionId,
        mappings: reverseMappings,
      }),
    });

    // Handle error responses
    if (response.status === 503) {
      throw new Error('Sanitization service not ready -- models still loading');
    }

    if (!response.ok) {
      let errorMessage = 'Desanitization failed';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.error || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    return {
      text: data.text,
      complete: data.complete || false,
      unresolvedPlaceholders: data.unresolved_placeholders || [],
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check for connection errors
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        throw new Error('Sanitization service unavailable');
      }
      throw error;
    }
    throw new Error('Desanitization failed');
  }
}

/**
 * Get mappings for a session
 * @param sessionId Session ID
 * @returns Mappings or null if not found
 */
export async function getMappings(
  sessionId: string
): Promise<{ forward: Record<string, string>; reverse: Record<string, string> } | null> {
  try {
    const redisKey = `layer8:mappings:${sessionId}`;
    const mappingDataStr = await redisClient.get(redisKey);

    if (!mappingDataStr) {
      return null;
    }

    const mappingData = JSON.parse(mappingDataStr);
    return {
      forward: mappingData.forward || {},
      reverse: mappingData.reverse || {},
    };
  } catch (error) {
    return null;
  }
}

/**
 * Delete mappings for a session
 * @param sessionId Session ID
 * @returns True if deleted
 */
export async function deleteMappings(sessionId: string): Promise<boolean> {
  try {
    const redisKey = `layer8:mappings:${sessionId}`;
    const result = await redisClient.del(redisKey);
    return result > 0;
  } catch (error) {
    return false;
  }
}
