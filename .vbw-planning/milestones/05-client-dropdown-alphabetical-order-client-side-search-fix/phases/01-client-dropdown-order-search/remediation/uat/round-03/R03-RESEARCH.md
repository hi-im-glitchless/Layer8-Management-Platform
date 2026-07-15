---
phase: 1
round: 3
title: Client Dropdown UAT round-03 research (sentinel regression, missing caret, muted trigger text)
type: remediation-research
confidence: high
date: 2026-07-08
---

Targeted research for UAT-3 (sentinel regression), UAT-4 (missing caret), UAT-5 (trigger text looks disabled) on the shared `frontend/src/components/client-combobox.tsx`, used by `frontend/src/features/schedule/components/AssignmentModal.tsx` (main + split) and `frontend/src/features/board/components/BoardFilters.tsx`. Compared against the pentesters `SelectTrigger`/`SelectContent` in `frontend/src/components/ui/select.tsx`.

## Findings

### UAT-3 — sentinel visibility (see Root Cause Assessment for the "why")

Current committed state (`frontend/src/components/client-combobox.tsx`, HEAD, unchanged since commit `abbfe3a`):

- Line 67: `const showSentinel = !search` — a single boolean, computed only from the search-box text, with **no** dependency on `value`, `sentinelLabel`, or any other prop.
- Lines 133–145: the pinned sentinel row is rendered unconditionally whenever `showSentinel` is true:
  ```tsx
  {showSentinel && (
    <button
      type="button"
      className={`w-full text-left px-2 py-1.5 text-sm rounded-sm cursor-default select-none outline-none focus:bg-accent focus:text-accent-foreground ${!value ? 'bg-accent text-accent-foreground' : ''}`}
      onClick={() => { onChange(null); setOpen(false); setSearch('') }}
    >
      {sentinelLabel}
    </button>
  )}
  ```
  `sentinelLabel` is just interpolated as the button's text content — there is no branch, no truthiness gate on the label string, and no `sentinelMode` prop left anywhere (confirmed: `grep -rn sentinelMode frontend/src` → zero matches).

- Call sites, byte-for-byte comparison:
  - `frontend/src/features/schedule/components/AssignmentModal.tsx:325` (main): `<ClientCombobox clients={clients} value={clientId} onChange={handleClientChange} sentinelLabel="No client" disabled={isLocked} />`
  - `frontend/src/features/schedule/components/AssignmentModal.tsx:410` (split): `<ClientCombobox clients={clients} value={splitClientId} onChange={handleSplitClientChange} sentinelLabel="No client" disabled={isLocked} />`
  - `frontend/src/features/board/components/BoardFilters.tsx:65-71` (board): `<ClientCombobox clients={clients} value={filterClientId} onChange={setFilterClientId} sentinelLabel="All clients" triggerClassName="w-[160px] h-8 text-xs" />`

  All three pass `sentinelLabel` explicitly; none pass anything that could gate the sentinel differently. `disabled={isLocked}` only affects the trigger `<Button disabled>` (whether the popover can be opened at all), never the sentinel row's own rendering once the popover is open.

- Direct empirical proof the component itself is symmetric: `frontend/src/components/__tests__/client-combobox.test.tsx` uses the **literal string `'No client'`** as its `SENTINEL` constant (line 20) and asserts it renders when search is empty regardless of `value` (tests (e), (h), (i), (j), lines 91–170) — these pass today. `frontend/src/features/board/components/__tests__/BoardFilters.test.tsx` asserts the same for `'All clients'` via real `<BoardFilters>` (tests (c) and (e), lines 76–110) — these also pass today.

