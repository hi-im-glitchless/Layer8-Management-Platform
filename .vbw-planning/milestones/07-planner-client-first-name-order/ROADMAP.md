# Template AI Engine (Layer8) Roadmap

**Goal:** Reverse the name order on the Planner so the **client name comes first and the project name second**, on both the Kanban card and the card detail modal.

**Scope:** 1 phase

## Progress
| Phase | Status | Plans | Tasks | Commits |
|-------|--------|-------|-------|---------|
| 01 | ✓ Complete | 1 | 4 | 5 |

---

## Phase List
- [x] [Phase 1: Planner Client-First Name Order](#phase-1-planner-client-first-name-order)

---

## Phase 1: Planner Client-First Name Order

**Goal:** On the Planner (`/board`), swap the client and project name so the client reads first. Two surfaces are in scope:

1. **Kanban card** (`frontend/src/features/board/components/KanbanCard.tsx:157-174`) — today Row 1 is the project name (`text-lg font-semibold leading-tight line-clamp-2`, with the pin icon beside it) and Row 2 is the client name (`text-sm font-bold leading-tight`, rendered only when present). After the change, Row 1 is the client name and Row 2 the project name, and **the emphasis moves with the position**: the client takes the `text-lg font-semibold` headline treatment, the project drops to `text-sm font-bold`.
2. **Card detail modal** (`frontend/src/features/board/components/CardDetailModal.tsx:507`, `:544-546`) — today `DialogTitle` is the project name and the client name sits in the muted "Client + tags" row below. After the change the modal header leads with the client name and the project name follows, so the modal matches the card.

Constraints that make this small change non-trivial:

- The client is **optional** (`card.project.client?.name`) while the project name always renders with a `'(No project)'` fallback. Moving the client to Row 1 must not leave an empty headline: when a card has no client, the project name must still be the visible headline rather than the card rendering a blank first line.
- The pin indicator (`card.stageLockedBy && !== 'auto'`) currently shares Row 1's flex row with the project name. It must stay top-right, i.e. it moves to whatever row is now first.
- `KanbanCard` is `memo`ised with a hand-written comparator (`KanbanCard.tsx:228-234`) that already compares `project.name`, `project.status`, `project.color`, and `client?.name`. Re-ordering the JSX must not break that comparator's coverage.
- Existing tests assert the current arrangement by name and by class: `KanbanCard.test.tsx:98-102` grabs the "Row-2 client-name `<p>`" by text, and `KanbanCard.test.tsx:273-336` asserts the client name is **bold, small, and carries no inline colour**. These are the regression guards for the deliberate "client colour is illegible on the white card" decision (`KanbanCard.tsx:167-169`) — that decision stands, so the client name must remain uncoloured after moving to Row 1. The tests need updating to the new order/classes without dropping the no-inline-colour guard.
- Not in scope: the schedule grid (`AssignmentCell.tsx:253-254`, `436-437`, `481-482`) and the HTML export (`exportHtml.ts:194-199`) already render `client - project` and are correct as-is. The dashboard `ProjectCard` (`ProjectCard.tsx:51-58`) is a different surface and is left unchanged.

**Deps:** None

**Requirements:** UI/UX, Scheduling/planner (Planner board)

**Success Criteria:**
- A Planner card with both names shows the client name on the first line in the large semibold style and the project name on the second line in the small bold style.
- A Planner card with **no** client still shows the project name as the visible headline — no blank first line, no layout collapse.
- The pin indicator still renders top-right on the first row for a manually-placed card.
- Opening a card's detail modal shows the client name leading the header and the project name after it; a card with no client falls back to the project name in the header without an empty title.
- The client name renders with **no inline colour** on the card (the existing pale-brand-colour legibility guard is preserved).
- `KanbanCard.test.tsx` and `CardDetailModal.test.tsx` are updated to the new order and pass; no other frontend test regresses.
- The schedule grid, the HTML export, and the dashboard project card are byte-identical — this change touches Planner surfaces only.
