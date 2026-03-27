import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { connectRedis, createRedisStore } from './db/redis.js';
import { csrfProtection } from './middleware/csrf.js';
import { generalRateLimiter } from './middleware/rateLimit.js';
import { requireFeature } from './middleware/features.js';
import { validateSession } from './middleware/session.js';
import authRouter from './routes/auth.js';
import auditRouter from './routes/audit.js';
import usersRouter from './routes/users.js';
import adminRouter from './routes/admin.js';
import denyListRouter from './routes/denyList.js';
import sanitizationRouter from './routes/sanitization.js';
import profileRouter from './routes/profile.js';
import llmRouter from './routes/llm.js';
import documentsRouter from './routes/documents.js';
import ghostwriterRouter from './routes/ghostwriter.js';
import templateAdapterRouter from './routes/templateAdapter.js';
import executiveReportRouter from './routes/executiveReport.js';
import scheduleRouter from './routes/schedule.js';
import { waitForSanitizer } from './services/sanitization.js';
import { checkGotenbergHealth } from './services/documents.js';
import { initSocket } from './services/socketService.js';

const app = express();

// Trust first proxy (nginx) so secure cookies work behind reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(cookieParser()); // Required for CSRF cookie parsing

// Prevent Cloudflare (or any proxy) from caching API responses
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind requires inline styles
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", config.FRONTEND_URL],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  crossOriginEmbedderPolicy: false, // May interfere with external image loading
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin' },
}));

// Permissions-Policy header (not built into helmet)
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

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
    const documentsDir = path.join(process.cwd(), 'uploads', 'documents');
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.mkdirSync(documentsDir, { recursive: true });

    // Connect to Redis first
    await connectRedis();

    // Configure session middleware after Redis connection
    sessionMiddleware = session({
      store: createRedisStore(),
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true, // Refresh cookie on every request — active users stay logged in
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000, // 8 hours — resets on each request due to rolling
        sameSite: 'lax',
      },
    });

    app.use(sessionMiddleware);

    // Validate session expiry (must run BEFORE activity tracker updates lastActivity)
    app.use(validateSession);

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

    // Mount deny list routes (gated: template adapter support route)
    app.use('/api/deny-list', requireFeature('FEATURE_TEMPLATE_ADAPTER'), denyListRouter);

    // Mount document routes (gated)
    app.use('/api/documents', requireFeature('FEATURE_DOCUMENT_PROCESSING'), documentsRouter);

    // Mount Ghostwriter routes (gated: executive report support route)
    app.use('/api/ghostwriter', requireFeature('FEATURE_EXECUTIVE_REPORT'), ghostwriterRouter);

    // Mount template adapter routes (gated)
    app.use('/api/adapter', requireFeature('FEATURE_TEMPLATE_ADAPTER'), templateAdapterRouter);

    // Mount executive report routes (gated)
    app.use('/api/report', requireFeature('FEATURE_EXECUTIVE_REPORT'), executiveReportRouter);

    // Mount schedule routes
    app.use('/api/schedule', scheduleRouter);

    // Mount sanitization routes (gated: template adapter support route)
    app.use('/api/sanitize', requireFeature('FEATURE_TEMPLATE_ADAPTER'), sanitizationRouter);

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

    // Check Gotenberg availability (optional - don't block server start)
    checkGotenbergHealth().then(health => {
      if (health.available) {
        console.log('[startup] Gotenberg service is available');
      } else {
        console.warn('[startup] Gotenberg service not available - PDF conversion will fail until service starts');
      }
    }).catch(err => {
      console.warn('[startup] Could not check Gotenberg availability:', err.message);
    });

    // Global error handler - log all unhandled errors
    app.use((err: any, req: any, res: any, next: any) => {
      console.error('[GLOBAL ERROR HANDLER]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Create HTTP server and attach Socket.IO
    const httpServer = createServer(app);
    const io = new SocketIO(httpServer, {
      cors: { origin: config.FRONTEND_URL, credentials: true },
    });

    // Share session middleware with Socket.IO
    io.engine.use((req: any, res: any, next: any) => {
      sessionMiddleware(req, res, next);
    });

    // Auth middleware: reject unauthenticated WebSocket connections
    io.use((socket, next) => {
      const sess = (socket.request as any).session;
      if (sess?.userId && sess?.totpVerified && !sess?.awaitingTOTP) {
        return next();
      }
      next(new Error('Unauthorized'));
    });

    // Initialize the socket service singleton
    initSocket(io);

    httpServer.listen(config.PORT, () => {
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
