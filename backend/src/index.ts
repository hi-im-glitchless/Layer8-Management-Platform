import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { connectRedis, createRedisStore } from './db/redis.js';
import { csrfProtection } from './middleware/csrf.js';
import { generalRateLimiter } from './middleware/rateLimit.js';
import authRouter from './routes/auth.js';
import auditRouter from './routes/audit.js';
import usersRouter from './routes/users.js';
import adminRouter from './routes/admin.js';
import denyListRouter from './routes/denyList.js';
import sanitizationRouter from './routes/sanitization.js';
import profileRouter from './routes/profile.js';
import llmRouter from './routes/llm.js';
import { waitForSanitizer } from './services/sanitization.js';

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser()); // Required for CSRF cookie parsing

app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
}));

// Session middleware (will be configured after Redis connection)
let sessionMiddleware: express.RequestHandler;

// Health check route (before rate limiting)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// CSRF token endpoint (GET request, not protected by CSRF)
import { generateCsrfToken } from './middleware/csrf.js';
app.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken });
});

// Static file serving for uploads (before rate limiting for performance)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Start server
async function startServer() {
  try {
    // Ensure upload directories exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
    fs.mkdirSync(uploadDir, { recursive: true });

    // Connect to Redis first
    await connectRedis();

    // Configure session middleware after Redis connection
    sessionMiddleware = session({
      store: createRedisStore(),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax',
      },
    });

    app.use(sessionMiddleware);

    // Track session activity (lastActivity, ipAddress) for admin session monitoring
    app.use((req, res, next) => {
      const sess = req.session as any;
      if (sess?.userId) {
        sess.lastActivity = Date.now();
        sess.ipAddress = req.ip || req.socket.remoteAddress || null;
      }
      next();
    });

    // Apply CSRF protection to all routes (after session middleware)
    app.use(csrfProtection);

    // Apply general rate limiting
    app.use('/api', generalRateLimiter);

    // Mount auth routes
    app.use('/api/auth', authRouter);

    // Mount profile routes
    app.use('/api/profile', profileRouter);

    // Mount audit routes
    app.use('/api/audit', auditRouter);

    // Mount user management routes
    app.use('/api/users', usersRouter);

    // Mount admin routes
    app.use('/api/admin', adminRouter);

    // Mount LLM routes
    app.use('/api/llm', llmRouter);

    // Mount deny list routes
    app.use('/api/deny-list', denyListRouter);

    // Mount sanitization routes
    app.use('/api', sanitizationRouter);

    // Check sanitizer service readiness (optional - don't block server start)
    waitForSanitizer(10000, 2000).then(ready => {
      if (ready) {
        console.log('[startup] Sanitizer service is ready');
      } else {
        console.warn('[startup] Sanitizer service not ready - routes will return 503 until service starts');
      }
    }).catch(err => {
      console.warn('[startup] Could not check sanitizer readiness:', err.message);
    });

    // Global error handler - log all unhandled errors
    app.use((err: any, req: any, res: any, next: any) => {
      console.error('[GLOBAL ERROR HANDLER]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    app.listen(config.PORT, () => {
      console.log(`Server running on port ${config.PORT}`);
      console.log(`Environment: ${config.NODE_ENV}`);
      console.log(`Audit chain verification available via: GET /api/audit/verify`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
