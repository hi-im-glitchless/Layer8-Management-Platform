# VBW-Managed Project
This project uses VBW (Vibe Better with Claude Code) for structured development.
## VBW Rules
- **Always use VBW commands** for project work. Do not manually edit files in `.vbw-planning/`.
- **Commit format:** `{type}({scope}): {description}` — types: feat, fix, test, refactor, perf, docs, style, chore.
- **One commit per task.** Each task in a plan gets exactly one atomic commit.
- **Never commit secrets.** Do not stage .env, .pem, .key, credentials, or token files.
- **Plan before building.** Use /vbw:vibe for all lifecycle actions. Plans are the source of truth.
- **Do not fabricate content.** Only use what the user explicitly states in project-defining flows.
## State
- Planning directory: `.vbw-planning/`
- Project: Template AI Engine (Layer8)
- Current: Phase 3 (LLM Integration) — planned, not yet executed
- Completed: Phase 1 (Foundation), Phase 1.1 (UI Polish), Phase 2 (Sanitization), Phase 2.1 (Profile)
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
