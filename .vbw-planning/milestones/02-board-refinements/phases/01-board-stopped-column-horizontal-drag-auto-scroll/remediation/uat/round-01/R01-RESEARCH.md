---
phase: 1
round: 1
title: "P01-T05 — Two-finger vertical scroll broken on Board (/board)"
type: remediation-research
confidence: high
date: 2026-06-03
---

## Findings

### 1. The scroll container at Board.tsx:270 — current state

```tsx
// Board.tsx lines 248–321 (return block)
<div className="space-y-4">           // ← outermost Board wrapper — NO overflow or height
  ...
  <div className="-mx-6 px-6 overflow-x-auto">    // ← LINE 270: THE PROBLEM
    <DndContext autoScroll={{ threshold: { x: 0.2, y: 0 } }} ...>
      <div className="flex gap-4 min-w-max pb-4">  // ← inner row (wider than viewport)
        {visibleStages.map(...KanbanColumn...)}
      </div>
    </DndContext>
  </div>
  ...
</div>
```

The div at line 270 carries only `overflow-x-auto`. **No explicit height or `overflow-y` class is set on it.**

### 2. CSS spec: `overflow-x: auto` + `overflow-y: visible` → both compute to `auto`

Per the CSS Overflow spec (Level 3, §2.1): when one axis is `auto` or `scroll` and the other axis's computed value would be `visible`, the browser **silently coerces the `visible` axis to `auto`**. This is not a browser bug — it is the specified behavior.

Tailwind `overflow-x-auto` compiles to exactly `overflow-x: auto; ` with `overflow-y` left at its inherited/initial value of `visible`. Because `overflow-x` is `auto`, the `overflow-y: visible` coerces to `overflow-y: auto`.

**Result:** the div at line 270 is, in terms of computed style, an `overflow: auto` box on BOTH axes — even though the author only wrote `overflow-x-auto`. The element becomes a scroll container for both horizontal and vertical scrolling.

### 3. The height chain — why vertical scroll is captured

Working from outermost to innermost:

| Level | Element / Tailwind class | Height behavior |
|---|---|---|
| `html` / `body` | default | natural height (no constraint) |
| `AppShell` outer div | `h-screen overflow-hidden` | **fixed at 100vh** |
| `AppShell` inner div | `flex-1 flex flex-col overflow-hidden` | flex child, fills remaining height, clips overflow |
| `<main>` | `flex-1 overflow-y-auto bg-background p-6` | **flex child, constrained height, owns vertical scroll** |
| `<Board>` return root | `space-y-4` (no height, no overflow) | shrink-wraps content |
| scroll container div | `-mx-6 px-6 overflow-x-auto` | no height → **natural height** |

`AppShell.tsx` (lines 6–19):

```tsx
export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden">   // ← whole-screen flex container, clips
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background p-6">  // ← THIS is the page scroller
          <Outlet />     // ← Board renders here
        </main>
      </div>
    </div>
  )
}
```

The `<main>` element is a constrained-height flex child (`flex-1` inside `h-screen overflow-hidden`). Its computed height is the viewport height minus the header height. It has `overflow-y: auto`, making it the **intended page-level vertical scroll container**.

The board scroll container div (line 270) is a descendant of `<main>`. It has no height set, so its height is determined by its content — the `min-w-max` inner row and the `KanbanColumn` children.

`KanbanColumn` (lines 20–53 of KanbanColumn.tsx):

```tsx
<div className="w-80 flex-shrink-0 flex flex-col">
  ...header...
  <div ref={setNodeRef} className="flex-1 overflow-y-auto space-y-2 p-2 rounded-lg ...">
    {cards.map(KanbanCard)}
  </div>
</div>
```

The column wrapper is `flex flex-col` with no height constraint. The card-list body is `flex-1 overflow-y-auto`. **But `flex-1` only stretches to fill available space when the flex parent has a definite height.** The column wrapper has no height, so `flex-1` shrinks-wraps to the card-list content. `overflow-y-auto` on the card list does nothing useful either — there is no height cap to trigger overflow.

**The net effect:** The board's scroll container div (line 270) shrink-wraps to the full natural height of the tallest column. When there are many cards, this div is **tall** — taller than the `<main>` viewport. The `<main>` element is what should scroll vertically to reveal more cards.

**Now add the CSS-spec coercion:** because the board scroll container div has `overflow-x: auto` (from `overflow-x-auto`), its `overflow-y` is coerced to `auto`. The browser sees a tall content inside a container that has been made into an `overflow: auto` box. Even though the div has no explicit height, if its content's natural height exceeds its own "layout height" (which can happen inside a flex column when flex-1 distributes space), the browser may consider it the scroll container for vertical wheel events.