- **Live Validation Evidence**
  - `command_shape`: `npx vitest run src/components/__tests__/client-combobox.test.tsx src/features/board/components/__tests__/BoardFilters.test.tsx` (from `frontend/`)
  - `exit_status`: 0
  - `redacted_evidence`: `Test Files  2 passed (2)` / `Tests  15 passed (15)` — includes the "No client" sentinel-visible-when-search-empty assertions and the BoardFilters "All clients" parity assertions.
  - `expected_shape`: all sentinel-visibility tests green, no failures.
  - `confidence`: high — read-only vitest run, no mutation.
  - `limitations_or_deferred_reason`: this only proves the shared `ClientCombobox` primitive and `BoardFilters`' real usage are correct in jsdom. There is **no** equivalent test that mounts the real `AssignmentModal` and asserts the "No client" sentinel renders (see Prior Fix Analysis / Recommendations) — that integration point is untested, so a live-browser check is still the authoritative way to confirm the fix is visible to users.

### UAT-4 — missing caret

- `frontend/src/components/ui/select.tsx:5`: `import { Check, ChevronDown, ChevronUp } from "lucide-react"`
- `frontend/src/components/ui/select.tsx:26-30`:
  ```tsx
  {children}
  <SelectPrimitive.Icon asChild>
    <ChevronDown className="h-4 w-4 opacity-50" />
  </SelectPrimitive.Icon>
  ```
  `SelectTrigger`'s own className (line 22) is `"flex h-9 w-full items-center justify-between ..."` — `justify-between` is what pushes the chevron to the far right of the trigger, opposite the value/placeholder text.

- `frontend/src/components/client-combobox.tsx:88-109` (trigger): a `Button variant="outline"` with:
  ```tsx
  className={cn(
    'w-full justify-start font-normal hover:bg-transparent hover:text-foreground',
    triggerClassName,
  )}
  ```
  containing only the selected/placeholder `<span>` — no icon at all. `frontend/src/components/ui/button.tsx:8` shows the base `buttonVariants` string already includes `inline-flex items-center ... [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0`, so the Button is already a flex row and any child `<svg>` would automatically get `size-4 shrink-0` from the button's own base styling — `opacity-50` still needs to be set explicitly (Select sets it explicitly too, so Button's base rules don't cover it).

### UAT-5 — trigger text color

- `frontend/src/components/client-combobox.tsx:96-108`:
  ```tsx
  {selected ? (
    <span className="flex items-center gap-2">
      {selected.color && <span .../>}
      {selected.name}
    </span>
  ) : (
    <span className="text-muted-foreground">{sentinelLabel}</span>
  )}
  ```
  The **selected**-client branch (line 97) carries no color class at all — it inherits ambient text color, which `frontend/src/index.css:145` sets globally: `body { @apply bg-background text-foreground; }` (near-black `--foreground: oklch(0.145 0 0)` in light mode). So a selected client's name is already rendered in normal `text-foreground`, matching Select.

  The **only** muted text in the whole trigger is the placeholder-style branch at line 107: `<span className="text-muted-foreground">{sentinelLabel}</span>` — this fires whenever nothing is selected, i.e. exactly when the trigger shows `"No client"` or `"All clients"`.

- Compare to `SelectTrigger` (`ui/select.tsx:22`): `data-[placeholder]:text-muted-foreground` — Radix only sets `data-placeholder` (and therefore only mutes the text) when `SelectValue` has **no** value bound at all. Critically, `frontend/src/features/board/components/BoardFilters.tsx:74-89` (the pentester filter, the actual "pentesters dropdown" referenced in the ask) never hits that placeholder state in practice:
  ```tsx
  <Select value={filterPentesterId ?? '__all__'} onValueChange={...}>
    <SelectTrigger className="w-[160px] h-8 text-xs">
      <SelectValue placeholder="All pentesters" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__all__">All pentesters</SelectItem>
      {pentesters.map(...)}
    </SelectContent>
  </Select>
  ```
  `value` is coalesced to the literal `'__all__'`, which is a **real `SelectItem`**, not an absent value — so `data-placeholder` is never true, and `"All pentesters"` always renders in normal (non-muted) `text-foreground`. The "no filter" sentinel concept in the *pentesters* Select is modeled as a genuine selection, not a placeholder.

  `ClientCombobox`'s sentinel ("No client" / "All clients") is the direct analogue of that `"All pentesters"` item — it represents "no filter" as a legitimate, always-selectable state, not a genuine absence-of-value placeholder (there's no separate "nothing chosen yet" state in this UI; the sentinel *is* the neutral value). Styling it with `text-muted-foreground` (client-combobox.tsx:107) makes it look like an unset/disabled placeholder, which is inconsistent with how the equivalent "no filter" state is styled in the pentesters Select right next to it in `BoardFilters`.

