---
phase: "07"
title: "Planner Avatar Initials + Deterministic Colour"
type: research
confidence: high
date: 2026-06-11
---

## Summary

Phase 04 already delivered avatars on board cards using shadcn `AvatarGroup` + `Avatar`/`AvatarImage`/`AvatarFallback` at `size="default"`, with a single-initial fallback and `avatarUrl` image. Phase 07 changes only the **board card** rendering: replace the photo/single-initial approach with two-initial monograms (e.g. "Ana Sousa" → "AS") on a deterministically-coloured background derived from the user's `teamMemberId`. The Schedule (`ScheduleGrid.tsx`) must not be touched at all.

The change is **entirely frontend-only, board-only, zero backend work required.** All necessary data (`teamMemberId`, `displayName`, `user.displayName`, `user.username`) is already in the payload. No backend select change, no type change, no migration.

---

## Board avatar render path

**File:** `frontend/src/features/board/components/KanbanCard.tsx`

This file was last updated by Phase 04/05. The current full structure is:

### Helper functions (lines 27–54)

```tsx
// ── Pentester avatar helpers (Phase 04) ─────────────────────────────

function uniquePentesters(assignments: BoardCardAssignment[]): BoardCardAssignment[] {
  const seen = new Map<string, BoardCardAssignment>()
  for (const a of assignments) {
    if (!seen.has(a.teamMemberId)) seen.set(a.teamMemberId, a)
  }
  return Array.from(seen.values())
}

function pentesterName(a: BoardCardAssignment): string {
  const tm = a.teamMember
  return tm?.displayName || tm?.user?.displayName || tm?.user?.username || ''
}

function pentesterInitial(a: BoardCardAssignment): string {
  const tm = a.teamMember
  return (tm?.displayName || tm?.user?.displayName || tm?.user?.username || '?')
    .charAt(0)
    .toUpperCase()
}
```

### Avatar render block (lines 134–167)

```tsx
{/* Row 4: checklist count (left) + pentester avatars (right) (Phase 04) */}
{(() => {
  const pentesters = uniquePentesters(card.assignments)
  const hasChecklist = totalCount > 0
  if (!hasChecklist && pentesters.length === 0) return null
  return (
    <div className="flex items-center justify-between">
      {hasChecklist ? (
        <span className="text-xs text-muted-foreground shrink-0">
          {checkedCount}/{totalCount}
        </span>
      ) : (
        <span />
      )}
      {pentesters.length > 0 && (
        <AvatarGroup className="shrink-0">
          {pentesters.slice(0, 3).map((a) => {
            const name = pentesterName(a)
            const avatarUrl = a.teamMember?.user?.avatarUrl ?? null
            return (
              <Avatar key={a.teamMemberId} size="default" title={name || undefined}>
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name || ''} /> : null}
                <AvatarFallback>{pentesterInitial(a)}</AvatarFallback>
              </Avatar>
            )
          })}
          {pentesters.length > 3 && (
            <AvatarGroupCount>+{pentesters.length - 3}</AvatarGroupCount>
          )}
        </AvatarGroup>
      )}
    </div>
  )
})()}
```

### Memo comparator (lines 172–188)

```tsx
(prev, next) =>
  prev.card.id === next.card.id &&
  prev.card.stage === next.card.stage &&
  prev.card.checklist === next.card.checklist &&
  prev.card.stageLockedBy === next.card.stageLockedBy &&
  prev.card.project.name === next.card.project.name &&
  prev.card.project.status === next.card.project.status &&
  prev.card.project.color === next.card.project.color &&
  prev.card.project.client?.name === next.card.project.client?.name &&
  prev.card.assignments.map((a) => a.teamMemberId + '|' + (a.teamMember?.user?.avatarUrl ?? '')).join() ===
    next.card.assignments.map((a) => a.teamMemberId + '|' + (a.teamMember?.user?.avatarUrl ?? '')).join() &&
  prev.isDragOverlay === next.isDragOverlay &&
  prev.onCardClick === next.onCardClick,
```

