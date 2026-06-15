---
phase: "10"
title: "Planner card client name — bold + client colour"
type: research
confidence: high
date: 2026-06-15
---

## Summary

The client name is already present on the Kanban card preview and the card detail
modal. The `Client` model in the schema has a `color` (hex) field, and
`boardService.ts` already selects `client.color` in both `listCards` and
`getCard`. The frontend `BoardCard` type already carries `project.client?.color`.
The entire colour pipeline from DB → API payload → TypeScript type is complete —
**no backend change and no migration are needed**.

The only work is a two-line styling change in `KanbanCard.tsx`: make the `<p>`
that renders the client name bold and apply `style={{ color: card.project.client.color }}`
inline, plus add `prev.card.project.client?.color === next.card.project.client?.color`
to the memo comparator so a client-colour edit triggers a re-render.

---

## Where the client name renders

### Card preview — `KanbanCard.tsx`

File: `frontend/src/features/board/components/KanbanCard.tsx`

```
165  {/* Row 2: client name (text) */}
166  {card.project.client?.name && (
167    <p className="text-xs text-muted-foreground">{card.project.client.name}</p>
168  )}
```

- **Line 167** is the exact render site.
- Current styling: `text-xs text-muted-foreground` — small muted grey text.
- No `font-weight` override; inherits regular weight.
- No colour beyond the `text-muted-foreground` CSS variable.

### Card detail modal — `CardDetailModal.tsx`

File: `frontend/src/features/board/components/CardDetailModal.tsx`

```
539  {(project.client?.name || project.tags.length > 0) && (
540    <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
541      {project.client?.name && <span className="font-medium">{project.client.name}</span>}
542  ...
```

- **Line 541** renders the client name inside the detail dialog header area.
- Already has `font-medium` (semi-bold); uses the parent div's `text-muted-foreground`.
- The task says "preview of the cards" — this targets `KanbanCard.tsx` (the Kanban
  board card visible in the planner columns). The detail modal is a separate surface
  and can be left unchanged unless the user later requests it.

### Memo comparator — `KanbanCard.tsx` lines 217–236

The existing comparator at lines 226–228 already guards `project.client?.name`
but does **not** guard `project.client?.color`:

```
228    prev.card.project.client?.name === next.card.project.client?.name &&
```

If `client.color` changes in the backend (e.g. a PM edits the client record), the
card would not re-render without adding the colour guard.

---

## Client colour source

### Schema — `backend/prisma/schema.prisma` lines 274–284

```prisma
model Client {
  id        String   @id @default(cuid())
  name      String   @unique
  color     String   // Hex color code   ← line 277
  ...
}
```

The `Client` model has a non-nullable `color String` (hex). It has always existed;
there is nothing to migrate.

### Board service payload — `backend/src/services/boardService.ts` lines 99–101

```ts
client: { select: { id: true, name: true, color: true } },
```

Both `listCards` (line 101) and `getCard` (line 141, identical select) already
include `color` in the client select. The colour is sent to the frontend in every
board payload.

### Frontend type — `frontend/src/features/board/types.ts` lines 34–36

```ts
client?: { id: string; name: string; color: string } | null
```

`BoardCard.project.client.color` is already typed as `string`. It is available in
`KanbanCard`'s `card` prop with no additional changes needed.

### Schedule — how the colour is used elsewhere

In the Schedule view the `Assignment` type (`frontend/src/features/schedule/types.ts`
lines 102–108) defines `Client` as `{ id, name, color, createdAt, updatedAt }`.
The schedule cell (`AssignmentCell.tsx`) uses the assignment's `projectColor` (the
project's own hex, not the client's colour) as the cell background, and picks
white or near-black text via `getContrastColor` (lines 119–125). The client name
appears only in the tooltip (`ProjectTooltipBlock`, lines 57–76) without any
colour styling — it is just bold foreground text. The client colour (`client.color`)
is stored on `Assignment` but is **not** currently consumed anywhere in the
Schedule UI's rendering code — it is available only as data.

---

## Recommended approach

### What to change

**Only `frontend/src/features/board/components/KanbanCard.tsx`.**

1. **Styling (line 167)** — replace the plain `<p>` with one that applies bold
   weight and the client's hex colour as inline text colour:

   ```tsx
   {card.project.client?.name && (
     <p
       className="text-xs font-bold leading-tight"
       style={{ color: card.project.client.color }}
     >
       {card.project.client.name}
     </p>
   )}
   ```

   - Remove `text-muted-foreground` (that class is what makes it grey; replacing
     it with the inline style gives the client colour).
   - Add `font-bold` (Tailwind weight 700).
   - Keep `text-xs` and add `leading-tight` to match the project name row style.

