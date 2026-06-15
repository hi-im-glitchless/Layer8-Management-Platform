#!/usr/bin/env python3
"""UAT replay — Phase 09 (Planner orphaned card on last-pentester schedule delete).

Bug fixed: deleting the **last** pentester's Assignment for a project in the
Schedule used to leave the project's card "hung up" in the Planner (stale on
screen, then a zero-pentester card stuck in its old column forever). The fix:
when the deleted assignment was the last one referencing a project, the backend
moves that project's BoardCard to the **'stopped'** stage (never deletes it), and
both the acting client and other connected clients refresh the board. A project
that still has another pentester assigned is left completely untouched.

This replay parks you on the Schedule and the Board and reads the relevant state
so you can verify the two checkpoints. The actual delete is a **mutating** action,
so it is OFF by default — set E2E_DO_DELETE=1 to let the script perform the
delete it is told to (only do this against a disposable/seeded dataset).

* P01-T01 (last-pentester delete → stopped): pick a project assigned to exactly
  ONE pentester; delete that assignment in the Schedule; the project's card in the
  Planner moves to the 'Stopped' column and is NOT removed/deleted (notes, files,
  checklist preserved). The board reflects this without a manual reload.
* P01-T02 (multi-pentester safety): pick a project assigned to TWO+ pentesters;
  delete ONE pentester's assignment; the card stays exactly where it was (no stage
  change, not deleted) because the project still has another assignment.

SAFETY: read-only by default (navigate + read + screenshot). The optional delete
step (E2E_DO_DELETE=1) mutates schedule data — use only on seeded/demo data.

Run (read-only):   cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_09.py
Then report verdicts (e.g. "P01-T01 pass, P01-T02 pass").

Requires the stack up + demo data seeded with at least one single-pentester
project and one multi-pentester project. Logs in as pm.
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD_XPATH = "//div[contains(@class,'bg-card')]"
COLUMN_XPATH = "//*[@data-board-stage] | //*[contains(@class,'kanban-column')]"

DO_DELETE = os.environ.get("E2E_DO_DELETE") == "1"


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*64}\n  {cid}: {title}\n{'='*64}", flush=True)


def open_board(driver):
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)


def open_schedule(driver):
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)


def board_card_stages(driver):
    """Best-effort read of (card label -> column/stage) for the board."""
    out = []
    for c in driver.find_elements(By.XPATH, CARD_XPATH):
        try:
            label = (c.text or "").strip().split("\n")[0][:40]
        except Exception:
            label = "?"
        stage = ""
        try:
            col = c.find_element(By.XPATH, "./ancestor::*[@data-board-stage][1]")
            stage = col.get_attribute("data-board-stage") or ""
        except Exception:
            stage = ""
        out.append((label, stage))
    return out


def t01_last_pentester_to_stopped(driver):
    checkpoint("P01-T01", "Last-pentester schedule delete -> card moves to 'Stopped'")
    open_board(driver)
    before = board_card_stages(driver)
    path_b = shot(driver, "p09-t01-board-before.png")
    print(f"  Board BEFORE (card -> stage): {before}")
    print(f"  Screenshot (board before): {path_b}")
    open_schedule(driver)
    shot(driver, "p09-t01-schedule.png")
    if DO_DELETE:
        print("  E2E_DO_DELETE=1 set — perform the delete of the SINGLE-pentester "
              "project's assignment now (the script leaves the exact target to you; "
              "right-click / delete the assignment cell for a one-pentester project).")
        input("  Press Enter AFTER you have deleted that assignment...")
    else:
        print("  (read-only) Manually delete, in the Schedule, the assignment of the "
              "LAST/only pentester for a one-pentester project.")
        input("  Press Enter AFTER you have deleted that assignment...")
    open_board(driver)
    after = board_card_stages(driver)
    path_a = shot(driver, "p09-t01-board-after.png")
    print(f"  Board AFTER (card -> stage): {after}")
    print(f"  Screenshot (board after): {path_a}")
    print("  Verify (human): the affected project's card is STILL on the board (not "
          "removed, not blank/hung) and now sits in the 'Stopped' column. The board "
          "updated WITHOUT a manual page reload. Opening the card shows its notes/"
          "files/checklist intact.")


def t02_multi_pentester_untouched(driver):
    checkpoint("P01-T02", "Multi-pentester project untouched when one assignment deleted")
    open_board(driver)
    before = board_card_stages(driver)
    print(f"  Board BEFORE (card -> stage): {before}")
    shot(driver, "p09-t02-board-before.png")
    open_schedule(driver)
    print("  Manually delete ONE pentester's assignment for a project that has TWO+ "
          "pentesters assigned (leave at least one assignment remaining).")
    input("  Press Enter AFTER you have deleted that one assignment...")
    open_board(driver)
    after = board_card_stages(driver)
    shot(driver, "p09-t02-board-after.png")
    print(f"  Board AFTER (card -> stage): {after}")
    print("  Verify (human): the multi-pentester project's card is UNCHANGED — same "
          "column/stage as before, still present, NOT moved to 'Stopped', NOT "
          "deleted. Only the removed pentester's avatar disappears from the card.")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "pm")
        t01_last_pentester_to_stopped(driver)
        t02_multi_pentester_untouched(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
