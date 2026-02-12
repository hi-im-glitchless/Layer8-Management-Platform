# Tech Stack

## Languages
- **TypeScript** (Backend + Frontend)
- **Python 3.14** (Sanitization Service)

## Backend
- **Runtime**: Node.js with Express
- **ORM**: Prisma (SQLite)
- **Session Store**: Redis (express-session + connect-redis)
- **Auth**: Argon2id password hashing, otplib TOTP, csrf-csrf
- **Build**: TypeScript (tsc), tsx for dev

## Frontend
- **Framework**: React 19
- **Bundler**: Vite 6
- **Styling**: Tailwind CSS 4 + shadcn/ui (Radix primitives)
- **State**: TanStack Query (server state), React Hook Form + Zod (forms)
- **Routing**: React Router v7

## Sanitization Service
- **Framework**: FastAPI (async)
- **NLP**: spaCy (en_core_web_lg, pt_core_news_lg)
- **PII Detection**: Microsoft Presidio (Analyzer + Anonymizer)
- **Language Detection**: fast-langdetect
- **Container**: Docker (uvicorn)

## Infrastructure
- **Database**: SQLite via Prisma (PostgreSQL planned for production)
- **Cache/Sessions**: Redis
- **PDF Rendering**: Gotenberg (planned, Phase 4)
- **Deployment**: Docker Compose (planned, Phase 9)

## Dev Tools
- **Testing**: Vitest (backend), Pytest (Python)
- **Linting**: ESLint (flat config)
- **Path Aliases**: `@/` → `./src` (both backend and frontend)
