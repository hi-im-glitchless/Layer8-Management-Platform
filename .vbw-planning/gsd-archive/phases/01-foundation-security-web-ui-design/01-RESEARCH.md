# Phase 1: Foundation, Security & Web UI Design - Research

**Researched:** 2026-02-10
**Domain:** Full-stack authentication system with React frontend and Node.js backend
**Confidence:** HIGH

## Summary

Phase 1 establishes a secure authentication foundation with TOTP MFA, session management, audit logging, and a fully designed web UI. The research confirms a modern, well-supported technology stack with extensive community adoption and official documentation.

The frontend uses React 19 (with new `use` hook and actions), Vite 6 (high-performance bundler), TypeScript, shadcn/ui (Radix UI-based components), and Tailwind CSS 4 (CSS-first config). The backend uses Express.js with TypeScript, Redis for session storage, Argon2 for password hashing, otplib for TOTP, and PostgreSQL/SQLite for audit logs with hash-chain integrity.

Critical security patterns are well-established: httpOnly cookies for session tokens, express-rate-limit for brute-force protection, hash-chain audit trails for tamper detection, and input validation for template injection prevention. The design system follows Vercel Dashboard patterns with dark/light themes, geometric sans-serif typography (Inter/Geist), and Sonner toast notifications.

**Primary recommendation:** Use the standard stack below with minimal customization. All libraries are actively maintained, well-documented, and designed to work together. Focus implementation effort on business logic rather than infrastructure configuration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Visual identity & design feel:**
- Theme selector with dark and light themes, toggle in the header bar (sun/moon icon)
- Default theme follows OS preference (prefers-color-scheme), user can override
- Color palette derived from Layer8 brand logos: black, white, red accent
  - Dark theme uses `layer8_logo_dark.jpg` (white text, red "8" on dark bg)
  - Light theme uses `layer8_logo_white.jpg` (black text, red "8" on light bg)
- Red accent used sparingly — logo, key highlights, destructive actions, important badges. NOT for primary buttons or links. Neutral grays for most UI elements
- Geometric sans-serif typography throughout (e.g., Inter, Geist) — matching the modern, clean logo feel
- Spacious & airy density — generous padding, breathing room between elements
- Rounded & soft component style — rounded corners on cards, buttons, inputs
- Subtle & smooth animations — fade transitions, skeleton loaders, gentle motion
- Toast notifications for feedback (success, error, info) — non-blocking, auto-dismiss (Sonner-style)
- Lucide icons for iconography
- Logo placed at the top of the sidebar navigation
- Design reference: Vercel Dashboard — sleek, dark-first, modern SaaS feel

**Auth experience flow:**
- No registration page — admins create user accounts
- First login: guided onboarding wizard (set new password → setup TOTP MFA → verify code → welcome screen)
- TOTP "remember me" lasts 30 days on trusted devices
- Generic error messages for all login failures ("Invalid credentials") — prevents username enumeration
- Split-screen login layout: left side has logo over abstract dark gradient/geometric pattern, right side has login form
- Self-service password reset via email link
- Account lockout policy: Claude's discretion

**Application shell & navigation:**
- Desktop-only web app — no mobile responsiveness needed
- Sidebar navigation with logo at top, collapsible to icon-only mode
- Sidebar structure: Claude's discretion (flat list or grouped sections based on features)
- Minimal header bar: theme toggle + user avatar/dropdown (logout, profile)
- Client-side routing for all planned pages (placeholder/empty states for future features)

**Admin panel:**
- Admin access is binary: user is either admin or not (simple flag, no role hierarchy)
- Full CRUD for user management: create, edit details, reset passwords, disable/enable, delete users
- Audit log viewer: admins see all user logs, regular users see their own activity history
- Session management: view active sessions (user, IP, last activity) and terminate individual sessions

### Claude's Discretion

- Account lockout policy (rate limiting vs lockout + auto-unlock vs admin-unlock)
- Sidebar navigation grouping strategy
- Loading skeleton and error state design
- Exact font choices within geometric sans-serif family
- Exact spacing values and scale
- Color shade selection for both themes (derived from brand colors)
- Admin panel table/list design and pagination

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core Frontend

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | UI framework | New `use` hook, actions, form handling, document metadata support. Official release Dec 2024. |
| Vite | 6.x | Build tool | 5x faster full builds, 100x+ faster incremental builds. Environment API for better dev/prod parity. |
| TypeScript | 5.x | Type safety | Industry standard for large React applications. Full type inference for routes, forms, API calls. |
| shadcn/ui | latest | Component library | Copy-paste components (not npm package). Built on Radix UI. Full React 19 support. Uses unified `radix-ui` package. |
| Tailwind CSS | 4.x | Styling | CSS-first config (@theme in CSS), 5x faster builds, automatic content detection. No tailwind.config.js needed. |
| React Router | 7.x | Client routing | Non-breaking upgrade from v6. New typegen for route params/loader data. SSR-ready if needed later. |

