# Concerns

## Security
- CSRF protection active (double-submit cookie)
- Rate limiting on auth endpoints
- Argon2id for password hashing (secure parameters)
- Session isolation via Redis
- Sanitization mappings never leave the server
- **Note**: No secrets detected in committed files (.env.example only)

## Technical Debt
- SQLite for development (works, but PostgreSQL needed for production concurrency)
- No frontend tests
- Some GSD gap-closure plans (02-07, 02-08) may have partial fixes committed but not fully verified under VBW
- `uploads/` directory created at runtime, not in .gitignore concerns

## Performance
- spaCy models (~1.1GB) loaded into memory on sanitizer startup
- Single sanitizer instance (no load balancing)
- SQLite write concurrency limitations
- Session stickiness required for Redis if horizontally scaled

## Missing Infrastructure
- No CI/CD pipeline
- No Docker Compose for full-stack dev
- No health checks aggregated across services
- No logging aggregation

## Dependency Risks
- CLIProxyAPI is the primary LLM provider (third-party, subscription-dependent)
- Presidio + spaCy version coupling (model compatibility)
- shadcn/ui components are copy-pasted (manual updates needed)
