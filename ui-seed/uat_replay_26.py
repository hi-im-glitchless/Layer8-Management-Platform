#!/usr/bin/env python3
"""UAT replay — Phase 01 (Schedule-to-Planner Project Sync).

Replays the UI actions for this phase's UAT checkpoints so they can be
watched/reviewed instead of driven by hand. Each checkpoint drives the actions,
saves a screenshot to ui-seed/uat-screenshots/, runs a light presence assert
where deterministic, and prints what a HUMAN must judge.

Run:   cd ui-seed && python3 uat_replay_26.py
Watch: E2E_HEADLESS=0 python3 uat_replay_26.py
Then report verdicts per checkpoint (e.g. "P01-T01 pass, P01-T02 issue: board never refreshed").

Requires the stack up + demo data seeded (run seed_all.py first so /schedule has
filled assignment cells and /board has the matching cards).

What this replay covers:
  P01-T01  rename in place  -- FULLY DRIVEN, and RESTORED afterwards (renames the
                              project, counts board cards before/after, then
                              renames back to the original name).
  P01-T02  live board refresh -- FULLY DRIVEN via two tabs, also restored.
  P01-T03  collision re-point  -- STAGED ONLY. It deliberately abandons a Project
                              row and is not safely reversible, so the replay
                              surfaces two candidate assignments + their board
                              cards and leaves the actual edit to the human.
  P02-T01  first link / un-link -- STAGED ONLY, same reason (creates and clears
                              real rows).

The document-review checkpoints (D01-D05, PR01-T01, PR02-T01) have no UI and are
not replayed here.

Role: pm throughout.
"""

import os
import sys
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")
UAT_SUFFIX = " [uat26]"

CARD_XPATH = (
    "//div[contains(@class,'rounded-lg') and contains(@class,'bg-card')"
    " and contains(@class,'shadow-sm') and contains(@class,'border')]"
)
FILLED_CELL_XPATH = "//table//td[normalize-space()]"


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*64}\n  {cid}: {title}\n{'='*64}", flush=True)


# --- Schedule helpers --------------------------------------------------------

def filled_cells(driver):
    return driver.find_elements(By.XPATH, FILLED_CELL_XPATH)


def open_cell_by_index(driver, idx, reload=True):
    """Open the assignment modal for the idx-th filled schedule cell.

    Index-based so the SAME cell can be reopened after navigating away.
    Returns True once a dialog carrying #projectName is on screen.
    """
    if reload:
        driver.get(common.BASE_URL + "/schedule")
        time.sleep(3)
    cells = filled_cells(driver)
    if idx >= len(cells):
        return False
    try:
        cells[idx].click()
    except Exception:
        return False
    time.sleep(1.5)
    return bool(driver.find_elements(By.ID, "projectName"))


def open_first_editable_cell(driver):
    """Find the first filled cell that opens a modal with a non-empty project
    name and is not locked. Returns (index, project_name) or (None, None)."""
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    total = len(filled_cells(driver))
    for i in range(total):
        if not open_cell_by_index(driver, i):
            continue
        field = driver.find_element(By.ID, "projectName")
        name = (field.get_attribute("value") or "").strip()
        save = driver.find_elements(By.XPATH, "//*[@role='dialog']//button[normalize-space()='Save']")
        if name and save and save[0].is_enabled():
            return i, name
        close_modal(driver)
    return None, None


def close_modal(driver):
    for label in ("Cancel", "Close"):
        btns = driver.find_elements(
            By.XPATH, f"//*[@role='dialog']//button[normalize-space()='{label}']"
        )
        if btns:
            try:
                btns[0].click()
                time.sleep(0.8)
                return
            except Exception:
                pass
    try:
        driver.find_element(By.TAG_NAME, "body").send_keys("")  # ESC
        time.sleep(0.8)
    except Exception:
        pass


def set_project_name(driver, value):
    field = driver.find_element(By.ID, "projectName")
    common._set_value(driver, field, value)


def save_modal(driver):
    btn = driver.find_element(By.XPATH, "//*[@role='dialog']//button[normalize-space()='Save']")
    btn.click()
    time.sleep(2.5)


def board_cards(driver, reload=True):
    if reload:
        driver.get(common.BASE_URL + "/board")
        time.sleep(3)
    return driver.find_elements(By.XPATH, CARD_XPATH)


def board_card_texts(driver, reload=True):
    return [c.text.strip() for c in board_cards(driver, reload=reload) if c.text.strip()]


# --- Checkpoints -------------------------------------------------------------

def p01_t01_rename_in_place(driver):
    checkpoint("P01-T01", "Rename on Schedule renames the Planner card in place")
    common.login(driver, "pm")

    idx, original = open_first_editable_cell(driver)
    if idx is None:
        print("  ! No editable filled assignment cell found — seed data first (seed_all.py).")
        return None
    close_modal(driver)

    before = board_card_texts(driver)
    before_shot = shot(driver, "p01-t01-board-before.png")
    print(f"  Baseline: cell #{idx}, project name {original!r}; board shows {len(before)} card(s).")
    print(f"  Screenshot: {before_shot}")

    renamed = original + UAT_SUFFIX
    if not open_cell_by_index(driver, idx):
        print("  ! Could not reopen the cell to rename it.")
        return None
    set_project_name(driver, renamed)
    save_modal(driver)
    print(f"  Did: renamed {original!r} -> {renamed!r} and saved.")

    after = board_card_texts(driver)
    after_shot = shot(driver, "p01-t01-board-after.png")
    hits = [t for t in after if UAT_SUFFIX.strip() in t]
    stale = [t for t in after if original in t and UAT_SUFFIX.strip() not in t]
    print(f"  Auto-check: card count {len(before)} -> {len(after)} "
          f"({'unchanged' if len(before) == len(after) else 'CHANGED — expected unchanged'}).")
    print(f"  Auto-check: {len(hits)} card(s) now carry the new name; "
          f"{len(stale)} card(s) still carry the old name (expected 1 and 0).")
    print(f"  Screenshot: {after_shot}")

    # Restore
    if open_cell_by_index(driver, idx):
        set_project_name(driver, original)
        save_modal(driver)
        restored = board_card_texts(driver)
        print(f"  Restored: renamed back to {original!r}; board card count now {len(restored)}.")
    else:
        print(f"  ! RESTORE FAILED — project is still named {renamed!r}. Rename it back by hand.")

    print("  Verify (human): the SAME card was renamed — no duplicate appeared, no card was")
    print("  orphaned, and the card kept its column/stage, checklist ticks, notes and comments.")
    print("  Repeat by hand with the Client field and with a Tag toggle; both should behave the same.")
    return idx