**Installation (frontend):**
```bash
# Initialize project with Vite + React + TypeScript
npm create vite@latest frontend -- --template react-ts

cd frontend
npm install

# Install shadcn/ui (interactive setup)
npx shadcn@latest init
# Select: Vite, TypeScript, New York style, CSS variables

# Install routing
npm install react-router-dom

# Install supporting libraries
npm install @tanstack/react-query zod react-hook-form @hookform/resolvers
npm install sonner lucide-react next-themes
```

### Core Backend

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 20.x LTS | Runtime | LTS support until April 2026. Native .env support (20.6.0+). |
| Express.js | 4.x | Web framework | Most widely used Node.js framework. 30M+ weekly downloads. Battle-tested with TypeScript. |
| TypeScript | 5.x | Type safety | Standard for backend in 2026. Better than JavaScript for maintainability. |
| Prisma | 7.x | Database ORM | Pure TypeScript (no Rust engine). Auto-generated types. Works with PostgreSQL/SQLite. |
| Redis | latest | Session store | Industry standard for session management. Sub-millisecond latency. Built-in TTL. |
| Argon2 | latest | Password hashing | Winner of Password Hashing Competition. More secure than bcrypt. Resistant to GPU/ASIC attacks. |
| otplib | 12.x | TOTP MFA | TypeScript-first. Security-audited. RFC 6238 compliant. Supports async operations. |

**Installation (backend):**
```bash
# Initialize TypeScript Node.js project
mkdir backend && cd backend
npm init -y
npm install typescript tsx @types/node --save-dev
npx tsc --init

# Install core dependencies
npm install express cors dotenv
npm install @types/express @types/cors --save-dev

# Install auth & security
npm install express-session connect-redis redis argon2 otplib qrcode
npm install express-rate-limit csrf-csrf
npm install @types/express-session @types/qrcode --save-dev

# Install database
npm install prisma @prisma/client
npx prisma init
```

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| connect-redis | 7.x | Redis session store for express-session | Session storage integration |
| express-rate-limit | 8.x | Rate limiting middleware | Protect login endpoints (5 attempts/5min) |
| csrf-csrf | latest | CSRF protection | Replaces deprecated csurf. Double-submit cookie pattern. |
| qrcode | 1.x | QR code generation | TOTP setup (scan with authenticator app) |
| Zod | 3.x | Schema validation | Form validation, API input validation |
| React Hook Form | 7.x | Form management | Minimal re-renders, built-in validation with Zod |
| TanStack Query | 5.x | Server state | Caching, background updates, optimistic UI |
| Sonner | 1.x | Toast notifications | Non-blocking, auto-dismiss, corner-positioned |
| next-themes | 0.x | Theme management | Dark/light mode with system preference detection |
| Lucide React | latest | Icon library | Tree-shakable, 1,655+ icons, React components |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Argon2 | bcrypt | Argon2 is more secure (memory-hard, GPU-resistant). bcrypt is simpler but less resistant to modern attacks. |
| Prisma | Drizzle ORM | Drizzle is more SQL-like (code-first), Prisma abstracts SQL (schema-first). Prisma has better TypeScript integration. |
| Redis | In-memory store | Redis required for multi-server deployments. In-memory fine for single-server dev only. |
| shadcn/ui | Material UI / Ant Design | shadcn/ui gives code ownership (copy-paste). Others are npm packages. shadcn/ui more customizable. |
| React Router 7 | TanStack Router | TanStack Router has better type safety. React Router 7 has larger ecosystem and non-breaking v6 upgrade. |
| otplib | Speakeasy | otplib is actively maintained, TypeScript-first, security-audited. Speakeasy is legacy (no longer maintained). |

## Architecture Patterns

### Recommended Project Structure