2. **Memo comparator (around line 228)** — add the colour guard immediately after
   the existing `client?.name` guard:

   ```ts
   prev.card.project.client?.color === next.card.project.client?.color &&
   ```

   This ensures a live client-colour edit (via Socket.IO broadcast → React Query
   refetch) causes the card to re-render with the new colour without a page reload.

### No backend change needed

`client.color` is already selected in `boardService.listCards` and `boardService.getCard`
and is already typed in `BoardCard`. The payload is complete.

### No migration needed

`Client.color` is a non-nullable field with no `@default`; it has existed since the
Client model was introduced. No schema change, no migration, no data backfill.

### Contrast handling

The user's intent ("same colour as the client has") means the text colour of the
client name equals the client's hex. Contrast risks:

- The card background is `bg-card` (the CSS variable, typically white in light
  mode, a dark near-black in dark mode).
- Client hex values are user-chosen and unconstrained — a very light hex (e.g.
  `#FFFACD`) on a white card will be illegible.
- The Schedule's `AssignmentCell` solves this for project-colour backgrounds via
  `getContrastColor` (luminance threshold → `#ffffff` or `#1a1a1a` text). But
  that function picks the **text** colour based on the **background** colour. Here
  the situation is inverted: we want to use the client colour **as** the text
  colour on a known background.
- The Phase-7 AVATAR_PALETTE approach excluded pale colours entirely. That is not
  applicable here because the client colour is a stored DB value, not a computed
  palette index.
- **Recommended handling:** accept the client colour as-is for now, since it is
  user-managed and client colours are typically brand colours (mid-to-dark hues).
  Optionally apply a `drop-shadow` or `text-shadow` only when the computed
  luminance exceeds a threshold — but that is scope creep beyond the stated
  feature. Flag as an open question (see below).

---

## Files to change / not change

### Change

| File | Change |
|------|--------|
| `frontend/src/features/board/components/KanbanCard.tsx` | Restyle line 167 (bold + `style={{ color }}`) and add colour guard to memo comparator |

### Do NOT change

| File | Reason |
|------|--------|
| `backend/src/services/boardService.ts` | `client.color` already selected — no change |
| `backend/prisma/schema.prisma` | No migration needed — field exists |
| `frontend/src/features/board/types.ts` | Type already has `client.color` |
| `frontend/src/features/board/components/CardDetailModal.tsx` | Detail modal is a separate surface; the feature request is for the card preview |
| `frontend/src/features/schedule/components/AssignmentCell.tsx` | Schedule isolation — this milestone must not write to schedule components |
| `frontend/src/components/ui/avatar.tsx` | Avatar is a shared primitive — do not modify |
| Any `Assignment`, `TeamMember`, `Absence`, `Holiday` route/service | Schedule boundary — forbidden by milestone isolation rules |

No backend file needs editing. No migration. No new API endpoint. No new hook.

---

## Edge cases / open questions

1. **No client on the card.** The render is already guarded by `card.project.client?.name &&` —
   if there is no client the element is not rendered at all. The colour guard is
   inside that conditional, so no null-colour crash is possible.

2. **Client has a very pale/white colour.** User-chosen hex values are not
   constrained. A pale client colour on a white `bg-card` will be nearly
   invisible. Options: (a) accept it as a data quality issue for now; (b) add a
   `getContrastColor`-style guard that darkens the colour when luminance is too
   high. Decision should be left to the implementing Dev to confirm with the user.

3. **Dark mode.** In dark mode `bg-card` is a dark surface. A mid-tone client
   colour that reads well in light mode may wash out in dark mode. For now,
   applying the colour as-is is consistent with the project colour accent bar
   (`style={{ backgroundColor: card.project.color }}` line 150), which also uses
   the raw hex without dark-mode adjustment.

4. **Does "client name" appear elsewhere on the card?** On the Kanban card preview,
   no — the client name appears only in Row 2 (line 166–168). The project name
   (Row 1, line 157), status badge (Row 3), and checklist/avatars (Row 4) do not
   reference the client name again.

5. **Client colour change propagation.** The existing Socket.IO board sync
   (`useBoardSync`) broadcasts card updates but not client entity edits. If a PM
   edits a client's colour from outside the board, the change will appear on next
   React Query refetch (page reload or cache invalidation), not in real time. This
   is an existing limitation unrelated to this feature.

6. **"Same colour as the client" — text vs background swatch.** The user's wording
   suggests the text itself is coloured, not a background swatch behind the name.
   The recommendation above treats it as text colour. If a small colour swatch dot
   is preferred instead, that is a different UX. Confirm before implementing.
