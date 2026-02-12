import { logAuditEvent } from '../audit.js';

interface LLMInteractionData {
  promptSanitized: string;
  responseFull: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export async function logLLMInteraction(
  userId: string,
  ipAddress: string,
  data: LLMInteractionData,
): Promise<void> {
  await logAuditEvent({
    userId,
    action: 'llm.generate',
    ipAddress,
    details: {
      model: data.model,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      promptLength: data.promptSanitized.length,
      responseLength: data.responseFull.length,
      promptSanitized: data.promptSanitized,
      responseFull: data.responseFull,
    },
  });
}
