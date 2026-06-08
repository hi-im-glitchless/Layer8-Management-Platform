#!/usr/bin/env python3
"""UAT replay — Phase 05 (two board bug fixes).

Replays / sets up the UI for the phase-05 UAT checkpoints so they can be watched
and judged instead of driven entirely by hand. Each checkpoint opens the right
screen, saves a screenshot to ui-seed/uat-screenshots/, runs a light
presence/measurement assert where it is deterministic, and prints what a human
must judge.

Two bugs are covered:

* Bug 1 (P01-T01) — status sync: a project's status edited on the Schedule now
  propagates to that project's board card automatically, with NO manual refresh.
  Driving a cross-view *live* update end-to-end in Selenium is brittle, so this
  checkpoint automates what is deterministic (reading the board card's status
  badge text via a stable selector) and instructs the human to perform the edit
  on the schedule and watch the board update on its own.

* Bug 2 (P02-T01) — modal overlap: in the card detail modal the close (X) button
  (top-right) and the "manually placed" pin icon (in the title row) no longer
  overlap. This checkpoint opens a card modal, screenshots the top-right corner,
  and DETERMINISTICALLY measures both elements' bounding rects to report whether
  they intersect — expected: NO overlap.

SAFETY: Bug 2 is non-destructive (navigate + read + screenshot only). Bug 1 asks
the HUMAN to change a project's status on the schedule and save it — that DOES
modify demo data on the schedule side. The script itself does not mutate data; it
only reads the board badge and parks the schedule open with instructions.

Run:   cd ui-seed && python3 uat_replay_05.py
Watch: E2E_HEADLESS=0 python3 uat_replay_05.py
Then report verdicts per checkpoint (e.g. "P01-T01 pass, P02-T01 pass").

Requires the stack up + demo data seeded (run seed_all.py first so the board has
cards). Logs in as pm (PM can see the board and edit the schedule). Override the
target card with E2E_UAT_CARD.
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD = os.environ.get("E2E_UAT_CARD", "Acme External Pentest")

# --- Selectors ---------------------------------------------------------------
# KanbanCard outermost container (frontend/.../KanbanCard.tsx: bg-card div).
CARD_XPATH = "//div[contains(@class,'bg-card')]"

# StatusBadge on the card (KanbanCard.tsx StatusBadge): a <span> styled
# text-[10px] font-medium px-1.5 py-0.5 rounded. Read its text for Bug 1.
CARD_STATUS_BADGE = (
    ".//span[contains(@class,'text-[10px]') and contains(@class,'font-medium')"
    " and contains(@class,'rounded')]"
)

# CardDetailModal close (X): the shadcn DialogContent close button
# (frontend/src/components/ui/dialog.tsx) is a Radix DialogPrimitive.Close with
# an sr-only "Close" label. Match by the sr-only span or the button wrapping it.
MODAL_CLOSE = (
    "//*[@role='dialog']//button[.//span[normalize-space()='Close']]"
)

# CardDetailModal "manually placed" pin button: in the DialogTitle row
# (CardDetailModal.tsx ~L504-518) a <button> wrapping a lucide <Pin> icon, shown
# only when isManuallyPlaced. Lucide renders <svg class="lucide lucide-pin ...">.
MODAL_PIN_BTN = (
    "//*[@role='dialog']//button[.//*[contains(@class,'lucide-pin')]]"
)
# Fallback: any button inside the DialogTitle header row (the only header button
# besides the X is the pin), used to note presence if the lucide class differs.
MODAL_TITLE_BTN = "//*[@role='dialog']//h2/following-sibling::*//button | //*[@role='dialog']//*[contains(@class,'flex')]//button[.//*[local-name()='svg']]"


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


def find_card(driver, card_text):
    """Return the card container element whose subtree contains card_text."""
    for c in driver.find_elements(By.XPATH, CARD_XPATH):
        try:
            if card_text in (c.text or ""):
                return c
        except Exception:
            continue
    return None


def card_status_text(card):
    """Best-effort read of a card's StatusBadge text (deterministic), else None."""
    els = card.find_elements(By.XPATH, CARD_STATUS_BADGE)
    for el in els:
        txt = (el.text or "").strip()
        if txt:
            return txt
    return None


def open_card_modal(driver, card_text):
    """Open the board, click the matching card, wait for the detail dialog."""
    open_board(driver)
    card = find_card(driver, card_text)
    if card is None:
        return False
    try:
        card.click()
    except Exception:
        # Click a child if the container intercepts the event.
        for child in card.find_elements(By.XPATH, ".//*"):
            try:
                child.click()
                break
            except Exception:
                continue
    time.sleep(1.5)
    return bool(driver.find_elements(By.XPATH, "//*[@role='dialog']"))


