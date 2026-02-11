import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { connectRedis, createRedisStore } from './db/redis.js';
import { csrfProtection } from './middleware/csrf.js';
import { generalRateLimiter } from './middleware/rateLimit.js';
import authRouter from './routes/auth.js';

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

// Start server
async function startServer() {
  try {
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

    // Apply CSRF protection to all routes (after session middleware)
    app.use(csrfProtection);

    // Apply general rate limiting
    app.use('/api', generalRateLimiter);

    // Mount auth routes
    app.use('/api/auth', authRouter);

    app.listen(config.PORT, () => {
      console.log(`Server running on port ${config.PORT}`);
      console.log(`Environment: ${config.NODE_ENV}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
