#!/usr/bin/env python3
"""UAT replay — Phase 03 (Board files: view/download broadened to any team member).

Replays / sets up the UI for the phase-03 UAT checkpoints so they can be watched
and judged instead of driven entirely by hand. Each checkpoint opens the right
screen, saves a screenshot to ui-seed/uat-screenshots/, runs a light
presence/absence assert where it is deterministic, and prints what a human must
judge.

The phase broadens board-file VIEW/DOWNLOAD to any authenticated team member
(previously restricted), while UPLOAD and DELETE stay restricted to PM/ADMIN.
This script logs in as the `normal` role — which for the test to be meaningful
MUST be a team member who is NOT assigned to the opened card's project (so the
broadening is what grants visibility, not assignment). The deterministic parts
this script CAN check: a Download control is present/enabled on a file row, an
upload dropzone exists, and NO per-file Delete control is rendered for a NORMAL
user (delete stays PM/ADMIN-gated). Whether a download actually succeeds with no
Forbidden/permission error, and whether an upload attempt is rejected with a 403
toast, are the human-judgment outcomes.

SAFETY: this script is read-only with respect to mutations. Downloading is
read-only so clicking Download is fine, but the script DOES NOT upload a file and
DOES NOT delete anything — it only locates those controls and tells you what to
try by hand. Safe to run against demo data.

Run:   cd ui-seed && python3 uat_replay_03.py
Watch: E2E_HEADLESS=0 python3 uat_replay_03.py

Requires the stack up + demo data seeded (run seed_all.py first so the board has
cards with files). Logs in as the `normal` role (must be a member NOT assigned to
the card's project). Override the card it opens with E2E_UAT_CARD.
"""

import os
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


def open_files_panel(driver):
    """The Files panel is rendered inline in the card detail dialog (no tab to
    click) under an <h3>Files</h3> heading. Scroll it into view and confirm it is
    present. Returns True if the Files heading is found."""
    headings = driver.find_elements(
        By.XPATH,
        "//*[@role='dialog']//h3[normalize-space()='Files']"
        " | //h3[normalize-space()='Files']",
    )
    if not headings:
        return False
    try:
        driver.execute_script("arguments[0].scrollIntoView(true);", headings[0])
        time.sleep(0.5)
    except Exception:
        pass
    return True


def find_download_controls(driver):
    """Per-file Download buttons render as <button aria-label='Download {name}'>."""
    return driver.find_elements(
        By.XPATH,
        "(//*[@role='dialog'] | //body)"
        "//button[starts-with(@aria-label, 'Download')]",
    )


def find_delete_controls(driver):
    """Per-file Delete buttons render as <button aria-label='Delete {name}'> and
    are only rendered for PM/ADMIN (canDelete). A NORMAL user must see NONE."""
    return driver.find_elements(
        By.XPATH,
        "(//*[@role='dialog'] | //body)"
        "//button[starts-with(@aria-label, 'Delete') "
        "and not(starts-with(@aria-label, 'Delete comment'))]",
    )


def find_upload_dropzone(driver):
    """The upload control is a role='button' dropzone with the text
    'Drop a file or click to upload' (or 'Uploading…' while pending)."""
    return driver.find_elements(
        By.XPATH,
        "(//*[@role='dialog'] | //body)"
        "//*[@role='button'][contains(normalize-space(), 'Drop a file')"
        " or contains(normalize-space(), 'click to upload')"
        " or contains(normalize-space(), 'Uploading')]",
    )


def control_enabled(el):
    """True if a button element is enabled (not disabled)."""
    return el.is_enabled() and (el.get_attribute("disabled") in (None, "false"))


def t01_member_can_download(driver):
    checkpoint("P01-T01", "Non-assigned member can view & download a file")
    opened = open_card_modal(driver, CARD)
    if not opened:
        print(f"  Could not open a card modal for '{CARD}'. "
              f"Set E2E_UAT_CARD to a card visible on the board.")
        shot(driver, "p03-t01-no-card.png")
        return
    if not open_files_panel(driver):
        path = shot(driver, "p03-t01-no-files-panel.png")
        print("  Opened the card modal but could not find the Files panel "
              "(<h3>Files</h3>). Screenshot: " + path)
        return
    path = shot(driver, "p03-t01-files-panel.png")
    downloads = find_download_controls(driver)
    has_download = len(downloads) > 0
    enabled = bool(downloads) and control_enabled(downloads[0])
    print(f"  Did: opened card '{CARD}' as 'normal' -> scrolled to Files panel")
    print(f"  Auto-check: Download control present? {has_download}  (expected: True)")
    print(f"  Auto-check: first Download control enabled? {enabled}  (expected: True)")
    if has_download:
        try:
            downloads[0].click()
            time.sleep(1.5)
            print("  Did: clicked the first file's Download control (read-only).")
        except Exception as e:
            print(f"  Note: could not click Download automatically ({e}); "
                  "trigger it by hand.")
    else:
        print("  No file row to download — ensure the card has at least one "
              "non-quarantined file (seed_all.py / E2E_UAT_CARD).")
    path2 = shot(driver, "p03-t01-after-download-click.png")
    print(f"  Screenshots: {path} , {path2}")
    print("  Verify (human): as this non-assigned 'normal' member, the file row is "
          "visible and clicking Download actually downloads the file with NO "
          "Forbidden/permission error toast (the broadened view/download works).")


def t02_mutations_restricted(driver):
    checkpoint("P01-T02", "Read-only broadening — upload/delete stay restricted")
    # Reuse the already-open modal from T01 when possible; reopen if it closed.
    if not driver.find_elements(By.XPATH, "//*[@role='dialog']"):
        if not open_card_modal(driver, CARD):
            print(f"  Could not reopen card modal for '{CARD}'. "
                  f"Set E2E_UAT_CARD to a card visible on the board.")
            shot(driver, "p03-t02-no-card.png")
            return
    if not open_files_panel(driver):
        path = shot(driver, "p03-t02-no-files-panel.png")
        print("  Could not find the Files panel (<h3>Files</h3>). "
              "Screenshot: " + path)
        return
    upload_zone = find_upload_dropzone(driver)
    has_upload = len(upload_zone) > 0
    delete_controls = find_delete_controls(driver)
    has_delete = len(delete_controls) > 0
    path = shot(driver, "p03-t02-files-panel-mutations.png")
    print(f"  Did: inspected the Files panel on card '{CARD}' as 'normal'")
    print(f"  Auto-check: upload dropzone present? {has_upload}  "
          f"(present is OK — the gate is server-side; do NOT actually upload here)")
    print(f"  Auto-check: per-file Delete control present? {has_delete}  "
          f"(expected: False — delete stays PM/ADMIN)")
    print(f"  Screenshot: {path}")
    print("  Verify (human): view + download work for this non-assigned member, "
          "but mutations stay restricted — if you TRY an upload it is rejected "
          "with a 403/permission toast (do not rely on the dropzone being hidden; "
          "the gate is server-side), and there is NO per-file Delete (trash) "
          "control for this NORMAL user. (Script does NOT upload or delete.)")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "normal")
        t01_member_can_download(driver)
        t02_mutations_restricted(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
