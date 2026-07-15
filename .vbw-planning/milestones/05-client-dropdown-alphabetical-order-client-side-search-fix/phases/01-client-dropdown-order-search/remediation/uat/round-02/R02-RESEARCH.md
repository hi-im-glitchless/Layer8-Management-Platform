---
phase: 1
round: 2
title: "Client Dropdown UAT round-02 remediation research (trigger hover + sentinel-while-searching)"
type: remediation-research
confidence: high
date: 2026-07-08
---

## Root Cause Assessment

- **UAT-2b (weird trigger hover):** Root cause is the combobox trigger using `Button variant="outline"` (`client-combobox.tsx:99-103`), whose shadcn `outline` variant bakes in `hover:bg-accent hover:text-accent-foreground` (`ui/button.tsx:18-19`). The pentesters dropdown uses `SelectTrigger` (`ui/select.tsx:15-33`) which has NO `hover:` classes, so it doesn't fill on hover. The client trigger therefore looks different/weird on hover. Fix: override the trigger's hover classes to be inert (e.g. `hover:bg-transparent hover:text-foreground`) so it matches `SelectTrigger`. Item-row styling is not the cause and stays untouched.
- **UAT-1b (sentinel visibility rule):** Root cause is the round-01 rule `showSentinel = sentinelMode === 'always' || value !== null` (`client-combobox.tsx:78`), which keys off selection/mode rather than search text. Correct rule: the sentinel is shown whenever the search box is empty and hidden while there is search text — identical for both usages. Fix: `showSentinel = !search` and remove the now-unnecessary `sentinelMode` prop.

## Findings

### Issue UAT-2b — weird hover color is on the combobox TRIGGER button

File: `frontend/src/components/client-combobox.tsx:99-117`

The trigger is rendered as:
```tsx
<Button
  variant="outline"
  disabled={disabled}
  className={cn('w-full justify-start font-normal', triggerClassName)}
>
```

`variant="outline"` resolves via `buttonVariants` in `frontend/src/components/ui/button.tsx:18-19`:
```
outline:
  "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
```

So the outline `Button` always applies `hover:bg-accent hover:text-accent-foreground` on hover — this is the "weird hover fill" the user is seeing on the dropdown trigger. This is baseline shadcn `Button` behavior, not something client-combobox added on top; it's just the wrong variant/base-classes for a filter-style trigger that should look like a `Select`.

Compare with `SelectTrigger` in `frontend/src/components/ui/select.tsx:15-33`:
```
"flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
```
Key differences:
- `SelectTrigger` has **no `hover:` classes at all** — no hover background change, ever.
- `SelectTrigger` uses `bg-transparent` (not `bg-background`) and `focus:ring-1 focus:ring-ring` / `focus:outline-none` for focus styling instead of a `shadow-sm` static border.
- `SelectTrigger` doesn't use `shadow-sm` conditionally, it's just always present alongside `border-input`.
- `SelectTrigger` has a `ChevronDown` affordance built in (`frontend/src/components/ui/select.tsx:28-30`) — client-combobox's trigger currently has no chevron at all, which is a secondary visual gap worth noting but not part of the reported bug.

**Minimal recommended change:** Stop using `variant="outline"` (or any variant that carries `hover:bg-accent`) for the trigger. Two viable approaches, in order of minimalism:

1. **Cheapest fix — override the hover classes via `className`.** Since `cn()` (via `tailwind-merge`, used in `frontend/src/lib/utils.ts` — confirm merge behavior) appends the `className` prop after the variant classes in `buttonVariants({ variant, size, className })` (`frontend/src/components/ui/button.tsx:50`), passing `hover:bg-transparent hover:text-inherit` (or simply `hover:bg-background`) in the trigger's own `className` will override the `outline` variant's hover classes for this one component without touching `Button` globally. E.g.:
   ```tsx
   className={cn(
     'w-full justify-start font-normal hover:bg-transparent hover:text-foreground',
     triggerClassName,
   )}
   ```
   This is the smallest possible diff (one line) and keeps `Button`/`PopoverTrigger asChild` wiring untouched.

2. **More faithful match — drop `Button` entirely for the trigger and hand-roll it with `SelectTrigger`'s exact class string** (borrow the literal Tailwind classes from `select.tsx:22`, swap `[&>span]:line-clamp-1` as needed since children aren't wrapped in a `<span>` here). This makes the combobox trigger pixel-identical to `SelectTrigger` (including `bg-transparent`, `focus:ring-1 focus:ring-ring` instead of `focus-visible:ring-1 focus-visible:ring-ring`, and adding the `ChevronDown` icon). More visually consistent but a larger diff and changes focus-ring behavior too (not just hover) — likely out of scope for this "minor" round unless the orchestrator wants full parity.

