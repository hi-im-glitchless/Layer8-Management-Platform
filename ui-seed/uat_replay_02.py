#!/usr/bin/env python3
"""UAT replay — Phase 02 (Archive without typed project-name confirmation).

Replays / sets up the UI for the phase-02 UAT checkpoints so they can be watched
and judged instead of driven entirely by hand. Each checkpoint opens the right
screen, saves a screenshot to ui-seed/uat-screenshots/, runs a light
presence/absence assert where it is deterministic, and prints what a human must
judge.

The phase removes the "type the project name to confirm" gate from the admin
archive dialog. The deterministic part this script CAN check is the *absence* of
a typed-name text input inside the Archive confirm dialog (and the presence of an
enabled "Archive card" action + a "Cancel" button). Whether the warning copy and
overall UX read correctly is human judgment.

SAFETY: archiving hard-deletes the card's files irreversibly. This script opens
the confirm dialog and screenshots it but DOES NOT click the final "Archive card"
button — you decide and click. So it is safe to run against demo data.

Run:   cd ui-seed && python3 uat_replay_02.py
Watch: E2E_HEADLESS=0 python3 uat_replay_02.py

Requires the stack up + demo data seeded (run seed_all.py first so the board has
cards). Logs in as admin (archive is ADMIN-only). Override the card it opens with
E2E_UAT_CARD; override a known project-less card with E2E_UAT_CARD_NOPROJECT.
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD = os.environ.get("E2E_UAT_CARD", "Acme External Pentest")
CARD_NOPROJECT = os.environ.get("E2E_UAT_CARD_NOPROJECT", "")


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


def open_card_modal(driver, card_text):
    """Click a card by its visible text and wait for the detail modal (dialog)."""
    open_board(driver)
    for el in driver.find_elements(
        By.XPATH, f"//*[contains(normalize-space(), '{card_text}')]"
    ):
        try:
            el.click()
            time.sleep(1.5)
            if driver.find_elements(By.XPATH, "//*[@role='dialog']"):
                return True
        except Exception:
            continue
    return False


def open_archive_dialog(driver):
    """From an open card detail modal, click 'Archive card' and wait for the
    AlertDialog. Returns True if an alertdialog/dialog with an 'Archive card'
    action appeared."""
    btns = driver.find_elements(
        By.XPATH,
        "//button[normalize-space()='Archive card' or .//*[normalize-space()='Archive card']]",
    )
    if not btns:
        return False
    btns[0].click()
    time.sleep(1.0)
    # The confirm is a Radix AlertDialog; the action button reads 'Archive card'.
    return bool(
        driver.find_elements(
            By.XPATH,
            "//*[@role='alertdialog']//button[normalize-space()='Archive card']"
            " | //*[@role='dialog']//button[normalize-space()='Archive card']",
        )
    )


def dialog_has_text_input(driver):
    """True if the open archive confirm dialog contains any typeable text input
    (the removed typed-name gate). After this phase it must be False."""
    return bool(
        driver.find_elements(
            By.XPATH,
            "(//*[@role='alertdialog'] | //*[@role='dialog'])"
            "//input[not(@type) or @type='text' or @type='search']",
        )
    )


def archive_action_enabled(driver):
    """True if the 'Archive card' action button is enabled (not disabled)."""
    els = driver.find_elements(
        By.XPATH,
        "(//*[@role='alertdialog'] | //*[@role='dialog'])"
        "//button[normalize-space()='Archive card']",
    )
    if not els:
        return False
    btn = els[-1]
    return btn.is_enabled() and (btn.get_attribute("disabled") in (None, "false"))


def t01_no_typed_name_gate(driver):
    checkpoint("P01-T01", "Archive confirm dialog has no typed-name gate")
    opened = open_card_modal(driver, CARD)
    if not opened:
        print(f"  Could not open a card modal for '{CARD}'. "
              f"Set E2E_UAT_CARD to a card visible on the board.")
        shot(driver, "p02-t01-no-card.png")
        return
    got_dialog = open_archive_dialog(driver)
    path = shot(driver, "p02-t01-archive-dialog.png")
    if not got_dialog:
        print("  Opened the card modal but could not open the Archive confirm "
              "dialog. Is this user an ADMIN and the card not already archived?")
        print(f"  Screenshot: {path}")
        return
    has_input = dialog_has_text_input(driver)
    enabled = archive_action_enabled(driver)
    print(f"  Did: opened card '{CARD}' -> clicked 'Archive card' -> confirm dialog open")
    print(f"  Auto-check: typed-name input present? {has_input}  (expected: False)")
    print(f"  Auto-check: 'Archive card' action enabled? {enabled}  (expected: True)")
    print(f"  Screenshot: {path}")
    print("  Verify (human): the dialog shows the 'permanently delete N files' "
          "warning + Archive/Cancel, NO 'type the project name' field, and the "
          "Archive button is enabled without typing. Clicking 'Archive card' "
          "archives in one confirm. (Script does NOT click it — files are "
          "hard-deleted; you decide.)")


def t02_projectless_card(driver):
    checkpoint("P01-T02", "A card with no linked project archives cleanly")
    if CARD_NOPROJECT:
        opened = open_card_modal(driver, CARD_NOPROJECT)
        target = CARD_NOPROJECT
    else:
        opened = False
        target = "(none configured)"
    if not opened:
        print("  No project-less card opened (set E2E_UAT_CARD_NOPROJECT to one "
              "if you have it). Judge the dialog logic generally instead:")
        print("  Verify (human): nothing in the Archive confirm dialog depends on "
              "a project name existing — a project-less card opens the same "
              "single-confirm dialog with no broken/empty 'type the name' state "
              "blocking the Archive button (old edge case resolved).")
        return
    got_dialog = open_archive_dialog(driver)
    path = shot(driver, "p02-t02-archive-dialog-noproject.png")
    has_input = dialog_has_text_input(driver)
    enabled = archive_action_enabled(driver)
    print(f"  Did: opened project-less card '{target}' -> Archive confirm dialog "
          f"({'open' if got_dialog else 'NOT open'})")
    print(f"  Auto-check: typed-name input present? {has_input}  (expected: False)")
    print(f"  Auto-check: 'Archive card' action enabled? {enabled}  (expected: True)")
    print(f"  Screenshot: {path}")
    print("  Verify (human): the dialog and Archive button behave the same with "
          "no linked project — nothing is blocked by a missing name.")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "admin")
        t01_no_typed_name_gate(driver)
        t02_projectless_card(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