**Key observations for Phase 07:**
- The avatar loop currently reads `a.teamMember?.user?.avatarUrl` and conditionally renders `<AvatarImage>`. Phase 07 drops the photo entirely: no `AvatarImage`, no `avatarUrl` read.
- `pentesterInitial()` produces ONE character. Phase 07 needs TWO initials instead.
- `AvatarFallback` currently has no inline `style` or `className` for background colour — it uses the shadcn default (`bg-muted text-muted-foreground`). Phase 07 adds a deterministic inline background colour.
- The memo comparator fingerprint includes `avatarUrl` — since Phase 07 stops using `avatarUrl`, that fingerprint field becomes irrelevant (but harmless to keep; the data is still in the type).
- `size="default"` (32 px) is used today. Phase 07 may keep this or switch to `size="sm"` (24 px); the plan can decide. The original Phase 04 plan specified `size="sm"` but the implementation landed on `size="default"`.

---

## Shared vs board-only components (blast radius)

### Shared shadcn primitives

**File:** `frontend/src/components/ui/avatar.tsx`

Exports: `Avatar`, `AvatarImage`, `AvatarFallback`, `AvatarBadge`, `AvatarGroup`, `AvatarGroupCount`. These are Radix-based primitives with Tailwind styling.

`AvatarFallback` (lines 39–53):
```tsx
function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    />
  )
}
```

The fallback background is `bg-muted` (a CSS variable — neutral grey). **If Phase 07 adds a colour, it must be done via `style={{ backgroundColor: ... }}` or a per-call `className` override passed at the callsite in `KanbanCard.tsx` — NOT by changing `avatar.tsx` itself**, since that would affect every `AvatarFallback` in the codebase including any future schedule refactors.

**The Schedule (`ScheduleGrid.tsx`) does NOT use `avatar.tsx` at all.** It uses a hand-rolled inline pattern (lines 851–858):
```tsx
{member.user?.avatarUrl ? (
  <img src={member.user.avatarUrl} alt="" className="w-9 h-9 rounded-full shrink-0 object-cover" />
) : (
  <div className="w-9 h-9 rounded-full shrink-0 bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">
    {(member.displayName || member.user?.displayName || member.user?.username || '?').charAt(0).toUpperCase()}
  </div>
)}
```

This means **`ScheduleGrid.tsx` is completely isolated from any change in `avatar.tsx` or `KanbanCard.tsx`**. There is zero risk of schedule regression.

### Board-only component

`KanbanCard.tsx` is not imported by any schedule component. Changes there are purely board-scoped.

---

## Card data shape (names available?)

### TypeScript type (frontend/src/features/board/types.ts, lines 43–53)

```ts
export interface BoardCardAssignment {
  assignmentId: string
  teamMemberId: string
  weekStart: string
  side: 'primary' | 'secondary'
  teamMember: {
    userId: string | null
    displayName: string | null
    user: { displayName: string | null; username: string; avatarUrl: string | null } | null
  } | null
}
```

### Name fields — SINGLE string, no first/last split

There is **no `firstName`/`lastName` field anywhere** in `User` or `TeamMember`. The Prisma `User` model (schema.prisma lines 18–42) has:
- `username String @unique` — login handle (e.g. `asousa`, no spaces expected)
- `displayName String?` — free-text display name (e.g. "Ana Sousa", nullable)

`TeamMember` (schema.prisma lines 168–186) has:
- `displayName String?` — override display name used for backlog members (e.g. "Futuro 1")

The fallback chain in KanbanCard is:
```
teamMember.displayName  || teamMember.user.displayName || teamMember.user.username || '?'
```

**Implication for Phase 07 two-initial logic:**
Names must be parsed from a single string. The standard approach: split on whitespace, take the first character of the first token and the first character of the last token (if > 1 token). For single-token names (mononyms, usernames): produce a single initial. For backlog members like "Futuro 1": `F1` (F from "Futuro", 1 from "1") — note the `1` is technically the "last" token. This is acceptable per the spec ("mononym → single initial"); for compound-like names the spec says two initials when two name parts exist.

**Suggested initials logic:**
```ts
function pentesterInitials(a: BoardCardAssignment): string {
  const tm = a.teamMember
  const name = (tm?.displayName || tm?.user?.displayName || tm?.user?.username || '?').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
```

This replaces the existing `pentesterInitial()` (single char). The naming change from `pentesterInitial` → `pentesterInitials` (plural) is all that's needed in the helpers.

---

## Existing colour & initials helpers

### Colour helpers

**No `stringToColor`, `hashColor`, `nameToColor`, or `avatarColor` utility exists anywhere in the codebase.**

