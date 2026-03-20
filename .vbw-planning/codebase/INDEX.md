# Codebase Index

## Key Findings
- **3-service monorepo**: Express backend, React SPA, FastAPI sanitizer
- **Auth complete**: Argon2id + TOTP MFA + Redis sessions + CSRF + audit trail
- **Sanitization complete**: Presidio + custom recognizers + deny lists + mapping-based anonymization
- **Phase 3 next**: LLM integration (multi-provider client, SSE streaming, compliance logging)

## Cross-References

| Topic | Primary Doc | Related |
|-------|-------------|---------|
| Tech stack | STACK.md | DEPENDENCIES.md |
| Service communication | ARCHITECTURE.md | STRUCTURE.md |
| Auth flow | ARCHITECTURE.md | CONVENTIONS.md |
| Sanitization pipeline | ARCHITECTURE.md | CONCERNS.md |
| Code organization | STRUCTURE.md | CONVENTIONS.md |
| Test coverage | TESTING.md | CONCERNS.md |

## Validation Notes
- No contradictions found between mapping documents
- Architecture and structure documents are consistent
- Concern about SQLite concurrency aligns with deployment roadmap (Phase 9)