**The critical observation:** On most desktop configurations (mouse), the board's scroll container div is taller than the viewport in `<main>`, so the div's own height is not constrained — it expands, `<main>` is what overflows, and vertical scroll on `<main>` still works. But on a **laptop with a trackpad**, `<main>` is itself a flex child constrained to the viewport. When the user two-finger scrolls, the browser's heuristic for scroll target selection starts at the topmost element under the pointer and walks up the stack to find a scroll container. It finds the board div (line 270) first. The div is `overflow: auto` on both axes (computed). Even if its current layout height doesn't overflow, the browser may route wheel events to it first, and if it can't scroll (no actual overflow at that instant), the event is sometimes not bubbled up to `<main>`. This is especially pronounced when `KanbanColumn`'s `overflow-y-auto` card list also intercepts the gesture.

**More specifically:** On a board with 7 columns and modest card counts, the columns' natural height fits within `<main>`'s visible area — vertical content does not exceed the viewport. In that case, `<main>` itself has nothing to scroll, and the board div is `overflow: auto` but also not overflowing. Vertical scroll appears broken everywhere on the page because neither the board div nor `<main>` is actually overflowing. As more cards are added to a column (enough to make the column naturally taller than the viewport), `<main>` will eventually overflow and vertical scroll will work from `<main>` — but only if the trackpad event reaches `<main>` first, which is unreliable given the `overflow-x-auto` coercion trap in the board div.

### 4. Role of `autoScroll` / DndContext — not the cause

Phase 1 added `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` to `DndContext` (Board.tsx:274). The plan's intent was correct: `threshold: { y: 0 }` suppresses @dnd-kit's vertical auto-scroll during a drag.

