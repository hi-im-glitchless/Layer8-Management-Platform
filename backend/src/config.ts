import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  DATABASE_URL: z.string().default('file:./dev.db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  SANITIZER_URL: z.string().default('http://localhost:8000'),
  CLIPROXY_BIN_PATH: z.string().default('/usr/local/bin/cli-proxy-api'),
  CLIPROXY_API_KEY: z.string().default('sk-FDnrGKjkakDDsxRcKDByt9hFJiFZSDM7bBz0JkcRytNuD'),
  GOTENBERG_URL: z.string().default('http://localhost:3000'),
  GHOSTWRITER_URL: z.string().url('GHOSTWRITER_URL must be a valid URL').optional(),
  GHOSTWRITER_API_TOKEN: z.string().optional(),
  GHOSTWRITER_REPORT_ID: z.string().optional().transform((v) => v ? Number(v) : undefined),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