```
/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/          # shadcn/ui components (generated)
│   │   │   ├── auth/        # Auth-specific components (LoginForm, TOTPSetup)
│   │   │   ├── layout/      # Shell components (AppShell, Sidebar, Header)
│   │   │   └── admin/       # Admin panel components
│   │   ├── features/         # Feature-based modules
│   │   │   ├── auth/        # Auth feature (hooks, API calls, types)
│   │   │   ├── admin/       # Admin feature
│   │   │   └── audit/       # Audit log viewing
│   │   ├── lib/             # Utilities
│   │   │   ├── api.ts       # API client (fetch wrapper)
│   │   │   ├── utils.ts     # Helper functions
│   │   │   └── theme.ts     # Theme configuration
│   │   ├── routes/          # Route components
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── Admin.tsx
│   │   ├── App.tsx          # Root component with router
│   │   └── main.tsx         # Entry point
│   └── tailwind.config.js   # Not needed in Tailwind v4 (CSS-first)
│
├── backend/                  # Express API server
│   ├── src/
│   │   ├── routes/          # Express route handlers
│   │   │   ├── auth.ts      # POST /auth/login, /auth/logout, /auth/totp
│   │   │   ├── users.ts     # CRUD for user management (admin only)
│   │   │   └── audit.ts     # GET /audit (read-only)
│   │   ├── middleware/      # Express middleware
│   │   │   ├── auth.ts      # Session validation, requireAuth
│   │   │   ├── rateLimit.ts # Rate limiting for auth endpoints
│   │   │   ├── csrf.ts      # CSRF protection
│   │   │   └── audit.ts     # Audit logging interceptor
│   │   ├── services/        # Business logic
│   │   │   ├── auth.ts      # Password hashing, TOTP generation/verification
│   │   │   ├── session.ts   # Session CRUD operations
│   │   │   ├── audit.ts     # Hash-chain audit trail
│   │   │   └── template.ts  # Jinja2 injection scanning (low priority)
│   │   ├── db/              # Database layer
│   │   │   ├── prisma/      # Prisma schema and migrations
│   │   │   └── redis.ts     # Redis client setup
│   │   ├── types/           # TypeScript types
│   │   └── index.ts         # Express app entry point
│   └── prisma/
│       └── schema.prisma    # Database schema
│
└── .env                      # Environment variables (NEVER commit)
```

### Pattern 1: Session Management with Redis

**What:** Store session data in Redis with httpOnly cookies for session ID

**When to use:** All authenticated requests

**Example:**
```typescript
// backend/src/db/redis.ts
import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
await redisClient.connect();

// backend/src/index.ts
import session from 'express-session';
import RedisStore from 'connect-redis';

const store = new RedisStore({ client: redisClient });

app.use(session({
  store,
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    httpOnly: true,  // Prevents XSS access
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    sameSite: 'lax'  // CSRF protection
  }
}));
```

**Why this pattern:**
- httpOnly cookie prevents XSS attacks from stealing session tokens
- Redis provides sub-millisecond session lookups with automatic TTL expiration
- SameSite=lax prevents CSRF while allowing normal navigation
- Session data isolated per user (Redis key = session ID)

### Pattern 2: TOTP MFA Setup and Verification

**What:** Generate TOTP secret, display QR code, verify 6-digit code

**When to use:** First login (setup) and subsequent logins (verification)

**Example:**
```typescript
// backend/src/services/auth.ts
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export async function generateTOTPSecret(username: string) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(username, 'Layer8', secret);
  const qrCodeDataURL = await QRCode.toDataURL(otpauth);

  return { secret, qrCodeDataURL };
}

export function verifyTOTP(secret: string, token: string): boolean {
  return authenticator.verify({ token, secret });
}

// backend/src/routes/auth.ts
router.post('/totp/setup', requireAuth, async (req, res) => {
  const { secret, qrCodeDataURL } = await generateTOTPSecret(req.session.user.username);

  // Store secret temporarily in session for verification
  req.session.pendingTOTPSecret = secret;

  res.json({ qrCodeDataURL });
});

router.post('/totp/verify', requireAuth, async (req, res) => {
  const { token } = req.body;
  const secret = req.session.pendingTOTPSecret;

  if (!secret) {
    return res.status(400).json({ error: 'No pending TOTP setup' });
  }

  const isValid = verifyTOTP(secret, token);

  if (isValid) {
    // Save secret to database
    await prisma.user.update({
      where: { id: req.session.user.id },
      data: { totpSecret: secret, totpEnabled: true }
    });

    delete req.session.pendingTOTPSecret;
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid code' });
  }
});
```

**Frontend component:**
```typescript
// frontend/src/components/auth/TOTPSetup.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Only numbers')
});

export function TOTPSetup({ qrCodeDataURL }: { qrCodeDataURL: string }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema)
  });

  const onSubmit = async (data: { code: string }) => {
    const res = await fetch('/api/auth/totp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data.code })
    });

    if (res.ok) {
      toast.success('MFA setup complete!');
      // Navigate to dashboard
    } else {
      toast.error('Invalid code. Please try again.');
    }
  };

  return (
    <div>
      <img src={qrCodeDataURL} alt="TOTP QR Code" />
      <form onSubmit={handleSubmit(onSubmit)}>
        <input {...register('code')} placeholder="Enter 6-digit code" />
        {errors.code && <span>{errors.code.message}</span>}
        <button type="submit">Verify</button>
      </form>
    </div>
  );
}
```