**`autoScroll` only activates during an active drag session** (i.e., while `isDragging === true`, after the PointerSensor's 8px distance activation). It does not run during passive trackpad scrolling. Non-drag two-finger scroll is handled entirely by the browser's native wheel event routing, which has nothing to do with `@dnd-kit`.

Therefore: **the `autoScroll` prop is not the cause of T05**. T05 — vertical scroll not working during normal (non-drag) two-finger gesture — is purely a CSS overflow layout issue. The `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` prop is correct and should stay.

### 5. Was this a Phase-1 regression?

The Phase 1 plan and research (01-RESEARCH.md) explicitly acknowledge the `overflow-x-auto` container at line 270 of Board.tsx and note it as pre-existing:

> "The `overflow-x-auto` container is the direct parent of `DndContext`. @dnd-kit's auto-scroller traverses up from the dragged element's DOM node to find scrollable ancestors..."
> "The `overflow-x-auto` div at line 270 will be detected as a scrollable ancestor, which is exactly the element that must scroll."

The 01-RESEARCH.md was written on 2026-06-03 (same day as this research), but it references Board.tsx as it existed before Phase 1 edits. The pre-Phase-1 research noted the container at line 270 carried `overflow-x-auto` in the existing code and Phase 1 added only the `autoScroll` prop.

**Git evidence (from plan artifacts):** The Phase 1 plan lists the files modified as:
- `frontend/src/features/board/types.ts` (stage model)
- `frontend/src/routes/Board.tsx` (autoScroll prop)
- `backend/src/routes/board.ts` (StageEnum)
- `backend/src/services/boardService.ts` (auto-move exclusion)
- `backend/prisma/schema.prisma` (comment)
- `backend/src/services/__tests__/boardAutoMove.stopped.test.ts` (new test)

The Board.tsx change was narrowly the `autoScroll` prop addition. The `-mx-6 px-6 overflow-x-auto` container **pre-existed Phase 1**.

**Conclusion on regression:** The `overflow-x-auto` div at line 270 pre-existed Phase 1. The CSS spec coercion (`overflow-x: auto` → `overflow-y` coerced to `auto`) was always present, as was the structural issue that `<main>` owns vertical scroll but the board div intercepts wheel events. Phase 1 did NOT introduce the broken vertical scroll.

**However**, Phase 1's addition of the "Stopped" column (7th column) may have made the issue more reliably observable: more columns = wider board = the horizontal overflow of the board div is more pronounced and more likely to trigger the browser's scroll-interception heuristics, which in turn makes it more likely for the board div to capture vertical gestures instead of passing them to `<main>`. The regression in observable terms (T05 failing) is a Phase-1 side-effect of wider board, not a Phase-1 code defect in the vertical axis. The root CSS layout flaw is pre-existing.

### 6. Why the `<main>` scroller is not reliably reachable from the board area

`<main>` (AppShell.tsx:13) has `overflow-y-auto`. It is the intended page scroll container and correctly positioned above the board in the DOM. The problem is event routing:

- The browser routes trackpad scroll (WheelEvent) to the **innermost scrollable element** under the pointer that can actually scroll in the gesture direction.
- The board div (line 270) is `overflow: auto` (computed, both axes) and is under the pointer.
- If the browser tests "can this element scroll?" it checks whether `scrollHeight > clientHeight`. Since the board div shrink-wraps its content, `scrollHeight ≈ clientHeight` and the test may return false — but browsers differ. Some pass the event up; others swallow it.
- Even if the board div cannot scroll, the KanbanColumn card-list divs (`overflow-y-auto`) are also candidates — they similarly have `scrollHeight ≈ clientHeight` when columns have few cards.
- The result is intermittent: vertical scroll works on some column heights/card counts and not others, and varies by browser/trackpad driver.

## Prior Fix Analysis

Phase 1 (commit reference: commits e821b4f, 37fd3d4, 968c34d, 09b2572) touched Board.tsx only to add `autoScroll={{ threshold: { x: 0.2, y: 0 } }}`. That prop was:
- Correctly scoped to drag-only behavior.
- Correctly set `y: 0` to suppress @dnd-kit vertical auto-scroll during a drag.
- Not involved in passive non-drag scroll events.

There was no prior fix attempt for T05 specifically. The `overflow-x-auto` container was present in the codebase before Phase 1 without any compensating `overflow-y` fix. This is the first time the issue has been formally identified.

## Root Cause Assessment

**Primary root cause:** `div` at `Board.tsx:270` carries `overflow-x-auto`. Per CSS spec §2.1, this coerces `overflow-y` from `visible` to `auto`, making the div a bidirectional scroll container. The browser's wheel-event routing delivers two-finger vertical gestures to this div (or to the `overflow-y-auto` column card-list divs inside it), both of which have `scrollHeight ≈ clientHeight` and cannot actually scroll. The event is swallowed or not reliably bubbled up to `<main>` (the true vertical scroll owner at AppShell.tsx:13).

**Contributing factor:** KanbanColumn's card-list body (`flex-1 overflow-y-auto`) also has `overflow-y: auto` but no defined height, so it likewise has no actual vertical overflow. Two competing `overflow-y: auto` layers between the pointer and `<main>` cause the gesture to be consumed before reaching `<main>`.

**Phase 1's role:** Not the root cause. Phase 1 added the 7th column (Stopped), making the issue more reliably triggered (wider board → more prominent horizontal scroll container). The `autoScroll` prop addition is correct and unrelated to T05.

**`autoScroll` prop:** Correct and not the cause. Do not remove or change it.

## Recommendations

Three candidate fixes are presented below, ordered from most surgical to most invasive. Fix A is recommended.

---

### Fix A (Recommended): Add `overflow-y: hidden` to the board scroll container

**File:** `frontend/src/routes/Board.tsx`, line 270.

**Change:** Add `overflow-y-hidden` to the div:

```tsx
// Before
<div className="-mx-6 px-6 overflow-x-auto">

// After
<div className="-mx-6 px-6 overflow-x-auto overflow-y-hidden">
```

**Why this works:** Setting `overflow-y: hidden` explicitly overrides the CSS-spec coercion. The computed `overflow-y` becomes `hidden`, not `auto`. The div is no longer a vertical scroll container. Wheel events that arrive at this div (or its children) in the vertical direction are not consumed by the div — they pass through to `<main>` via normal event bubbling. `<main>` (AppShell.tsx:13) has `overflow-y-auto` and is the correct vertical scroll owner.

**Effect on horizontal scroll:** `overflow-x: auto` is unchanged. The board still scrolls horizontally normally (non-drag trackpad gesture, scrollbar).

**Effect on drag auto-scroll:** `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` is unchanged. @dnd-kit traverses the DOM to find scrollable ancestors; the board div is still `overflow-x: auto` and remains the horizontal auto-scroll target during a drag.

**Effect on KanbanColumn card list:** The column card-list body (`flex-1 overflow-y-auto`) still has `overflow-y: auto` but — as noted above — its `scrollHeight ≈ clientHeight` because the column has no height constraint. So it does not actually scroll and the event passes through. If desired, `overflow-y: visible` could also be set on the column card-list (not strictly required for T05, but reduces a second potential event trap).

**Trade-offs:**
- Minimal change (one Tailwind class added).
- Does not change any layout dimensions — `overflow-y: hidden` clips overflow rather than creating a scroll bar, and since the div shrink-wraps its content there is no actual vertical overflow to clip.
- If future cards cause column height to legitimately exceed the board area, `overflow-y: hidden` will clip that content. However, the intended design already routes vertical page scrolling through `<main>` — columns should not have an independent vertical scroller at the board level.
- If the KanbanColumn card-list `overflow-y-auto` is still intercepting events (see Fix B below), Fix A alone may be sufficient or may need to be combined.

**Risk:** Low. The board div does not need to scroll vertically. `overflow-y: hidden` is semantically correct — it says "this element does not scroll vertically; clip if overflow occurs" — which is the design intent.

---

### Fix B: Remove `overflow-y-auto` from KanbanColumn card-list body

**File:** `frontend/src/features/board/components/KanbanColumn.tsx`, line 34.

**Change:**

```tsx
// Before
<div ref={setNodeRef} className="flex-1 overflow-y-auto space-y-2 p-2 rounded-lg ...">

// After
<div ref={setNodeRef} className="flex-1 overflow-y-visible space-y-2 p-2 rounded-lg ...">
// or simply remove overflow-y-auto (reverts to default visible)
```

**Why this works:** Eliminates the second `overflow-y: auto` layer inside each column. Wheel events directed at a card or the card-list body will not be caught by this element — they will pass up to the board div (line 270), which Fix A already makes non-capturing for vertical events, and then to `<main>`.

**Trade-offs:**
- Column card-list will no longer have an independent vertical scroll bar. This is acceptable because there is no height constraint on the column — it grows to show all cards and the page-level vertical scroll handles the rest.
- If design intent is for each column to have an independent scrollable area (fixed-height columns), this fix would be wrong. The current code has no height constraint on columns, so the `overflow-y-auto` is currently a no-op anyway.

**Recommendation:** Apply Fix B alongside Fix A to eliminate both scroll traps. Fix B is low-risk since `overflow-y-auto` on the card list currently does nothing (no height cap).

---

### Fix C: Add an explicit height and make `<main>` the sole vertical scroll surface

**Files:** `frontend/src/components/layout/AppShell.tsx` (no change needed — it's already correct) and `frontend/src/routes/Board.tsx`.

**Concept:** Ensure the board scroll container div is height-constrained so that the board surface fills `<main>` without spilling, and `<main>` is the only vertical scroll container. This would mean giving the board outer div (`div.space-y-4`) a `min-h-0` or `h-full` and letting `<main>`'s `overflow-y-auto` handle all scrolling.

**Why this is more complex:** The Board component renders inside a `<main>` that is already `flex-1 overflow-y-auto`. The Board's root `div.space-y-4` already shrink-wraps its content. Vertical scroll through `<main>` is the design intent, but Fix C would require auditing all height-related classes through the board. Fix A + B achieve the same outcome with less surface area changed.

**Recommendation:** Not needed. Fix A + B address the root cause without restructuring the height chain.

---

### Summary recommendation

**Apply Fix A** (add `overflow-y-hidden` at Board.tsx:270) as the primary fix. **Optionally apply Fix B** (remove `overflow-y-auto` from KanbanColumn card-list, KanbanColumn.tsx:34) to eliminate the inner event trap. Both are single-class changes. Neither touches the `autoScroll` prop, the horizontal scroll behavior, or any backend/schedule code.

| Fix | File | Line | Change | Risk |
|-----|------|------|--------|------|
| A (required) | `frontend/src/routes/Board.tsx` | 270 | add `overflow-y-hidden` to board scroll container | Low |
| B (recommended) | `frontend/src/features/board/components/KanbanColumn.tsx` | 34 | remove `overflow-y-auto` from card-list body | Low |

Do NOT modify:
- `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` — correct and unrelated to T05.
- AppShell, `<main>`, or Sidebar — they are correctly structured.
- Any backend/schedule code — T05 is a pure CSS frontend issue.

## Live Validation Evidence

```
command_shape:    git show <commit-hash> -- frontend/src/routes/Board.tsx
exit_status:      N/A — all Bash commands blocked by Scout hook-wrapper guard
                  (hook-wrapper.sh script contains shell file write/redirection
                  patterns that trigger the read-only policy guard regardless of
                  the actual git command intent)
redacted_evidence: N/A
expected_shape:   diff showing -mx-6 px-6 overflow-x-auto div present before Phase 1
confidence:       high — evidence derived from plan artifacts and 01-RESEARCH.md which
                  document the pre-Phase-1 state of Board.tsx; 01-RESEARCH.md explicitly
                  shows the container at line 270 with overflow-x-auto as pre-existing
limitations_or_deferred_reason: |
  Git log and git-show commands are blocked by the hook-wrapper.sh guard in this
  environment (the hook wrapper's setup script itself contains shell constructs that
  trigger the read-only Bash policy). Regression timing conclusion (pre-existing) is
  derived from plan document evidence (01-RESEARCH.md showing pre-Phase-1 Board.tsx
  state, 01-01-PLAN.md listing exact files Phase 1 modified). A Dev/Debugger can
  confirm via: git log --oneline e821b4f 37fd3d4 968c34d 09b2572 and
  git show 37fd3d4 -- frontend/src/routes/Board.tsx
```
