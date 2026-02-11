// Load dotenv BEFORE any other imports to ensure env vars are available
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');
config({ path: envPath });

// Now import Prisma and adapter
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatabaseUrl(): string {
  let dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.warn('DATABASE_URL not set, defaulting to file:./dev.db');
    dbUrl = 'file:./dev.db';
  }

  // Resolve relative file: URLs to absolute paths from backend root
  if (dbUrl.startsWith('file:./') || dbUrl.startsWith('file:../')) {
    const relativePath = dbUrl.replace('file:', '');
    const absolutePath = resolve(join(__dirname, '../..', relativePath));
    dbUrl = `file:${absolutePath}`;
  }

  return dbUrl;
}

const dbUrl = getDatabaseUrl();
const adapter = new PrismaBetterSqlite3({ url: dbUrl });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
    ? ['query', 'error', 'warn']
    : ['error'],
});

if (process.env.NODE_ENV !== 'production' && !process.env.VITEST) {
  globalForPrisma.prisma = prisma;
}

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
