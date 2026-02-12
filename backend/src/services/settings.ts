import { prisma } from '../db/prisma.js';

const SINGLETON_ID = 'singleton';

export async function getLlmSettings() {
  return prisma.llmSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

export async function updateLlmSettings(data: {
  cliproxyBaseUrl?: string;
  anthropicApiKey?: string | null;
  defaultModel?: string;
  templateAdapterModel?: string;
  executiveReportModel?: string;
  fallbackEnabled?: boolean;
}) {
  return prisma.llmSettings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  });
}
