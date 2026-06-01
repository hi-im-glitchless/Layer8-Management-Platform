#!/usr/bin/env python3
"""UAT replay — Phase 22 (Project Board Kanban UI).

Replays the UI actions for the remaining phase-22 UAT checkpoints (P02-T01..T04)
so they can be watched/reviewed instead of driven by hand. Each checkpoint drives
the actions, saves a screenshot to ui-seed/uat-screenshots/, runs a light
presence assert where deterministic, and prints what a human must judge.

Run:   cd ui-seed && python3 uat_replay_22.py
Watch: E2E_HEADLESS=0 python3 uat_replay_22.py
Then report verdicts (e.g. "T01 pass, T03 overlay laggy") and they get
recorded into 22-UAT.md.

Requires the stack up + demo data seeded (run seed_all.py first so the board
has cards).
"""

import os
import sys
import time

from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")
COLUMNS = ["UPCOMING", "NEXT WEEK", "EXECUTION", "CLOSING", "DONE"]
CARD = "Acme External Pentest"  # a seeded card


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*60}\n  {cid}: {title}\n{'='*60}", flush=True)


def t01_columns(driver):
    checkpoint("P02-T01", "Stage columns render")
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)
    body = driver.find_element(By.TAG_NAME, "body").text.upper()
    present = [c for c in COLUMNS if c in body]
    p = shot(driver, "p02-t01-columns.png")
    print(f"  Did: opened /board")
    print(f"  Auto-check: {len(present)}/5 stage columns found -> {present}")
    print(f"  Verify: each column has a header + count pill; empty columns show "
          f"'No projects in this stage'.")
    print(f"  Screenshot: {p}")


def t02_card(driver):
    checkpoint("P02-T02", "Card content is correct")
    driver.get(common.BASE_URL + "/board")
    time.sleep(2)
    opened = False
    for el in driver.find_elements(By.XPATH, f"//*[contains(normalize-space(), '{CARD}')]"):
        try:
            el.click()
            time.sleep(1.5)
            if driver.find_elements(By.XPATH, "//*[@role='dialog']"):
                opened = True
                break
        except Exception:
            continue
    p = shot(driver, "p02-t02-card.png")
    print(f"  Did: opened card '{CARD}' ({'modal open' if opened else 'modal NOT opened'})")
    print(f"  Verify: card/modal shows project name, client name, checklist N/M, "
          f"status badge, and a pin icon if manually placed.")
    print(f"  Screenshot: {p}")


def t03_drag(driver):
    checkpoint("P02-T03", "Drag a card between columns")
    driver.get(common.BASE_URL + "/board")
    time.sleep(2)
    cards = driver.find_elements(By.XPATH, f"//*[contains(normalize-space(), '{CARD}')]")
    if not cards:
        print(f"  Could not find a draggable card ('{CARD}').")
        shot(driver, "p02-t03-drag-nocard.png")
        return
    card = cards[0]
    before = shot(driver, "p02-t03-before.png")
    # @dnd-kit uses a pointer sensor: it activates on pointerdown + a small move,
    # then tracks pointermove. Replay with move-to-element-on-target (not blind
    # offsets, which just select text), plus an activation nudge between.
    target = None
    empties = driver.find_elements(By.XPATH, "//*[contains(normalize-space(), 'No projects in this stage')]")
    if empties:
        target = empties[0]  # NEXT WEEK (first empty column)
    try:
        ac = ActionChains(driver)
        ac.move_to_element(card).pause(0.3)
        ac.click_and_hold().pause(0.4)
        ac.move_by_offset(8, 8).pause(0.3)        # exceed activation distance
        if target is not None:
            ac.move_to_element(target).pause(0.4)
            ac.move_by_offset(2, 2).pause(0.4)    # settle over droppable
        else:
            ac.move_by_offset(300, 0).pause(0.4)
        ac.release().perform()
        time.sleep(2)
        note = "pointer drag to an empty column attempted (move-to-element)"
    except Exception as e:
        note = f"drag attempt error: {e}"
    after = shot(driver, "p02-t03-after.png")
    print(f"  Did: {note}")
    print(f"  Verify: while dragging, a card preview (drag overlay) follows the cursor; "
          f"on release the card lands in the target column and counts update.")
    print(f"  NOTE: @dnd-kit drag is pointer-based; Selenium replay is best-effort — "
          f"compare before/after screenshots, and watch live with E2E_HEADLESS=0 if unsure.")
    print(f"  Screenshots: {before} | {after}")


def t04_order(driver):
    checkpoint("P02-T04", "Cards ordered by assignment week")
    driver.get(common.BASE_URL + "/board")
    time.sleep(2)
    p = shot(driver, "p02-t04-order.png")
    print(f"  Did: opened /board for ordering review")
    print(f"  Verify: within a column holding several cards, cards are ordered by "
          f"assignment week ascending (earliest first); no-week cards sort last.")
    print(f"  Screenshot: {p}")


def run():
    driver = common.make_driver()
    try:
        common.banner("Phase 22 UAT replay (board) — login as pm")
        common.login(driver, "pm")
        t01_columns(driver)
        t02_card(driver)
        t03_drag(driver)
        t04_order(driver)
        print(f"\n{'='*60}")
        print(f"  Replay complete. Screenshots in: {SHOTS}")
        print(f"  Report verdicts per checkpoint (pass / skip / issue + note).")
        print(f"{'='*60}")
    finally:
        driver.quit()


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