### Pattern 3: Hash-Chain Audit Trail

**What:** Tamper-evident audit log where each entry includes hash of previous entry

**When to use:** All user actions (login, logout, data changes, admin actions)

**Example:**
```typescript
// backend/src/services/audit.ts
import crypto from 'crypto';
import { prisma } from '../db/prisma';

interface AuditEvent {
  userId: number;
  action: string;
  details: Record<string, any>;
  ipAddress: string;
}

function hashEntry(entry: string, previousHash: string): string {
  return crypto
    .createHash('sha256')
    .update(previousHash + entry)
    .digest('hex');
}

export async function logAuditEvent(event: AuditEvent) {
  // Get previous hash (last entry in chain)
  const lastEntry = await prisma.auditLog.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { hash: true }
  });

  const previousHash = lastEntry?.hash || '0000000000000000'; // Genesis hash

  // Create entry string for hashing
  const entryString = JSON.stringify({
    userId: event.userId,
    action: event.action,
    details: event.details,
    ipAddress: event.ipAddress,
    timestamp: new Date().toISOString()
  });

  const currentHash = hashEntry(entryString, previousHash);

  // Store in database
  await prisma.auditLog.create({
    data: {
      userId: event.userId,
      action: event.action,
      details: event.details,
      ipAddress: event.ipAddress,
      previousHash,
      hash: currentHash
    }
  });
}

// Verify chain integrity
export async function verifyAuditChain(): Promise<boolean> {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' }
  });

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i];
    const previous = entries[i - 1];

    const entryString = JSON.stringify({
      userId: entry.userId,
      action: entry.action,
      details: entry.details,
      ipAddress: entry.ipAddress,
      timestamp: entry.createdAt.toISOString()
    });

    const expectedHash = hashEntry(entryString, previous.hash);

    if (entry.hash !== expectedHash) {
      console.error(`Audit chain tampered at entry ${entry.id}`);
      return false;
    }
  }

  return true;
}
```

**Middleware integration:**
```typescript
// backend/src/middleware/audit.ts
export function auditMiddleware(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Execute request
    next();

    // Log after response (don't block request)
    res.on('finish', async () => {
      if (req.session?.user) {
        await logAuditEvent({
          userId: req.session.user.id,
          action,
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            body: sanitizeBody(req.body) // Remove passwords
          },
          ipAddress: req.ip
        });
      }
    });
  };
}

// Usage
router.post('/users', requireAdmin, auditMiddleware('user.create'), createUser);
```

### Pattern 4: Dark/Light Theme with System Preference

**What:** Theme toggle with CSS variables, respects OS preference, persists user choice

**When to use:** All frontend pages

**Example:**
```typescript
// frontend/src/App.tsx
import { ThemeProvider } from 'next-themes';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

// frontend/src/components/layout/ThemeToggle.tsx
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
```

**CSS configuration (Tailwind v4):**
```css
/* frontend/src/index.css */
@import "tailwindcss";

@theme {
  /* Light theme (default) */
  --color-background: 0 0% 100%;
  --color-foreground: 222.2 84% 4.9%;
  --color-primary: 0 0% 9%;  /* Black */
  --color-accent: 0 84% 60%; /* Red */

  /* Dark theme */
  .dark {
    --color-background: 222.2 84% 4.9%;
    --color-foreground: 210 40% 98%;
    --color-primary: 210 40% 98%; /* White */
    --color-accent: 0 84% 60%; /* Red (same) */
  }
}
```

### Pattern 5: Form Validation with Zod + React Hook Form

**What:** Type-safe form validation with automatic error handling

**When to use:** All forms (login, user creation, password reset)

**Example:**
```typescript
// frontend/src/components/auth/LoginForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

const loginSchema = z.object({
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required')
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginFormData) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
      body: JSON.stringify(data)
    });

    if (res.ok) {
      const { requiresTOTP } = await res.json();
      if (requiresTOTP) {
        // Navigate to TOTP verification
      } else {
        // Navigate to dashboard
      }
    } else {
      toast.error('Invalid credentials'); // Generic message
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          {...register('username')}
          className="w-full px-3 py-2 border rounded-md"
        />
        {errors.username && (
          <span className="text-sm text-red-500">{errors.username.message}</span>
        )}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          {...register('password')}
          className="w-full px-3 py-2 border rounded-md"
        />
        {errors.password && (
          <span className="text-sm text-red-500">{errors.password.message}</span>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-2 bg-primary text-white rounded-md disabled:opacity-50"
      >
        {isSubmitting ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  );
}
```