The only colour-relevant utilities in the frontend are:
- `frontend/src/features/schedule/components/ColorPalette.tsx` — exports `hslToHex` and `hexToHsl` (HSL ↔ hex conversion for the project colour picker). These are UI-picker helpers, not hashing utilities.
- `frontend/src/features/schedule/constants.ts` — exports `COLOR_PALETTE`: an array of 34 named hex colours used for project colour selection. This is the closest thing to a "fixed palette" in the codebase. Full list:
  ```
  Navy, Coral, Forest, Plum, Teal, Brick, Lavender, Olive, Rose, Cyan, Mint, Crimson,
  Steel, Grape, Sage, Blush, Denim, Emerald, Mauve, Amber, Sunset, Cocoa, Copper,
  Royal Blue, Red, Purple, Hot Pink, Lime, Indigo, Turquoise, Gold,
  Sky, Peach, Lilac, Seafoam, Butter, Sand
  ```
  (34 entries total.) This palette is currently only used by the project/assignment colour picker (`ColorPalette.tsx`). It could be reused for avatar background derivation, or a separate smaller palette (8–12 distinct, accessible colours) could be defined.

- `frontend/src/lib/utils.ts` — only exports `cn()` (clsx + tailwind-merge).

**Conclusion:** Phase 07 must introduce a new deterministic hash-to-colour utility. There is no existing precedent to reuse.

### Initials helpers

The only initials logic in the codebase:

1. **ScheduleGrid.tsx (line 855):** `.charAt(0).toUpperCase()` — single initial from the display-name fallback chain. Inline, not a shared utility.

2. **KanbanCard.tsx (line 50–54):** `pentesterInitial()` — also single initial, same fallback chain. Module-local helper.

**Neither produces two initials.** Phase 07 must extend or replace `pentesterInitial()` in `KanbanCard.tsx`.

### AvatarFallback background

`AvatarFallback` uses `bg-muted` (a Tailwind/CSS variable, resolves to `hsl(var(--muted))`). There is no existing per-avatar background colouring anywhere. Phase 07 needs to override this with `style={{ backgroundColor: derivedColor, color: '#fff' }}` (or similar contrast-safe foreground) passed as `className` or `style` to each `AvatarFallback`.

---

## Recommended approach (planner-only)

### What changes in KanbanCard.tsx

1. **Replace `pentesterInitial()`** with `pentesterInitials()` that produces one or two initials.

2. **Add a `avatarBgColor(teamMemberId: string): string` helper** that hashes the `teamMemberId` (a deterministic cuid string) to one colour from a fixed small palette. Using `teamMemberId` as the hash input (not the name) guarantees stability even if a user changes their display name. Suggested djb2-style hash:
   ```ts
   const AVATAR_PALETTE = [
     '#3B5998', '#E07A5F', '#4A7C59', '#9B5094', '#2E8B8B',
     '#A0522D', '#8B7EC8', '#C76D8E', '#4DA6C9', '#B54555',
     '#6B8294', '#D97706',
   ] as const // 12 entries — covers any realistic team size with good spread

   function avatarBgColor(id: string): string {
     let hash = 0
     for (let i = 0; i < id.length; i++) {
       hash = (hash * 31 + id.charCodeAt(i)) >>> 0
     }
     return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
   }
   ```
   The palette values are drawn from `COLOR_PALETTE` (schedule/constants.ts) — 12 mid-saturation entries that work on white text.

3. **Update the avatar render loop** to:
   - Drop the `avatarUrl` / `AvatarImage` branch entirely (no photos on board cards).
   - Pass `style={{ backgroundColor: avatarBgColor(a.teamMemberId), color: '#fff' }}` to `AvatarFallback`.
   - Render `pentesterInitials(a)` inside `AvatarFallback`.
   - Remove the `AvatarImage` import if no longer used.

4. **Update the memo comparator fingerprint** — since `avatarUrl` is no longer rendered, the fingerprint `a.teamMemberId + '|' + (a.teamMember?.user?.avatarUrl ?? '')` can simplify to just `a.teamMemberId`. The `avatarUrl` field remains in the type (no backend change needed) but is no longer read by the component.

5. **No change to `AvatarGroup`, `AvatarGroupCount`, cap logic (3 + overflow), dedupe logic, `uniquePentesters()`, or `pentesterName()`.** These all stay exactly as Phase 04 left them.

### What does NOT change