## Prior Fix Analysis

- Commit `1bfe71a` ("fix(components): show ClientCombobox clear sentinel only when a value is selected") introduced `sentinelMode: 'always' | 'clear'`:
  - `showSentinel = sentinelMode === 'always' || value !== null`
  - `AssignmentModal` (both call sites) passed `sentinelMode="clear"` → for a **new/unedited assignment** (`clientId === null`), `showSentinel` evaluated to **false** — "No client" was hidden.
  - `BoardFilters` didn't pass `sentinelMode` → defaulted to `'always'` → `showSentinel` was always **true** — "All clients" was always shown.
  - **This produces exactly the asymmetry described in UAT-3**: "No client" missing, "All clients" present, for a client with `value === null`.
- Commit `abbfe3a` ("fix(components): show client sentinel only when not searching (drop sentinelMode)") replaced this with the current `showSentinel = !search` rule and removed `sentinelMode` from the interface, defaults, both `AssignmentModal` call sites, and doc comments. Per the diff and the current file read, this fix is **complete** — no residual `sentinelMode` references, no `value`-based gating left anywhere in the sentinel-rendering path.
- `R02-UAT.md` (the round-02 re-verification, run in the same session that landed `abbfe3a`) still recorded UAT-3 as failing, describing the sentinel as "MISSING entirely" for the assignment picker while present for the board — i.e. the *exact* symptom the pre-`abbfe3a` (`1bfe71a`) code produces, not what the post-`abbfe3a` code produces.

## Root Cause Assessment

The current, committed `client-combobox.tsx` (HEAD, matches `abbfe3a`, confirmed via `git diff` showing no working-tree drift) does **not** reproduce the UAT-3 symptom by static analysis or by test:
- The sentinel-visibility rule (`showSentinel = !search`, line 67) has zero dependency on `value` or on which `sentinelLabel` string is passed.
- Both `AssignmentModal` call sites and the `BoardFilters` call site pass `sentinelLabel` identically (a required string prop, always supplied, never conditionally omitted).
- `client-combobox.test.tsx` proves — using the literal string `"No client"` — that the sentinel renders correctly whenever search is empty, independent of `value`.