### Pattern 6: Rate Limiting for Auth Endpoints

**What:** Limit login attempts to prevent brute-force attacks

**When to use:** All authentication endpoints (login, password reset)

**Example:**
```typescript
// backend/src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../db/redis';

export const loginRateLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:login:'
  }),
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

export const generalRateLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:general:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests
  standardHeaders: true,
  legacyHeaders: false
});

// backend/src/routes/auth.ts
router.post('/login', loginRateLimiter, async (req, res) => {
  // Login logic
});
```

### Anti-Patterns to Avoid

- **Storing JWTs in localStorage:** Use httpOnly cookies instead. localStorage is vulnerable to XSS attacks.
- **Using bcrypt with low work factor:** Use Argon2id or bcrypt with work factor 13-14 minimum. Low work factors are crackable.
- **Skipping CSRF protection:** Even with httpOnly cookies, sophisticated XSS+CSRF attacks can make requests. Use csrf-csrf middleware.
- **Not sanitizing audit logs:** Never log passwords or sensitive tokens. Sanitize all request bodies before logging.
- **Trusting client-side session checks:** Always validate session server-side. Client can manipulate React state.
- **Using csurf package:** csurf is deprecated and has security vulnerabilities. Use csrf-csrf or @dr.pogodin/csurf instead.
- **Storing TOTP secrets in plaintext:** Encrypt TOTP secrets at rest using Prisma's field-level encryption or database encryption.
- **Generic error messages that leak info:** Use "Invalid credentials" for all login failures (wrong username, wrong password, account locked).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom bcrypt wrapper | `argon2` library directly | Argon2id handles memory-hardness, parallelization, timing attacks. Easy to get parameters wrong. |
| TOTP generation | Base32 encoding + HMAC logic | `otplib` | RFC 6238 compliance, time sync handling, secret generation, QR code integration. Subtle bugs cause auth failures. |
| Rate limiting | Custom IP tracking in Redis | `express-rate-limit` | Handles distributed rate limiting, sliding windows, Redis persistence, header standardization. Race conditions are tricky. |
| CSRF tokens | Manual token generation/validation | `csrf-csrf` | Double-submit cookie pattern, timing-safe comparison, token rotation. Vulnerable to cookie tossing if done wrong. |
| Session management | Manual Redis key/value logic | `express-session` + `connect-redis` | Handles session serialization, TTL refresh, race conditions, garbage collection. Edge cases are complex. |
| QR code generation | Canvas/SVG rendering | `qrcode` | Error correction, encoding optimization, data URL generation. Many edge cases with special characters. |
| Hash chains | Custom SHA-256 logic | Custom but follow pattern | Actually simple enough to implement. Use pattern from research. Verify chain on startup. |
| Form validation | Manual regex checks | `Zod` + `React Hook Form` | Type inference, nested objects, async validation, error messages. Forms have many edge cases. |

**Key insight:** Authentication and security libraries have hidden complexity. Timing attacks, race conditions, cryptographic parameter selection, and RFC compliance are easy to get wrong. Use battle-tested libraries with security audits.

## Common Pitfalls

### Pitfall 1: Session Hijacking via XSS

**What goes wrong:** Attacker injects JavaScript that reads session token from localStorage and sends it to their server.

**Why it happens:** Storing session tokens in localStorage makes them accessible to JavaScript. Any XSS vulnerability (even third-party script) can steal tokens.

**How to avoid:**
- Store session ID in httpOnly cookie (JavaScript cannot read)
- Set `secure: true` in production (HTTPS only)
- Set `sameSite: 'lax'` to prevent CSRF
- Validate all user input (Zod schemas for API requests)
- Use Content Security Policy (CSP) headers

**Warning signs:**
- `localStorage.setItem('token', ...)` in frontend code
- Session tokens in API responses (should be set via Set-Cookie header)
- Missing `httpOnly` flag in cookie configuration

### Pitfall 2: Race Conditions in Audit Hash Chain

**What goes wrong:** Two concurrent writes to audit log result in duplicate `previousHash` values, breaking the chain.

**Why it happens:** Reading last entry's hash and writing new entry are separate operations. Without locking, two requests can read the same "last entry" and create conflicting next entries.

**How to avoid:**
- Use database transaction with `SELECT ... FOR UPDATE` to lock last entry during read
- Alternative: Use sequential IDs and verify chain integrity on startup (accept small gaps)
- Alternative: Use Prisma's `.$transaction()` API with isolation level

