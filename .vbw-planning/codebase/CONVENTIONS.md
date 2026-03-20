# Coding Conventions

## Naming
- **Backend files**: camelCase (auth.ts, denyList.ts)
- **Frontend components**: PascalCase (UserManagement.tsx, TOTPSetup.tsx)
- **Frontend features**: camelCase directories (auth/, admin/)
- **Python**: snake_case files and functions, PascalCase classes
- **Routes**: kebab-case URLs (/api/auth/login, /api/deny-list)

## Import Aliases
- `@/` → `./src` in both backend and frontend (tsconfig paths + Vite alias)

## API Patterns
- Express Router per domain (routes/auth.ts, routes/users.ts)
- Thin route handlers delegating to service layer
- Zod validation at route entry
- Consistent JSON response shape
- CSRF token via double-submit cookie (excluded for GET/HEAD/OPTIONS)

## Frontend Patterns
- **Feature modules**: Each domain gets `features/{name}/api.ts` + `features/{name}/hooks.ts`
- **Server state**: TanStack Query hooks wrapping API calls
- **Forms**: React Hook Form + Zod resolvers
- **Route guards**: ProtectedRoute/PublicRoute HOCs
- **Auth state**: `useAuth()` hook with 5-min stale time
- **UI components**: shadcn/ui (Radix primitives + Tailwind)

## Error Handling
- Backend: try-catch in route handlers, global error handler in index.ts
- Frontend: TanStack Query error states, toast notifications via Sonner
- Sanitizer: FastAPI exception handlers, Pydantic validation errors

## Environment Config
- Backend: `.env` → `config.ts` (Zod schema, fail-fast on missing vars)
- Frontend: `.env` → `import.meta.env` (Vite)
- Python: `.env` → `config.py` (Pydantic Settings)

## Commit Format
- `{type}({scope}): {description}` (feat, fix, test, refactor, perf, docs, style, chore)
- Atomic commits per task
