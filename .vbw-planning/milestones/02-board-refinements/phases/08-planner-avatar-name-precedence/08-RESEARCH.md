---
phase: "08"
title: "Planner Avatar Name Precedence — use the account's full name for initials"
type: research
confidence: high
---

## Summary

Reported bug: in production, planner/board card avatars show only **one** initial
even though every account has a first and last name. Investigation (this session,
2026-06-11) confirmed the phase-07 two-initial code is **correct** — the defect is a
**name-resolution precedence** problem, not the splitting logic.

Production data example: `User.username = "rmarques"`, `User.displayName = "Rui Marques"`
(full name, two words). Yet the avatar shows `R` and the name renders as `Rui`
everywhere. Root cause: the name-resolution chain prefers the **TeamMember alias**
(`teamMember.displayName`) over the real `user.displayName`, and in production that
alias holds only the first name ("Rui"), shadowing the full "Rui Marques".

This is **planner-only** by user decision — the Schedule keeps its current behaviour.

## Root cause (exact)

`frontend/src/features/board/components/KanbanCard.tsx`:

- `pentesterName()` (line 43–46):
  ```ts
  return tm?.displayName || tm?.user?.displayName || tm?.user?.username || ''
  ```
- `pentesterInitials()` (line 55–62):
  ```ts
  const name = (tm?.displayName || tm?.user?.displayName || tm?.user?.username || '?').trim()
  // ... split on whitespace, first + last initial
  ```

Both try `teamMember.displayName` (an editable **alias**) FIRST. The Prisma schema
documents `TeamMember.displayName` as *"Used for backlog members (e.g. 'Futuro 1')"*
(`backend/prisma/schema.prisma`), and it is set via the Team Management panel
(`frontend/src/features/schedule/components/TeamManagementPanel.tsx:74`
`setAliasValue(member.displayName || '')`). In production these aliases were set to
first names, so for a real member the alias ("Rui") wins over `user.displayName`
("Rui Marques"). Splitting "Rui" yields a single initial → `R`.

The board payload already exposes BOTH fields, so no backend change is needed:
`backend/src/services/boardService.ts:53-54` selects
`teamMember.displayName` and `teamMember.user.displayName`.

## Data model (no firstName/lastName exists)

`User` model fields (schema): `username` (unique), `displayName` (nullable),
`avatarUrl`. No `firstName`, `lastName`, or `email`. The full name lives ONLY in
`User.displayName`. `TeamMember.displayName` is a nullable alias whose legitimate use
is backlog members that have **no linked user** (`TeamMember.userId` null).

## Recommended fix (planner-only)

Flip the precedence so the linked **user's** full name wins, keeping the alias as a
fallback for backlog members (who have no user, so `tm.user?.displayName` is
undefined and the chain correctly falls through to the alias):

```ts
// new chain for BOTH pentesterName() and pentesterInitials():
tm?.user?.displayName || tm?.displayName || tm?.user?.username || <fallback>
```

- Real member "Rui Marques": `tm.user.displayName = "Rui Marques"` → initials `RM`,
  hover `Rui Marques`. ✓
- Backlog member "Futuro 1": `tm.user` is null → falls to `tm.displayName = "Futuro 1"`
  → unchanged. ✓
- Member with a user but no `user.displayName`: falls to alias, then username. ✓

This preserves all phase-07 behaviour (deterministic colour by `teamMemberId`, no
photo, dedupe, cap-3 "+N"); it only changes which name string the initials/hover are
derived from.

## Files to change / not change

- **Change:** `frontend/src/features/board/components/KanbanCard.tsx`
  (`pentesterName` + `pentesterInitials` precedence).
- **Change:** `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx`
  (add a case: a member whose `teamMember.displayName` alias is a single first name
  but `user.displayName` is "First Last" → avatar shows two initials "FL").
- **Do NOT change:** the Schedule (`ScheduleGrid.tsx`, etc.), the shared `avatar.tsx`,
  `constants.ts`, `boardService.ts`, any backend/prisma file. No migration.

## Tests affected

`KanbanCard.test.tsx` — existing phase-07 monogram/colour/no-img assertions stay; add
the alias-shadowing regression (full `user.displayName` beats a single-word alias).

## Edge cases / open questions

- If any alias was an **intentional nickname** (not a truncated first name), this
  override will prefer the formal `user.displayName` on the board. From the production
  sample, aliases appear to be first names, so this is desired. Flag in UAT.
- Single-name accounts (only one token in `user.displayName`) still show one initial —
  correct, there is no last name to show.
- Schedule still shows the alias-first name; out of scope for this planner-only phase.