def rects_overlap(a, b):
    """True if two {x,y,width,height} rects intersect (positive overlap area)."""
    ax2, ay2 = a["x"] + a["width"], a["y"] + a["height"]
    bx2, by2 = b["x"] + b["width"], b["y"] + b["height"]
    ix = max(0.0, min(ax2, bx2) - max(a["x"], b["x"]))
    iy = max(0.0, min(ay2, by2) - max(a["y"], b["y"]))
    return (ix > 0) and (iy > 0)


def element_rect(driver, el):
    """Bounding rect via getBoundingClientRect (robust, viewport coords)."""
    return driver.execute_script(
        "const r = arguments[0].getBoundingClientRect();"
        "return {x:r.x, y:r.y, width:r.width, height:r.height};",
        el,
    )


def t01_status_sync(driver):
    checkpoint("P01-T01", "Schedule status edit propagates to the board card (no refresh)")
    open_board(driver)
    card = find_card(driver, CARD)
    path = shot(driver, "p05-t01-board-before.png")
    if card is None:
        print(f"  Could not find a board card containing '{CARD}'. "
              f"Set E2E_UAT_CARD to a card visible on the board.")
        print(f"  Screenshot: {path}")
        return
    before = card_status_text(card)
    print(f"  Did: opened /board, located card '{CARD}'.")
    print(f"  Auto-read: card status badge BEFORE = "
          f"{before!r}  (deterministic read; compare after the edit)")
    print(f"  Screenshot (board before): {path}")

    # Park the schedule open so the human can perform the edit.
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    spath = shot(driver, "p05-t01-schedule.png")
    print(f"  Screenshot (schedule): {spath}")
    print("  Verify (human): "
          f"1) On /schedule, open this project's assignment (click the project's "
          f"assignment cell for '{CARD}') to open the Assignment modal. "
          "2) In the modal's 'Status' selector pick a DIFFERENT status "
          "(Placeholder / Needs Requirements / Confirmed) and Save. "
          "3) Switch back to /board WITHOUT pressing browser refresh (use the in-app "
          "nav) and confirm the card's status badge has updated automatically to "
          "the new status. The badge text above is the BEFORE value to compare "
          "against. (Driving the live cross-view update is brittle, so the edit is "
          "left to you; the BEFORE badge read is automated.)")


def t02_modal_overlap(driver):
    checkpoint("P02-T01", "Card modal: close (X) and manually-placed pin do NOT overlap")
    opened = open_card_modal(driver, CARD)
    if not opened:
        print(f"  Could not open a card modal for '{CARD}'. "
              f"Set E2E_UAT_CARD to a card visible on the board.")
        shot(driver, "p05-t02-no-modal.png")
        return
    path = shot(driver, "p05-t02-modal-topright.png")

    close_els = driver.find_elements(By.XPATH, MODAL_CLOSE)
    pin_els = driver.find_elements(By.XPATH, MODAL_PIN_BTN)
    has_pin = bool(pin_els)

    print(f"  Did: opened card modal for '{CARD}'.")
    print(f"  Auto-check: close (X) button found? {bool(close_els)}")
    print(f"  Auto-check: manually-placed pin icon present? {has_pin}  "
          f"(only manually-placed cards show the pin; if False, this card is "
          f"auto-placed — open a pinned card via E2E_UAT_CARD to fully verify)")

    if close_els and pin_els:
        try:
            cr = element_rect(driver, close_els[0])
            pr = element_rect(driver, pin_els[0])
            overlap = rects_overlap(cr, pr)
            print(f"  Auto-measure: close rect = {cr}")
            print(f"  Auto-measure: pin rect   = {pr}")
            print(f"  Auto-check: rects overlap? {overlap}  (expected: False)")
        except Exception as e:
            print(f"  Auto-measure failed ({e}); judge from the screenshot.")
    elif close_els and not pin_els:
        try:
            cr = element_rect(driver, close_els[0])
            print(f"  Auto-measure: close rect = {cr} (no pin on this card to compare)")
        except Exception:
            pass

    print(f"  Screenshot (modal top-right): {path}")
    print("  Verify (human): in the modal's top-right area both the close (X) "
          "button and the 'manually placed' pin icon are fully visible, NOT "
          "overlapping, and each is independently clickable (hovering the pin "
          "shows its tooltip; X closes the modal).")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "pm")
        t01_status_sync(driver)
        t02_modal_overlap(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P02-T01 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
