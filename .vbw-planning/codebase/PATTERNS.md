# Recurring Patterns

## Architectural
- **Service layer separation**: Routes → Services → DB/External
- **Middleware chain**: Cross-cutting concerns (auth, audit, CSRF, rate limit)
- **Feature modules**: Frontend `features/{domain}/api.ts + hooks.ts`
- **Domain isolation**: Each service owns its data and logic

## Naming
- Backend: camelCase files, PascalCase types
- Frontend: PascalCase components, camelCase hooks/utils
- Python: snake_case everywhere, PascalCase classes
- URLs: kebab-case

## Quality
- Zod validation at all boundaries (config, routes, forms)
- TanStack Query for server state (no manual fetch)
- Pydantic models for Python request/response
- Environment fail-fast on startup

## Dependency
- `@/` alias for src imports (backend + frontend)
- Feature-scoped API modules prevent circular deps
- Service-to-service via HTTP only (no shared code)

## Concern Patterns
- Security-first: auth before features, audit everything
- GDPR compliance: sanitization mappings never leave server
- Gradual enhancement: SQLite → PostgreSQL, single instance → Docker Compose
