#!/usr/bin/env python3
"""UAT replay — Phase 24 (Project Board: Schedule Integration & Navigation).

Replays the UI actions for the phase-24 UAT checkpoints so they can be
watched/reviewed instead of driven by hand. Each checkpoint drives the actions,
saves a screenshot to ui-seed/uat-screenshots/, runs a light presence/URL assert
where deterministic, and prints what a human must judge.

Run:   cd ui-seed && python3 uat_replay_24.py
Watch: E2E_HEADLESS=0 python3 uat_replay_24.py
Then report verdicts per checkpoint (e.g. "T01 pass, T05 issue: dates not synced").

Requires the stack up + demo data seeded (run seed_all.py first so the schedule
has assignments and the board has cards).

Roles: T01/T03/T04/T05 + the PM half of T06 log in as pm; T02 + the pentester
half of T06 log in as normal (NORMAL role).
"""

import os
import sys
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")
CARD = os.environ.get("E2E_UAT_CARD", "Acme External Pentest")


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*64}\n  {cid}: {title}\n{'='*64}", flush=True)


def click_first_schedule_cell(driver):
    """Best-effort: click a filled schedule grid cell (a <td> with content)."""
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    # filled cells usually carry the project/assignment text; try clickable tds
    cells = driver.find_elements(
        By.XPATH, "//td[.//*[normalize-space()] or normalize-space()][@role='button' or @tabindex or .//button]"
    )
    if not cells:
        cells = driver.find_elements(By.XPATH, "//table//td[normalize-space()]")
    for c in cells:
        try:
            if c.text.strip():
                c.click()
                time.sleep(1.5)
                return True
        except Exception:
            continue
    return False


def t01_view_on_board(driver):
    checkpoint("T01", "Assignment edit modal shows 'View on Board' link (PM)")
    opened = click_first_schedule_cell(driver)
    links = driver.find_elements(
        By.XPATH, "//*[@role='dialog']//a[contains(normalize-space(),'View on Board') "
                  "or contains(@href,'/board?card=')] | //a[contains(normalize-space(),'View on Board')]"
    )
    p = shot(driver, "t24-t01-view-on-board.png")
    print(f"  Did: opened /schedule, clicked an assignment cell ({'modal/edit open' if opened else 'no modal'})")
    print(f"  Auto-check: {len(links)} 'View on Board' link(s) found in the edit modal")
    print(f"  Verify: editing an assignment whose project HAS a board card shows a "
          f"'View on Board' link; clicking it opens /board?card=<id> on that card. "
          f"(Assignments without a board card should NOT show the link.)")
    print(f"  Screenshot: {p}")


def t02_pentester_cell_to_board(driver):
    checkpoint("T02", "Pentester clicks schedule cell -> project card on Board (NORMAL)")
    print("  (re-login as normal/pentester)")
    common.login(driver, "normal")
    opened = click_first_schedule_cell(driver)
    time.sleep(2)
    url = driver.current_url
    p = shot(driver, "t24-t02-cell-to-board.png")
    on_board = "/board" in url
    print(f"  Did: login normal, clicked own schedule assignment cell ({'cell clicked' if opened else 'no cell'})")
    print(f"  Auto-check: current URL = {url} ({'on /board' if on_board else 'NOT on /board'})")
    print(f"  Verify: a pentester clicking their own assignment cell navigates straight to "
          f"the project's card on the Board (/board?card=<id>, modal open).")
    print(f"  Screenshot: {p}")


def t03_dashboard_to_board(driver):
    checkpoint("T03", "Dashboard Current/Next project card links to Board card (PM)")
    print("  (re-login as pm)")
    common.login(driver, "pm")
    driver.get(common.BASE_URL + "/dashboard")
    time.sleep(3)
    before = shot(driver, "t24-t03-dashboard.png")
    clicked = False
    for el in driver.find_elements(
        By.XPATH, "//*[contains(@href,'/board?card=')] | "
                  "//*[contains(normalize-space(),'Current Project') or contains(normalize-space(),'Next Project')]"
                  "/ancestor-or-self::*[self::a or @role='button'][1]"
    ):
        try:
            el.click(); time.sleep(2); clicked = True; break
        except Exception:
            continue
    url = driver.current_url
    after = shot(driver, "t24-t03-after.png")
    print(f"  Did: opened /dashboard; clicked a Current/Next project card ({'clicked' if clicked else 'no clickable card'})")
    print(f"  Auto-check: URL after click = {url}")
    print(f"  Verify: the Dashboard Current/Next project cards link to the Board card "
          f"(/board?card=<id>); clicking opens that card.")
    print(f"  Screenshots: {before} | {after}")


def t04_assignment_autocreates_card(driver):
    checkpoint("T04", "Creating a schedule assignment auto-creates a Board card (PM)")
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    p = shot(driver, "t24-t04-schedule.png")
    print(f"  Did: opened /schedule (PM)")
    print(f"  Verify (manual — mutates data): create a NEW assignment for a project that "
          f"has no board card yet (click an empty cell -> fill project/client -> save). "
          f"Then open /board: a card for that project should now exist in 'Upcoming'. "
          f"Creating an assignment for an EXISTING project should reuse its card, not duplicate.")
    print(f"  Screenshot: {p}")


def t05_date_sync(driver):
    checkpoint("T05", "Changing schedule dates updates the Board card dates (PM)")
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(2)
    p = shot(driver, "t24-t05-schedule.png")
    print(f"  Did: opened /schedule (PM)")
    print(f"  Verify (manual): edit an assignment's week/dates on the schedule, save, then "
          f"open the matching Board card — its dates/week should reflect the change.")
    print(f"  Screenshot: {p}")


def t06_default_filter(driver):
    checkpoint("T06", "Board default filter: 'mine' for pentesters, 'all' for PM/Admin")
    # PM half (already pm)
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)
    pm_shot = shot(driver, "t24-t06-board-pm.png")
    pm_body = driver.find_element(By.TAG_NAME, "body").text
    # normal half
    common.login(driver, "normal")
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)
    normal_shot = shot(driver, "t24-t06-board-normal.png")
    print(f"  Did: opened /board as pm, then as normal")
    print(f"  Verify: the board's default filter is 'All Projects' for PM/Admin and "
          f"'My Projects' (mine) for pentesters (NORMAL). Check the filter control's "
          f"initial selection for each role.")
    print(f"  Screenshots (pm | normal): {pm_shot} | {normal_shot}")


def run():
    driver = common.make_driver()
    try:
        common.banner("Phase 24 UAT replay (schedule integration) — login as pm")
        common.login(driver, "pm")
        t01_view_on_board(driver)
        t02_pentester_cell_to_board(driver)   # logs in as normal
        t03_dashboard_to_board(driver)        # re-logs as pm
        t04_assignment_autocreates_card(driver)
        t05_date_sync(driver)
        t06_default_filter(driver)            # pm then normal
        print(f"\n{'='*64}")
        print(f"  Replay complete. Screenshots in: {SHOTS}")
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