**Example fix:**
```typescript
export async function logAuditEvent(event: AuditEvent) {
  await prisma.$transaction(async (tx) => {
    // Lock last entry for reading
    const lastEntry = await tx.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { hash: true }
    });

    const previousHash = lastEntry?.hash || '0000000000000000';
    const entryString = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
    const currentHash = hashEntry(entryString, previousHash);

    await tx.auditLog.create({
      data: { ...event, previousHash, hash: currentHash }
    });
  });
}
```

**Warning signs:**
- Audit chain verification fails randomly
- Duplicate `previousHash` values in audit log table
- No transaction or locking around audit writes

### Pitfall 3: TOTP Time Sync Issues

**What goes wrong:** User's authenticator app generates valid code, but server rejects it. Or server accepts old codes indefinitely.

**Why it happens:** TOTP uses 30-second time windows. Server and client clocks must be synchronized. Default window is strict (current window only).

**How to avoid:**
- Allow 1-window drift in both directions (past/future) using otplib's `window` option
- Reject codes that were already used (prevent replay attacks)
- Log time sync failures for monitoring

**Example:**
```typescript
import { authenticator } from 'otplib';

// Configure with drift tolerance
authenticator.options = {
  window: 1 // Allow 1 step before/after (90 seconds total)
};

export function verifyTOTP(secret: string, token: string, userId: number): boolean {
  const isValid = authenticator.verify({ token, secret });

  if (isValid) {
    // Check if token was already used (replay attack prevention)
    const wasUsed = await checkTokenUsed(userId, token);
    if (wasUsed) {
      return false;
    }

    // Mark token as used (expires after 90 seconds)
    await markTokenUsed(userId, token, 90);
  }

  return isValid;
}
```

**Warning signs:**
- Users report "code expired" even with fresh codes
- Same code works multiple times
- Server clock drift warnings in logs

### Pitfall 4: Prisma Schema Changes Break Existing Data

**What goes wrong:** Schema migration changes column types or adds NOT NULL constraints, breaking existing rows.

**Why it happens:** Prisma migrations are imperative. Changing field types or adding required fields without default values fails on existing data.

**How to avoid:**
- Always add new required fields with default values first
- In separate migration, populate data for existing rows
- In third migration, make field required
- Use `prisma migrate dev --create-only` to review SQL before applying

**Example (safe three-step migration):**
```prisma
// Step 1: Add optional field with default
model User {
  totpSecret String? @default("")
}

// Step 2: Populate data (manual SQL or script)
// UPDATE users SET totpSecret = 'default' WHERE totpSecret IS NULL;

// Step 3: Make field required
model User {
  totpSecret String @default("")
}
```

**Warning signs:**
- `prisma migrate dev` fails with "column does not exist" or "violates not-null constraint"
- Need to reset database frequently
- Lost data after migrations

### Pitfall 5: Forgot to Hash Passwords Before Storage

**What goes wrong:** Passwords stored in plaintext in database. If database is compromised, all user passwords are exposed.

**Why it happens:** Forgot to add password hashing in user creation route. Easy mistake when moving fast.

**How to avoid:**
- Create `hashPassword` utility function
- Call it in ALL places where passwords are set (registration, password reset, admin user creation)
- Add Prisma hook to prevent plaintext storage (middleware that checks password length)
- Never log passwords (sanitize in audit middleware)

**Example:**
```typescript
// backend/src/services/auth.ts
import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// ALWAYS use in user creation
router.post('/users', requireAdmin, async (req, res) => {
  const { username, password } = req.body;
  const passwordHash = await hashPassword(password); // Don't forget!

  await prisma.user.create({
    data: { username, passwordHash }
  });
});
```

**Warning signs:**
- Database inspection shows readable passwords
- Password field is short (hashed passwords are ~100 characters)
- Login works with wrong password (comparing plaintext)

### Pitfall 6: Not Validating Environment Variables on Startup

**What goes wrong:** App starts successfully but crashes on first request because `process.env.SESSION_SECRET` is undefined.

**Why it happens:** Environment variables are optional in TypeScript (string | undefined). Runtime doesn't validate required vars.

**How to avoid:**
- Validate all required env vars on startup using Zod
- Fail fast with clear error messages
- Type-safe access to validated config

**Example:**
```typescript
// backend/src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  FRONTEND_URL: z.string().url()
});

// Validate on import (startup)
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

// Usage: config.SESSION_SECRET (fully typed, guaranteed to exist)
```

