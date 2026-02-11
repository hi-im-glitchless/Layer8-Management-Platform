// Load dotenv BEFORE any other imports to ensure env vars are available
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');
config({ path: envPath });

// Now import Prisma and other dependencies
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Function to create libsql client with DATABASE_URL from env
function createLibSqlClient() {
  // Convert relative file: URL to absolute path
  let dbUrl = process.env.DATABASE_URL || 'file:./dev.db';

  if (dbUrl.startsWith('file:./') || dbUrl.startsWith('file:../')) {
    // Extract the relative path and make it absolute from backend root
    const relativePath = dbUrl.replace('file:', '');
    dbUrl = `file:${join(__dirname, '../..', relativePath)}`;
  }

  return createClient({ url: dbUrl });
}

// Always create fresh adapter (don't use global cache in tests)
const libsql = createLibSqlClient();
const adapter = new PrismaLibSql(libsql);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
    ? ['query', 'error', 'warn']
    : ['error'],
});

// Only cache in non-test environments
if (process.env.NODE_ENV !== 'production' && !process.env.VITEST) {
  globalForPrisma.prisma = prisma;
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