The reported symptom ("No client" hidden while unselected, "All clients" always shown) is a **precise reproduction of the pre-`abbfe3a` behavior** (commit `1bfe71a`'s `sentinelMode="clear"` vs default `"always"`). This strongly indicates UAT-3, as captured in `R02-UAT.md`, was tested against a build that had not yet picked up the `abbfe3a` commit in the browser (stale dev-server bundle / un-refreshed tab / testing mid-deploy between the two round-02 tasks), rather than a defect that exists in the code as committed today.

There is, however, a real contributing gap: **no test mounts the actual `AssignmentModal` component** and asserts the "No client" sentinel renders — coverage for this call site exists only at the shared-primitive level (`client-combobox.test.tsx`, generic label) and not at the integration level, unlike `BoardFilters`, which has explicit integration assertions (`BoardFilters.test.tsx` tests (c)/(e)). This gap is why a stale-build false-positive (or any future real regression at that specific call site) could go unnoticed until manual UAT, and why board and assignment pickers currently have asymmetric test coverage despite symmetric implementation.

## Recommendations

**UAT-3 (sentinel):**
- No further application-code change is required in `client-combobox.tsx` or `AssignmentModal.tsx` — the `!search` rule is already correct and already applied identically to both call sites.
- Dev/QA should re-verify against a fresh build (hard refresh / restart dev server) before treating this as still-open; if it still reproduces after a clean reload, that would indicate a *new* regression distinct from anything visible in this diff, and would need fresh live-browser inspection (DOM + computed styles) rather than another static/unit-test pass.
- Close the coverage gap: add an integration test in a new/updated `frontend/src/features/schedule/components/__tests__/AssignmentModal.*.test.tsx` (mirroring the existing mock pattern in `AssignmentModal.lock.test.tsx`, lines 12–22, mocking `useClients` to return a non-empty client list) that opens the **main** `ClientCombobox` with `assignment=undefined` (new assignment, `clientId === null`) and asserts `"No client"` renders as a clickable row when the search box is empty — and repeat for the **split** combobox after enabling split mode. This is the direct analogue of `BoardFilters.test.tsx` tests (c) and (e) and would have caught (or definitively ruled out) a stale-build false report immediately.

**UAT-4 (caret):**
- Minimal change in `frontend/src/components/client-combobox.tsx`:
  1. Add `import { ChevronDown } from 'lucide-react'` (mirrors `ui/select.tsx:5`).
  2. Add a trailing icon as a sibling after the existing selected/placeholder `<span>` (inside the `<Button>`, after line 108's closing `)}`):
     ```tsx
     <ChevronDown className="ml-auto h-4 w-4 opacity-50 shrink-0" />
     ```
  - Using `ml-auto` on the icon (rather than switching the trigger's `justify-start` to `justify-between`) is the smaller-blast-radius option: it pushes the chevron to the right regardless of the existing `justify-start` layout, leaves the current label alignment/wrapping behavior untouched, and needs no companion change to `triggerClassName` consumers (`BoardFilters.tsx:70`'s `w-[160px] h-8 text-xs` keeps working unmodified).
  - `shrink-0` prevents the icon from being compressed in the narrow `w-[160px]` board trigger; `h-4 w-4 opacity-50` exactly matches `ui/select.tsx:29`.
- Tests to update: `client-combobox.test.tsx` and `BoardFilters.test.tsx` currently locate the trigger via `getAllByRole('button', { name: SENTINEL })` / `{ name: 'All clients' })` (accessible name = text content) — adding an `svg` (no text) does not change the accessible name, so existing locators keep working unmodified. Optionally add one assertion (e.g. `container.querySelector('svg')` or a `data-testid`/`aria-hidden` check) confirming the chevron is present, if the team wants explicit regression coverage for UAT-4.

**UAT-5 (muted trigger text):**
- Minimal change in `frontend/src/components/client-combobox.tsx:107`: drop `text-muted-foreground` from the placeholder/sentinel span so it renders in the same inherited `text-foreground` as the selected-client branch:
  ```tsx
  // before
  <span className="text-muted-foreground">{sentinelLabel}</span>
  // after
  <span>{sentinelLabel}</span>
  ```
- Rationale (see Findings/UAT-5): this component has no genuine "unset" placeholder state distinct from the sentinel — the sentinel *is* the neutral/no-filter value, directly analogous to `BoardFilters.tsx`'s own pentester `Select` where the equivalent "no filter" state (`value="__all__"`) is a real `SelectItem` and is therefore never muted by Radix's `data-[placeholder]` mechanism. Muting the client-combobox sentinel is the actual inconsistency; removing the class brings its text color treatment in line with the adjacent pentester dropdown, satisfying the guidance to "keep genuine placeholders muted if that matches Select behavior" (this isn't one).
- No other text-color classes need to change — the selected-client span (line 97) is already unstyled/inherits `text-foreground` and needs no edit.
- Tests to update: none of the existing tests assert on `text-muted-foreground` presence/absence for the sentinel span, so no test changes are strictly required; optionally add a lightweight assertion in `client-combobox.test.tsx` (e.g. `expect(trigger.querySelector('span')).not.toHaveClass('text-muted-foreground')`) to lock in the fix.

**Net file-touch list for the round-03 fix plan:**
- `frontend/src/components/client-combobox.tsx` (UAT-4 caret + UAT-5 color; UAT-3 needs no code change)
- Optionally: `frontend/src/components/__tests__/client-combobox.test.tsx` (new caret/color assertions)
- Optionally/recommended: new or extended `frontend/src/features/schedule/components/__tests__/AssignmentModal.*.test.tsx` (closes the UAT-3 coverage gap at the real integration point)
