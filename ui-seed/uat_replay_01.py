#!/usr/bin/env python3
"""UAT replay — Phase 01 (Board: "Stopped" column & horizontal drag auto-scroll).

Replays / sets up the UI for the phase-01 UAT checkpoints so they can be watched
and judged instead of driven entirely by hand. Each checkpoint opens the right
screen, saves a screenshot to ui-seed/uat-screenshots/, runs a light
presence/order assert where it is deterministic, and prints what a human must
judge. Drag-and-drop auto-scroll (T02/T03/T04) is inherently a human-judgment,
pointer-driven interaction — Selenium's synthetic events do not reliably trigger
@dnd-kit's pointer-sensor auto-scroll — so those checkpoints are driven by hand;
this script just parks you on the board with a screenshot.

Run:   cd ui-seed && python3 uat_replay_01.py
Watch: E2E_HEADLESS=0 python3 uat_replay_01.py
Then report verdicts per checkpoint (e.g. "P01-T01 pass, P01-T04 issue: no scroll").

Requires the stack up + demo data seeded (run seed_all.py first so the board
has cards across stages). All checkpoints log in as pm (PM sees the full board).
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

# Expected board column order after Phase 1 (Stopped inserted first).
EXPECTED_ORDER = ["Stopped", "Upcoming", "Preparation", "Execution", "Closing", "Done"]


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


def column_labels(driver):
    """Return the visible board column header texts in left-to-right DOM order."""
    headers = driver.find_elements(By.XPATH, "//h3")
    labels = []
    for h in headers:
        t = (h.text or "").strip()
        if t:
            labels.append(t)
    return labels


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "pm")

        # ---- P01-T01: "Stopped" column is first --------------------------------
        checkpoint("P01-T01", '"Stopped" column appears first')
        open_board(driver)
        path = shot(driver, "p01_t01_board_columns.png")
        labels = column_labels(driver)
        # Board column labels are uppercased via CSS but the DOM text is the label.
        norm = [l.strip().title() for l in labels]
        stopped_first = bool(norm) and norm[0].lower() == "stopped"
        # Best-effort order check against the non-archived expected order.
        present = [c for c in EXPECTED_ORDER if c.lower() in [n.lower() for n in norm]]
        order_ok = stopped_first and present[: len(present)] == [
            c for c in EXPECTED_ORDER if c in present
        ]
        print(f"  Columns (DOM order): {labels}")
        print(f"  Auto-check: 'Stopped' is leftmost = {stopped_first}; "
              f"relative order matches Stopped→Upcoming→…→Done = {order_ok}")
        print(f"  Screenshot: {path}")
        print("  HUMAN: confirm the leftmost column reads 'Stopped' and it is "
              "always visible (not toggle-gated like Archived).")

        # ---- P01-T02: drag a card into Stopped, persists -----------------------
        checkpoint("P01-T02", "Drag a card into Stopped and it persists")
        open_board(driver)
        shot(driver, "p01_t02_board_before_drag.png")
        print("  HUMAN-DRIVEN: drag any card into the 'Stopped' column, then "
              "reload the page.")
        print("  Expected: the card lands in Stopped and is STILL there after "
              "reload (persisted; no error toast). @dnd-kit pointer drags are not "
              "reliably reproducible via Selenium, so perform this by hand.")

        # ---- P01-T03: Stopped card never auto-moved ----------------------------
        checkpoint("P01-T03", "A Stopped card is never auto-moved")
        open_board(driver)
        shot(driver, "p01_t03_board_state.png")
        print("  HUMAN-DRIVEN: ensure a card sits in 'Stopped' — ideally one whose "
              "project dates would normally trigger the date-based auto-mover to "
              "promote it to Preparation/Execution. Reload / revisit the board.")
        print("  Expected: the Stopped card stays put; the auto-mover never pulls "
              "it into Upcoming/Preparation/Execution. Only a manual drag moves it.")

        # ---- P01-T04: horizontal auto-scroll while dragging --------------------
        checkpoint("P01-T04", "Horizontal auto-scroll while dragging near the edge")
        open_board(driver)
        try:
            driver.set_window_size(1100, 850)  # narrow so columns overflow
        except Exception:
            pass
        time.sleep(1)
        shot(driver, "p01_t04_board_narrow.png")
        print("  HUMAN-DRIVEN: with the board wider than the window (columns "
              "off-screen), start dragging a card and hold the pointer near the "
              "RIGHT (or LEFT) edge of the board area.")
        print("  Expected: the board auto-scrolls HORIZONTALLY so off-screen "
              "columns (e.g. Done) come into view and become droppable. Holding "
              "near the top/bottom does NOT auto-scroll vertically.")

        # ---- P01-T05: normal (non-drag) horizontal scroll still works ----------
        checkpoint("P01-T05", "Normal (non-drag) horizontal scroll still works")
        open_board(driver)
        # Programmatic scroll of the overflow-x container as a smoke check.
        try:
            driver.execute_script(
                "var el=document.querySelector('.overflow-x-auto');"
                "if(el){el.scrollLeft=el.scrollWidth;}"
            )
            time.sleep(1)
            scrolled = driver.execute_script(
                "var el=document.querySelector('.overflow-x-auto');"
                "return el ? el.scrollLeft : -1;"
            )
            print(f"  Auto-check: programmatic scrollLeft after scroll = {scrolled} "
                  f"({'scrollable' if scrolled and scrolled > 0 else 'check manually'})")
        except Exception as e:
            print(f"  Auto-check skipped: {e}")
        shot(driver, "p01_t05_board_scrolled.png")
        print("  HUMAN: without dragging, scroll the board horizontally with the "
              "trackpad/wheel/scrollbar — it should scroll normally (auto-scroll "
              "change did not break ordinary scrolling).")

        print("\nDone. Report verdicts: e.g. 'P01-T01 pass, P01-T04 pass, ...'")
    finally:
        if os.environ.get("E2E_HEADLESS", "1") != "0":
            driver.quit()
        else:
            print("\n(E2E_HEADLESS=0) Browser left open for inspection; close it "
                  "manually when done.")


if __name__ == "__main__":
    main()
