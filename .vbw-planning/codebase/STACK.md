# Tech Stack

Layer8 Management Platform — a multi-service pentest/red-team management platform. Three independently-built services in one repo.

## Services & Languages

| Service | Path | Language | Runtime |
|---------|------|----------|---------|
| Backend API | `backend/` | TypeScript (ESM, `"type":"module"`) | Node 20 (`v20.20.2` via nvm) |
| Frontend SPA | `frontend/` | TypeScript + React 19 | Vite / browser |
| Sanitization service | `sanitization-service/` | Python 3 | FastAPI / uvicorn |

LOC (approx): backend ~21k TS, frontend ~25k TS/TSX, python ~11k.

## Backend (`backend/`)
- **Framework:** Express 5 (`express@^5.2.1`)
- **Realtime:** Socket.IO 4 (`socket.io`) — session-shared auth, used by board + schedule live sync
- **ORM:** Prisma 7 (`@prisma/client@^7.3.0`) with **driver adapters** — SQLite via `@prisma/adapter-better-sqlite3` (also `@prisma/adapter-libsql` present)
- **DB:** SQLite (`DATABASE_URL=file:./dev.db` local; absolute `file:` path in prod)
- **Sessions:** `express-session` + `connect-redis` (Redis required at runtime)
- **Queue:** BullMQ (`bullmq`) on Redis — PDF conversion queue (`services/pdfQueue.ts`)
- **Auth/crypto:** `argon2` (password hashing), `otplib` (TOTP/MFA), `qrcode` (TOTP enrolment QR)
- **Security middleware:** `helmet`, `cors`, `csrf-csrf`, `express-rate-limit` + `rate-limit-redis`, `cookie-parser`
- **Validation:** `zod@^4` (env config + request bodies)
- **AV:** `clamscan` (ClamAV sidecar, port 3310) — bypassable via `DISABLE_VIRUS_SCAN`
- **Docs/AI:** `@anthropic-ai/sdk`, `openai`, `mammoth` (docx→html), `node-html-parser`, `xlsx`
- **Dev:** `tsx` (run/watch TS directly — no build step in dev), `typescript@^5.9`, `vitest@^4`

## Frontend (`frontend/`)
- **Framework:** React 19 + React DOM 19
- **Build:** Vite 6, `@vitejs/plugin-react`
- **Routing:** `react-router-dom@^7`
- **Server state:** `@tanstack/react-query@^5`
- **Forms:** `react-hook-form` + `@hookform/resolvers` + `zod`
- **UI:** Radix UI primitives + shadcn-style `components/ui/*`; `class-variance-authority`, `tailwind-merge`, `clsx`
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`, `@tailwindcss/postcss`, `@tailwindcss/typography`), `tw-animate-css`, `next-themes` (dark mode)
- **DnD:** `@dnd-kit/core` + `@dnd-kit/utilities` (schedule grid + kanban board)
- **Realtime:** `socket.io-client`
- **Docs/markdown:** `react-pdf`, `react-markdown` + `rehype-sanitize`, `streamdown` (LLM streaming render)
- **Toasts:** `sonner`; **Icons:** `lucide-react`
- **Test:** `vitest` + `@testing-library/react` + `jsdom`
- **Lint:** ESLint 9 flat config + `typescript-eslint` + react-hooks/react-refresh plugins

## Sanitization service (`sanitization-service/`)
- **Framework:** FastAPI + uvicorn (`uvicorn[standard]`)
- **PII/NER:** Presidio (`presidio-analyzer`, `presidio-anonymizer`) + spaCy (`en_core_web_lg`, `pt_core_news_lg`), `fast-langdetect`
- **Docx:** `python-docx`, `docxtpl` (Jinja2 templating), `Pillow`, `matplotlib` (charts)
- **Models/validation:** `pydantic` v2 + `pydantic-settings`
- **Test:** `pytest`, `pytest-asyncio`

## Infrastructure / runtime deps
- **Redis** — sessions, rate-limit store, BullMQ queue (`redis://localhost:6379`)
- **Gotenberg 8** (docker, port 3000) — HTML/docx → PDF conversion
- **ClamAV stable** (docker, port 3310) — upload virus scanning
- **nginx** reverse proxy + **systemd** unit (`deploy/nginx-layer8.conf`, `deploy/layer8.service`)
- `docker-compose.yml` provisions only **gotenberg + clamav** (app services run via systemd / `launch-local.sh`)

## Local dev entrypoints
- `launch-local.sh` — start/stop/status backend(3001)+frontend(5173); plus `install`, `rebuild`, `reset-password`, `disable-mfa`, `enable-mfa`, `logs`
- `launcher.sh` — larger full launcher script
- Backend dev: `npm run dev` (`tsx watch`); Frontend dev: `npm run dev` (vite)