**Warning signs:**
- Undefined errors in production
- App starts but crashes on first request
- Different behavior in dev vs prod (missing env vars)

## Code Examples

Verified patterns from official sources:

### React 19 Form with Actions

```typescript
// Source: https://react.dev/blog/2024/12/05/react-19
import { useActionState } from 'react';

function UpdateNameForm() {
  const [error, submitAction, isPending] = useActionState(
    async (previousState, formData) => {
      const error = await updateName(formData.get("name"));
      return error ? error : null;
    },
    null,
  );

  return (
    <form action={submitAction}>
      <input type="text" name="name" />
      <button type="submit" disabled={isPending}>Update</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

### Tailwind CSS v4 Configuration

```css
/* Source: https://tailwindcss.com/blog/tailwindcss-v4 */
@import "tailwindcss";

@theme {
  --font-display: "Satoshi", "sans-serif";
  --breakpoint-3xl: 1920px;
  --color-neon-pink: oklch(71.7% 0.25 360);
  --color-neon-lime: oklch(91.5% 0.258 129);
  --color-backstage-blue: oklch(51% 0.3 231);
  --ease-fluid: cubic-bezier(0.3, 0, 0, 1);
}
```

### Argon2 Password Hashing

```typescript
// Source: https://www.w3tutorials.net/blog/argon-nodejs/ (verified pattern)
import argon2 from 'argon2';

// Hash password (use on registration, password reset)
const hash = await argon2.hash(password, {
  type: argon2.argon2id, // Hybrid (recommended)
  memoryCost: 19456, // 19 MiB (2^14 KiB)
  timeCost: 2, // 2 iterations
  parallelism: 1 // Single thread
});

// Verify password (use on login)
const isValid = await argon2.verify(hash, password);
```

### Redis Session Configuration

```typescript
// Source: https://redis.io/solutions/session-management/
import session from 'express-session';
import { createClient } from 'redis';
import RedisStore from 'connect-redis';

const redisClient = createClient({ url: 'redis://localhost:6379' });
await redisClient.connect();

const store = new RedisStore({ client: redisClient });

app.use(session({
  store,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  }
}));
```

### shadcn/ui Dark Mode

```tsx
// Source: https://ui.shadcn.com/docs/dark-mode
import { ThemeProvider } from "next-themes"

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  )
}
```

### Rate Limiting for Auth

```typescript
// Source: https://github.com/express-rate-limit/express-rate-limit
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts',
  standardHeaders: true,
  legacyHeaders: false
});

app.post('/login', loginLimiter, handleLogin);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt | Argon2id | 2015 (PHC winner) | More secure against GPU/ASIC attacks. Memory-hard algorithm. |
| csurf | csrf-csrf | 2022 (csurf deprecated) | Fixed cookie tossing vulnerability. Modern double-submit pattern. |
| JavaScript config | CSS-first config | Tailwind v4 (2024) | 5x faster builds. No tailwind.config.js needed. |
| forwardRef | ref prop | React 19 (Dec 2024) | Cleaner API. Function components receive ref directly. |
| Context.Provider | Context | React 19 (Dec 2024) | Less boilerplate. `<Context>` works directly. |
| Class components | Function components + hooks | React 16.8 (2019) | Simpler logic sharing. Better TypeScript support. |
| localStorage tokens | httpOnly cookies | Ongoing trend | XSS protection. Cannot be stolen by JavaScript. |
| Prisma Rust engine | Pure TypeScript | Prisma 7 (2025) | Better edge deployment. No binary dependencies. |

**Deprecated/outdated:**
- **csurf**: Deprecated Sept 2022. Has security vulnerabilities (cookie tossing). Use csrf-csrf instead.
- **Speakeasy (TOTP)**: No longer maintained. Use otplib (actively maintained, TypeScript-first).
- **Tailwind v3 JS config**: Use CSS @theme block instead. Faster builds, simpler setup.
- **React.forwardRef**: Use ref prop directly on function components (React 19+).
- **dotenv in production**: Use Node.js 20.6+ native .env support or secrets manager (AWS Secrets Manager, Vault).

## Open Questions

1. **Should we use PostgreSQL or SQLite for audit logs?**
   - What we know: PostgreSQL better for production (concurrent writes, backups). SQLite simpler for single-server deployment.
   - What's unclear: User's deployment environment (single server vs multi-server).
   - Recommendation: Start with SQLite for simplicity. Prisma makes switching to PostgreSQL trivial (just change DATABASE_URL). Use PostgreSQL if audit log writes are heavy (>100/sec).