Recommendation: **use approach 1** given the round is scoped as "two precise, minor issues" — override the hover classes on the existing `Button` outline trigger rather than swapping the base component. This directly fixes "hover fill" without touching focus/keyboard styling or introducing a chevron-icon layout change that wasn't reported as broken.

**Item rows — leave as-is.** The round-01 `focus:bg-accent focus:text-accent-foreground` classes on the sentinel button (`client-combobox.tsx:144`) and each client row button (`client-combobox.tsx:158`) are unrelated to the trigger and were not the subject of this complaint (user said "list items" were not the issue). No change needed there.

### Issue UAT-1b — sentinel visibility should key off search text, not selection state

Current implementation, `frontend/src/components/client-combobox.tsx`:
- Prop declaration: `sentinelMode?: 'always' | 'clear'` (`client-combobox.tsx:35`), defaulted to `'always'` (`client-combobox.tsx:65`).
- Visibility logic: `const showSentinel = sentinelMode === 'always' || value !== null` (`client-combobox.tsx:78`).
- Search state: `const [search, setSearch] = useState('')` (`client-combobox.tsx:71`); `filtered` is derived from `search` (`client-combobox.tsx:83-85`) but `showSentinel` never reads `search`.

Call sites:
- `frontend/src/features/schedule/components/AssignmentModal.tsx:325` and `:410` — both pass `sentinelMode="clear"` with `sentinelLabel="No client"`. Under current logic this hides "No client" until a client is already selected — this is exactly the round-01 behavior the user is now overriding.
- `frontend/src/features/board/components/BoardFilters.tsx:65-71` — passes no `sentinelMode` (defaults to `'always'`, i.e. always visible, including while searching) with `sentinelLabel="All clients"`.

**New rule (from prompt):** sentinel visible ALWAYS, hidden ONLY while there is search text. Both "No client" (assignment) and "All clients" (board) should behave identically: visible unless the search input is non-empty.

