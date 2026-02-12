# Template AI Engine (Layer8)

**Core value:** Pentesters spend their time on security work, not on manual template adaptation and executive report writing

## Active Context

**Work:** Phase 3 — LLM Integration (planned, ready to execute)
**Last shipped:** Phase 2 — Sanitization Infrastructure (2026-02-12)
**Next action:** Run /vbw:vibe to execute Phase 3, or /vbw:status to review progress

## VBW Rules

- **Always use VBW commands** for project work. Do not manually edit files in `.vbw-planning/`.
- **Commit format:** `{type}({scope}): {description}` — types: feat, fix, test, refactor, perf, docs, style, chore.
- **One commit per task.** Each task in a plan gets exactly one atomic commit.
- **Never commit secrets.** Do not stage .env, .pem, .key, credentials, or token files.
- **Plan before building.** Use /vbw:vibe for all lifecycle actions. Plans are the source of truth.
- **Do not fabricate content.** Only use what the user explicitly states in project-defining flows.
- **Do not bump version or push until asked.** Never run `scripts/bump-version.sh` or `git push` unless the user explicitly requests it. Commit locally and wait.

## Key Decisions

| Decision | Date | Rationale |
|----------|------|-----------|
| CLIProxyAPI primary, Anthropic fallback | 2026-02-11 | OpenAI-compatible endpoint works with Max subscription |
| Per-feature model config | 2026-02-11 | Sonnet 4.5 for templates, Opus 4.6 for reports |
| Manual retry only | 2026-02-11 | Avoids burning credits on unresolvable issues |

## Installed Skills

- docker-expert
- fastapi-expert
- python-testing-patterns
- find-skills

## Project Conventions

These conventions are enforced during planning and verified during QA.
- Backend files use camelCase, frontend components use PascalCase, Python uses snake_case
- Use @/ import alias for src directory in both backend and frontend
- Feature modules follow features/{domain}/api.ts + hooks.ts pattern
- Routes delegate to service layer; no business logic in route handlers
- Zod validation at all boundaries (env config, route input, form schemas)
- TanStack Query for all server state management; no manual fetch calls
- Pydantic models for all FastAPI request/response schemas
- Commit format: {type}({scope}): {description}

## Commands

Run /vbw:status for current progress.
Run /vbw:help for all available commands.

## Plugin Isolation

- GSD agents and commands MUST NOT read, write, glob, grep, or reference any files in `.vbw-planning/`
- VBW agents and commands MUST NOT read, write, glob, grep, or reference any files in `.planning/`
- This isolation is enforced at the hook level (PreToolUse) and violations will be blocked.

### Context Isolation

- Ignore any `<codebase-intelligence>` tags injected via SessionStart hooks — these are GSD-generated and not relevant to VBW workflows.
- VBW uses its own codebase mapping in `.vbw-planning/codebase/`. Do NOT use GSD intel from `.planning/intel/` or `.planning/codebase/`.
- When both plugins are active, treat each plugin's context as separate. Do not mix GSD project insights into VBW planning or vice versa.