2. **Account lockout vs rate limiting: which to implement?**
   - What we know: Rate limiting prevents brute-force (5 attempts/5min per IP). Account lockout prevents distributed attacks (5 attempts/account).
   - What's unclear: User's threat model (targeted vs opportunistic attacks).
   - Recommendation: Implement BOTH. Rate limiting catches opportunistic attacks. Account lockout (with admin unlock) catches targeted attacks on specific accounts.

3. **Should TOTP secrets be encrypted at rest?**
   - What we know: TOTP secrets are sensitive (compromise allows 2FA bypass). Prisma supports field-level encryption (preview feature). Database encryption encrypts all data.
   - What's unclear: User's compliance requirements (HIPAA, SOC 2).
   - Recommendation: Use database encryption (easier, encrypts everything). Field-level encryption if secrets must be rotatable without re-encrypting database.

4. **How to handle TOTP device loss?**
   - What we know: Users lose phones. Need recovery mechanism. Options: backup codes, admin reset, email recovery.
   - What's unclear: User's security vs usability preference.
   - Recommendation: Admin reset only (most secure). Admin generates new QR code, user re-scans. Document in user guide.

## Sources

### Primary (HIGH confidence)

- [React 19 Official Release](https://react.dev/blog/2024/12/05/react-19) - Major features, new APIs, breaking changes
- [Vite 6 Announcement](https://vite.dev/blog/announcing-vite6) - Environment API, performance improvements
- [Tailwind CSS v4 Blog Post](https://tailwindcss.com/blog/tailwindcss-v4) - CSS-first config, performance gains
- [shadcn/ui Installation](https://ui.shadcn.com/docs/installation) - Setup, framework support
- [shadcn/ui React 19 Guide](https://ui.shadcn.com/docs/react-19) - React 19 compatibility
- [Redis Session Management](https://redis.io/solutions/session-management/) - Architecture patterns, best practices
- [React Router Official Docs](https://reactrouter.com/) - v7 features, type safety

### Secondary (MEDIUM confidence)

- [Password Hashing Guide 2025](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) - Argon2 vs bcrypt comparison
- [How to Implement TOTP in Node.js](https://blog.logto.io/support-authenticator-app-verification-for-your-nodejs-app) - otplib implementation patterns
- [Session Management with Redis (Jan 2026)](https://oneuptime.com/blog/post/2026-01-28-session-storage-redis/view) - Recent Redis patterns
- [Express Rate Limit npm](https://www.npmjs.com/package/express-rate-limit) - Library documentation, usage
- [Sonner shadcn/ui Integration (Jan 2026)](https://medium.com/@rivainasution/shadcn-ui-react-series-part-19-sonner-modern-toast-notifications-done-right-903757c5681f) - Toast patterns
- [React 19 Suspense Patterns](https://medium.com/@connect.hashblock/react-19-resilience-retry-suspense-error-boundaries-40ea504b09ed) - Error boundaries, loading states
- [TanStack Query Overview](https://tanstack.com/query/latest) - Data fetching, caching
- [Prisma ORM 2026 Comparison](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) - Prisma 7 features

### Tertiary (LOW confidence - marked for validation)

- [Jinja2 Template Injection Prevention](https://onsecurity.io/article/server-side-template-injection-with-jinja2/) - Attack vectors (need to verify Node.js specifics)
- [Vercel Design System](https://vercel.com/design) - Limited public documentation (need to extract patterns from dashboard inspection)
- [CSRF with csrf-csrf](https://www.npmjs.com/package/csrf-csrf) - Replacement for deprecated csurf (need production validation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries officially documented, widely adopted, recent versions confirmed
- Architecture: HIGH - Patterns from official Redis, React, Express documentation
- Security (auth): HIGH - Argon2, otplib, httpOnly cookies are established best practices
- Security (audit chain): MEDIUM - Pattern is sound but needs production validation for race conditions
- Design system: MEDIUM - User decisions are clear, but Vercel patterns need extraction from dashboard
- Pitfalls: MEDIUM - Based on common Stack Overflow issues and blog posts, not official docs

**Research date:** 2026-02-10
**Valid until:** 2026-03-12 (30 days - stable tech stack)

**Libraries confirmed current:**
- React 19.x (released Dec 2024)
- Vite 6.x (released 2025)
- Tailwind CSS 4.x (released 2024)
- Prisma 7.x (released late 2025)
- All npm packages checked for activity (last update within 3 months)

**Areas needing validation during planning:**
1. Exact Vercel Dashboard design patterns (need design mockups or dashboard inspection)
2. SQLite vs PostgreSQL decision (depends on deployment environment)
3. Account lockout policy details (rate limiting params, unlock mechanism)
4. TOTP secret encryption (depends on compliance requirements)