**Minimal recommended change:**
1. Replace the visibility expression at `client-combobox.tsx:78` with:
   ```tsx
   const showSentinel = search.trim() === ''
   ```
   (or `!search` if trimming isn't needed elsewhere — the existing filter check at `client-combobox.tsx:83` uses truthy `search` without trimming, so `!search` is consistent with existing style; recommend matching that: `const showSentinel = !search`.)
2. **Remove the `sentinelMode` prop entirely** — it no longer models any real distinction; both usages need identical behavior now. Delete:
   - The prop from the interface (`client-combobox.tsx:28-35`)
   - The default param (`client-combobox.tsx:65`)
   - The `sentinelMode="clear"` args at `AssignmentModal.tsx:325` and `:410`
   - Update/remove the doc comment block at `client-combobox.tsx:52-56` describing per-mode behavior (replace with a single sentence: "the sentinel is always visible except while the user has typed search text").
   This is cleaner than keeping a now-single-value union type (`'always' | 'clear'` collapsing to just one behavior) — a vestigial prop would be dead code and confusing to a future reader. Confirm no other call sites reference `sentinelMode` before deleting (only the two AssignmentModal usages found above; BoardFilters never set it).
3. No changes needed to `filtered` computation (`client-combobox.tsx:82-85`) — filtering logic is independent of sentinel visibility and already correctly scoped to `search`.

## Tests requiring updates

`frontend/src/components/__tests__/client-combobox.test.tsx`:
- **Test (e)** "sentinel stays pinned at top and visible regardless of search text" (`client-combobox.test.tsx:91-111`) — currently asserts the sentinel is STILL visible after `fireEvent.change(getSearchInput(), { target: { value: 'zzz-nope' } })` (line 109-110). Under the new rule this assertion is now wrong — the sentinel must disappear once search text is present. Needs rewriting to assert the sentinel is visible when search is empty, and hidden (only 1 match — the trigger — for `getAllByRole('button', { name: SENTINEL })`) once text is typed.
- **Test (h)** `sentinelMode="always" (default) shows the sentinel...` (`client-combobox.test.tsx:130-137`) — references the `sentinelMode` prop being removed; needs to drop the `sentinelMode="always"` arg (or be deleted/merged into a renamed "default shows sentinel when search empty" test) since the prop will no longer exist.
- **Test (i)** `sentinelMode="clear" hides the sentinel row when nothing is selected` (`client-combobox.test.tsx:139-148`) — encodes the exact round-01 behavior now being replaced. Must be deleted or rewritten to instead test "sentinel hidden while search has text regardless of selection."
- **Test (j)** `sentinelMode="clear" shows the sentinel as a clear option once a client is selected` (`client-combobox.test.tsx:150-163`) — same as above, encodes obsolete `sentinelMode="clear"` semantics (visibility tied to `value`, not `search`). Must be deleted or rewritten — new behavior should show the sentinel regardless of `value` as long as search is empty, and the test's implicit selection-driven trigger label change (`'Bravo'` in the trigger) is unrelated to sentinel visibility and can stay if repurposed.
- Tests (a)-(d), (f), (g) do not depend on sentinel-visibility rules and should be unaffected — verify after the change but no expected content changes.

`frontend/src/features/board/components/__tests__/BoardFilters.test.tsx`:
- No existing test currently exercises sentinel-visibility-while-searching for the board's "All clients" case (test (a) only asserts filtered `clientRowNames()`, not sentinel presence, while searching — grep confirms no other sentinel-during-search assertion in this file). Existing test (c) (`BoardFilters.test.tsx:76-89`) checks pinned position and click-behavior with an **empty** search box — unaffected by the fix since `showSentinel` is `true` at that point either way.
- Recommend adding (not just updating) a new assertion here for parity coverage: after typing search text, "All clients" should disappear from the list-button set (only the trigger button carries that label). This is a coverage gap in the current suite (only client-combobox.test.tsx exercised the mode-specific sentinel logic) rather than a break, but worth calling out since board's default behavior is changing too (previously `'always'`, i.e. visible during search — now hidden during search).

## Live Validation Evidence

No live app/browser or authenticated API validation was performed for this research — it is a static code/test read confined to the two named files, their shared `Button`/`SelectTrigger` primitives, and the two test suites. All findings are file:line references from direct `Read`/`grep` inspection of the current working tree, not live-run output.

- command_shape: N/A (static file reads only, no execution)
- exit_status: N/A
- redacted_evidence: N/A
- expected_shape: N/A
- confidence: high — findings are direct source reads, not inference
- limitations_or_deferred_reason: Actual visual hover appearance (does `hover:bg-transparent` fully neutralize the outline variant's `hover:bg-accent` via tailwind-merge dedup) and the full Vitest/tsc run after the fix should be verified live by Dev/Debugger — `frontend/package.json` has no `test` or `typecheck` npm script defined (only `"lint": "eslint ."`, `"build": "tsc -b && vite build"`); recommend running `npx vitest run src/components/__tests__/client-combobox.test.tsx src/features/board/components/__tests__/BoardFilters.test.tsx` and `npx tsc -b --noEmit` (or the project's existing `build` script's `tsc -b` step) directly from `frontend/` as the two checks, since `vitest` (`^4.0.18`) and `typescript` (`~5.9.3`) are present in `frontend/package.json` devDependencies but not wired to named scripts.

## Recommendations

1. **UAT-2b fix** — in `client-combobox.tsx:99-103`, add hover-neutralizing classes to the trigger `Button`'s `className` (e.g. `hover:bg-transparent hover:text-foreground` or similarly scoped to override just `hover:bg-accent hover:text-accent-foreground`), keeping `variant="outline"` and all other Button/Popover wiring untouched. Do not touch the item-row `focus:bg-accent` classes (lines 144, 158) — out of scope, user didn't flag them.
2. **UAT-1b fix** — change `showSentinel` (line 78) to key off `search` emptiness instead of `sentinelMode`/`value`; delete the `sentinelMode` prop entirely (interface, default, both `AssignmentModal.tsx` call sites) since it collapses to a single universal behavior; update the doc comment block (lines 52-56) accordingly.
3. Update/replace tests (e), (h), (i), (j) in `client-combobox.test.tsx` to reflect the new "hidden only while searching" rule and the removed `sentinelMode` prop; consider adding one BoardFilters test for hide-while-searching parity.
4. Run `npx vitest run` (scoped to the two test files above) and `npx tsc -b --noEmit` from `frontend/` as the verification checks — both toolchains are present in `package.json` but not bound to a named script, so invoke the binaries directly.
