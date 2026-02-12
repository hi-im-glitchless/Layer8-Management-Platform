# Directory Structure

```
Layer8/
├── backend/                        # Express + TypeScript backend
│   ├── prisma/schema.prisma        # DB schema (User, AuditLog, DenyListTerm, TrustedDevice)
│   ├── src/
│   │   ├── config.ts               # Zod-validated env config
│   │   ├── index.ts                # Express entry point
│   │   ├── db/                     # prisma.ts, redis.ts
│   │   ├── middleware/             # auth, audit, csrf, rateLimit
│   │   ├── routes/                 # auth, audit, users, admin, denyList, sanitization, profile
│   │   ├── services/              # auth, session, audit, denyList, sanitization
│   │   ├── scripts/seed-admin.ts
│   │   └── types/express.d.ts
│   └── uploads/avatars/
│
├── frontend/                       # React 19 SPA
│   ├── src/
│   │   ├── App.tsx                 # Root with routing, providers
│   │   ├── components/
│   │   │   ├── layout/            # AppShell, Header, Sidebar, ThemeToggle
│   │   │   ├── admin/             # UserManagement, SessionManagement, AuditLogViewer
│   │   │   ├── auth/TOTPSetup.tsx
│   │   │   └── ui/                # shadcn/ui components
│   │   ├── features/              # Domain modules
│   │   │   ├── auth/              # api.ts + hooks.ts
│   │   │   ├── admin/             # api.ts + hooks.ts
│   │   │   ├── audit/             # api.ts + hooks.ts
│   │   │   └── profile/           # api.ts + hooks.ts
│   │   ├── routes/                # Page components (Login, Dashboard, Admin, Profile, etc.)
│   │   └── lib/                   # api.ts (typed fetch), utils.ts
│   └── public/
│
├── sanitization-service/           # Python FastAPI microservice
│   ├── app/
│   │   ├── main.py                # FastAPI entry (lifespan, CORS)
│   │   ├── config.py              # Pydantic Settings
│   │   ├── health.py              # Health check
│   │   ├── models/                # Pydantic request/response models
│   │   ├── recognizers/           # Custom Presidio recognizers (IP, hostname, domain, AD, network paths)
│   │   ├── operators/             # MappingReplaceOperator
│   │   ├── services/              # sanitizer.py, language_detector.py, deny_list.py
│   │   └── routes/sanitize.py
│   ├── tests/                     # Pytest suite
│   ├── Dockerfile                 # Production image
│   └── Dockerfile.test            # Test image
│
├── .planning/                      # GSD project planning (archived)
├── VISION.md                       # Original project vision document
└── .env.example
```