- `ScheduleGrid.tsx` — completely untouched. Zero risk.
- `frontend/src/components/ui/avatar.tsx` — no change to the shared primitive.
- `frontend/src/features/board/types.ts` — no change. The `avatarUrl` field stays in the type (not harmful).
- `backend/src/services/boardService.ts` — no change. `avatarUrl` is already selected; it just won't be used by the new card rendering.
- All other board components (`KanbanColumn.tsx`, `CardDetailModal.tsx`, etc.) — untouched.

---

## Files to change / not change

### Must change

| File | What changes |
|------|-------------|
| `frontend/src/features/board/components/KanbanCard.tsx` | Replace `pentesterInitial()` with `pentesterInitials()` (two initials); add `avatarBgColor()` helper + `AVATAR_PALETTE` constant; update avatar loop to drop `AvatarImage`, add `style` on `AvatarFallback`; simplify memo fingerprint |

### Must NOT change (schedule isolation)

| File | Reason |
|------|--------|
| `frontend/src/features/schedule/components/ScheduleGrid.tsx` | Schedule avatars must stay exactly as they are |
| `frontend/src/components/ui/avatar.tsx` | Shared primitive; any change would affect all consumers |
| `frontend/src/features/board/types.ts` | No data gap — existing type already sufficient |
| `backend/src/services/boardService.ts` | No backend change needed |
| `frontend/src/features/schedule/constants.ts` | May READ `COLOR_PALETTE` for palette inspiration but must NOT modify the file |

### Should update

| File | What changes |
|------|-------------|
| `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` | Update avatar tests: assertions that currently rely on avatar images / `avatarUrl` should shift to asserting on initials text content and background colour; add tests for two-initial logic and colour derivation |

---

## Tests affected

### Existing test file

`frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` — currently has 5 test cases (a)–(e) plus a memo re-render suite.

**Cases that need updating for Phase 07:**

- **(a)** Currently asserts `getAllByRole('img')` / `getByAltText` for avatar images. Since Phase 07 removes photos, these queries will break. Update to assert on initials text ("AS", "BO" etc.) instead.
- **(b)** Currently asserts `findByText('F')` (single initial from backlog). Update to two-initials logic — a backlog member named "Futuro 1" would produce "F1" (or "F" if single-token — needs the split logic applied). The test should pass a multi-word `displayName` like "Ana Sousa" and assert "AS", and a mononym like "Alice" and assert "A".
- **(c)** Dedupe by teamMemberId — no change needed (logic unchanged).
- **(d)** Zero assignments — no change needed (logic unchanged).
- **(e)** "+N" overflow — no change needed (logic unchanged).

**New test cases to add:**
- Two-word display name → two-character initials (uppercase).
- Single-word / username → single initial.
- Avatar background colour is deterministic: same `teamMemberId` always yields the same hex.
- No `<img>` element renders for any assignment (photos removed).

**Test framework:** Vitest 4 + `@testing-library/react`, jsdom env, Vitest globals. Run via `npx vitest run` from `frontend/`. Co-located in `__tests__/`. Follow the existing patterns in `KanbanCard.test.tsx`.

---

## Open questions

1. **Size: keep `size="default"` (32 px) or switch to `size="sm"` (24 px)?** The Phase 04 plan specified `sm` but the implementation landed on `default`. With two initials the 32 px size gives more readable text; recommend keeping `default` unless design says otherwise.

2. **Foreground colour on coloured background:** white (`#fff`) works for most of the mid-saturation colours in the palette, but very light entries (Sky `#7DD3FC`, Butter `#FDE68A`, Sand `#E7D5B0`, Peach `#FDBA74`, Seafoam `#86EFAC`) would produce poor contrast. The recommended approach is to use a curated sub-palette of 10–12 darker/mid-saturation colours (not the pale ones) so white text is always safe. The 12-entry `AVATAR_PALETTE` suggestion above uses only the mid-saturation entries and avoids the pastels.

3. **Should `pentesterName()` / `title` attribute still be populated?** Yes — a11y. Even though photos are gone, the name in `title` allows hover identification. Keep `pentesterName()` unchanged.

4. **`avatarUrl` field still in `BoardCardAssignment.teamMember.user`** — it stays in the type and is still fetched by the backend. This is fine; Phase 07 simply stops reading it in the JSX. If a future phase wants to restore photos it's already there.

5. **`AvatarImage` import** — once the photo branch is removed, the `AvatarImage` named import becomes unused. Remove it to avoid an ESLint `no-unused-vars` warning (or the pre-existing DEVN-05 may cover it — confirm at implementation time).
