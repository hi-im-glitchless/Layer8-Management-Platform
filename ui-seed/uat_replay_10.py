#!/usr/bin/env python3
"""UAT replay — Phase 10 (Planner card client name: bold + client colour).

The planner/board (Kanban) card preview now renders the **client name** in bold
and coloured with the client's own colour (`Client.color`). A light-colour
legibility guard falls back to a readable dark colour when a client's hex is too
pale for the white card. Frontend-only; Schedule unchanged.

This replay parks you on the board and reports, per card, the client-name text,
its computed font-weight, and its computed colour — so you can confirm the names
are bold and tinted with each client's colour, and remain readable.

SAFETY: non-destructive — navigate + read computed styles + screenshot only.

Run:   cd ui-seed && python3 uat_replay_10.py
Watch: E2E_HEADLESS=0 python3 uat_replay_10.py
Then report verdicts (e.g. "P01-T01 pass, P01-T02 pass").

Requires the stack up + demo data with clients that have distinct colours
(ideally including at least one pale/near-white client colour to exercise the
legibility fallback). Logs in as pm.
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD_XPATH = "//div[contains(@class,'bg-card')]"
# the client name is the 2nd text line on the card (muted previously, now bold+coloured)


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


def scan_client_names(driver):
    """Report (card label, client-name text, fontWeight, color) for bold+coloured <p>s."""
    rows = []
    for c in driver.find_elements(By.XPATH, CARD_XPATH):
        label = (c.text or "").strip().split("\n")[0][:32]
        # find <p> elements on the card and pick the bold one(s) (the client name)
        for p in c.find_elements(By.XPATH, ".//p"):
            try:
                txt = (p.text or "").strip()
                if not txt:
                    continue
                weight = driver.execute_script(
                    "return getComputedStyle(arguments[0]).fontWeight", p)
                color = driver.execute_script(
                    "return getComputedStyle(arguments[0]).color", p)
                # heuristic: bold lines are the styled client name
                if str(weight) in ("700", "bold"):
                    rows.append((label, txt, weight, color))
            except Exception:
                continue
    return rows


def t01_bold_coloured(driver):
    checkpoint("P01-T01", "Client name is bold and in the client's colour")
    open_board(driver)
    path = shot(driver, "p10-t01-board.png")
    rows = scan_client_names(driver)
    if rows:
        for label, txt, weight, color in rows[:20]:
            print(f"  card {label!r}: client={txt!r} weight={weight} color={color}")
    else:
        print("  (no bold client-name <p> detected automatically — verify visually)")
    print(f"  Screenshot (board): {path}")
    print("  Verify (human): on each card, the client name (the line under the project "
          "name) is BOLD and rendered in that client's colour. Two cards with different "
          "clients show different name colours. The colour matches the client's colour "
          "shown elsewhere (e.g. schedule/client admin).")


def t02_legible(driver):
    checkpoint("P01-T02", "Pale client colours stay readable (legibility guard)")
    open_board(driver)
    shot(driver, "p10-t02-board.png")
    print("  Verify (human): find a client whose colour is very pale/near-white. Its "
          "name on the card must still be clearly readable on the white card (the "
          "guard renders a dark colour instead of the washed-out hex), NOT invisible. "
          "Cards/clients with no colour render the name safely (no blank/broken text). "
          "The Schedule view is unchanged.")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "pm")
        t01_bold_coloured(driver)
        t02_legible(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
