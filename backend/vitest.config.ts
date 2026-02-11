import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Load .env file explicitly
config({ path: path.resolve(__dirname, '.env') });

const absoluteDbPath = path.resolve(__dirname, 'dev.db');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: `file:${absoluteDbPath}`,
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      SESSION_SECRET: process.env.SESSION_SECRET || 'test-secret-min-32-chars-required-here',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.ts',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