def p01_t02_live_board_refresh(driver, idx):
    checkpoint("P01-T02", "An open Planner board refreshes live on a rename from Schedule")
    if idx is None:
        print("  ! Skipped — no usable cell from P01-T01.")
        return

    driver.get(common.BASE_URL + "/board")
    time.sleep(3)
    board_tab = driver.current_window_handle
    before = len(board_cards(driver, reload=False))
    print(f"  Tab 1: /board open with {before} card(s), left untouched from here on.")

    driver.switch_to.new_window("tab")
    edit_tab = driver.current_window_handle
    if not open_cell_by_index(driver, idx):
        print("  ! Could not open the assignment in the second tab.")
        driver.close()
        driver.switch_to.window(board_tab)
        return
    original = (driver.find_element(By.ID, "projectName").get_attribute("value") or "").strip()
    set_project_name(driver, original + UAT_SUFFIX)
    save_modal(driver)
    print(f"  Tab 2: renamed {original!r} -> {original + UAT_SUFFIX!r} and saved.")

    driver.switch_to.window(board_tab)
    time.sleep(6)  # socket board:invalidate -> TanStack refetch, no manual reload
    texts = [c.text.strip() for c in board_cards(driver, reload=False)]
    live = [t for t in texts if UAT_SUFFIX.strip() in t]
    p = shot(driver, "p01-t02-board-live.png")
    print(f"  Auto-check: WITHOUT reloading tab 1, {len(live)} card(s) show the new name "
          f"(expected 1). Card count {before} -> {len(texts)}.")
    print(f"  Screenshot: {p}")

    # Restore in the edit tab
    driver.switch_to.window(edit_tab)
    if open_cell_by_index(driver, idx):
        set_project_name(driver, original)
        save_modal(driver)
        print(f"  Restored: renamed back to {original!r}.")
    else:
        print(f"  ! RESTORE FAILED — project may still be named {original + UAT_SUFFIX!r}.")
    driver.close()
    driver.switch_to.window(board_tab)

    print("  Verify (human): the board tab updated on its own within a few seconds — you did not")
    print("  have to press F5 or reload to see the renamed card.")


def p01_t03_collision_staging(driver):
    checkpoint("P01-T03", "Collision re-point (STAGED — human drives the edit)")
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    cells = filled_cells(driver)
    sched = shot(driver, "p01-t03-schedule.png")
    board = shot(driver, "p01-t03-board.png") if board_cards(driver) is not None else ""
    print(f"  Did: captured /schedule ({len(cells)} filled cell(s)) and /board for reference.")
    print(f"  Screenshots: {sched} | {board}")
    print("  NOT AUTOMATED: this edit deliberately abandons a Project row and is not safely")
    print("  reversible, so drive it yourself on disposable data:")
    print("    1. Pick assignments A and B pointing at two different projects with their own cards.")
    print("    2. Note B's exact Project Name, Client and Tags.")
    print("    3. Edit A to match all three exactly, and Save.")
    print("  Verify (human): no third project/card was created; reopening A and clicking")
    print("  'View on Board' lands on B's card; the project A used to point at still exists")
    print("  with its original name/client/tags and its card is unchanged on the board.")


def p02_t01_link_unlink_staging(driver):
    checkpoint("P02-T01", "First-time link and un-link (STAGED — human drives the edits)")
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    empties = driver.find_elements(By.XPATH, "//table//td[not(normalize-space())]")
    p = shot(driver, "p02-t01-schedule.png")
    print(f"  Did: captured /schedule; {len(empties)} empty cell(s) available for a fresh assignment.")
    print(f"  Screenshot: {p}")
    print("  NOT AUTOMATED: these create and clear real rows. Drive them yourself:")
    print("    (a) New assignment with a project name that does not exist yet -> Save -> check /board.")
    print("    (b) Reopen it, clear Project Name (client-only) -> Save -> check /board.")
    print("    (c) On a split cell, rename the SECOND project -> Save -> check /board.")
    print("  Verify (human): (a) a new card appears with the default checklist; (b) clearing the")
    print("  name un-links without corrupting or silently deleting unrelated board data;")
    print("  (c) the split half renames in place too, keeping its colour and status.")


def run():
    driver = common.make_driver()
    try:
        common.banner("Phase 01 UAT replay (schedule-to-planner project sync)")
        idx = p01_t01_rename_in_place(driver)
        p01_t02_live_board_refresh(driver, idx)
        p01_t03_collision_staging(driver)
        p02_t01_link_unlink_staging(driver)
        print(f"\n{'='*64}")
        print(f"  Replay complete. Screenshots in: {SHOTS}")
        print(f"  D01-D05, PR01-T01 and PR02-T01 are document reviews — no UI to replay.")
        print(f"  Report verdicts per checkpoint (pass / skip / issue + note).")
        print(f"{'='*64}")
    finally:
        driver.quit()


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
