#!/usr/bin/env python3
"""UAT replay — Phase 11 (PM role can view & open archived cards; archive stays ADMIN-only).

Phase 11 widens the "Show Archived" toggle on the board to the PM role (was
ADMIN-only) so project managers can see and open archived cards. The archive
ACTION stays ADMIN-only on every path: the Archive button is hidden for PM, and
the drag-to-archive PATCH hole is closed server-side (PATCH /cards/:id with
stage='archived' returns 403 for non-ADMIN).

This replay drives the board as PM, then as ADMIN, and reports what each role
sees so you can confirm:
  - PM sees the Show-Archived toggle, can enable it, and can OPEN an archived
    card's detail (read access).
  - PM has NO Archive button on a card detail (archive action stays ADMIN-only).
  - ADMIN still sees both the toggle and the Archive button.

SAFETY: non-destructive — navigate + toggle a view filter + open a read-only
detail modal + screenshot only. It never clicks Archive and never confirms any
destructive dialog.

Run:   cd ui-seed && python3 uat_replay_11.py
Watch: E2E_HEADLESS=0 python3 uat_replay_11.py
Then report verdicts (e.g. "P01-T01 pass, P01-T02 pass").

Requires the stack up + demo data that includes at least one ARCHIVED card.
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD_XPATH = "//div[contains(@class,'bg-card')]"


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


def find_show_archived_toggle(driver):
    """Return the Show-Archived control element if present, else None."""
    candidates = driver.find_elements(
        By.XPATH,
        "//*[contains(translate(normalize-space(.),"
        "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),"
        "'archived')]",
    )
    # Prefer a clickable control (button/label/input) over a generic container
    for el in candidates:
        if el.tag_name in ("button", "label", "input"):
            return el
    return candidates[0] if candidates else None


def find_archive_button(driver):
    """Return an Archive action button within an open card detail, else None."""
    for b in driver.find_elements(By.XPATH, "//button"):
        try:
            if (b.text or "").strip().lower() == "archive":
                return b
        except Exception:
            continue
    return None


def open_first_card_detail(driver):
    cards = driver.find_elements(By.XPATH, CARD_XPATH)
    if not cards:
        return False
    try:
        cards[0].click()
        time.sleep(1.5)
        return True
    except Exception:
        return False


def t01_pm_sees_and_opens_archived(driver):
    checkpoint("P01-T01", "PM sees the Show-Archived toggle and can open an archived card")
    common.login(driver, "pm")
    open_board(driver)
    toggle = find_show_archived_toggle(driver)
    print(f"  PM: Show-Archived control present: {toggle is not None}")
    if toggle is not None:
        try:
            toggle.click()
            time.sleep(2)
            print("  PM: clicked Show-Archived (archived cards should now appear)")
        except Exception as e:
            print(f"  PM: could not click toggle automatically ({e}) — toggle visually")
    path = shot(driver, "p11-t01-pm-board-archived.png")
    opened = open_first_card_detail(driver)
    if opened:
        shot(driver, "p11-t01-pm-card-detail.png")
        print("  PM: opened a card detail modal (read access OK)")
    print(f"  Screenshot (board): {path}")
    print("  Verify (human): as PM, the 'Show Archived' toggle IS visible; enabling it "
          "reveals archived cards; clicking an archived card OPENS its detail (read).")


def t02_pm_cannot_archive(driver):
    checkpoint("P01-T02", "PM has NO Archive action; archive stays ADMIN-only")
    # Reuse PM session; open an (archived or normal) card detail and look for Archive.
    open_board(driver)
    toggle = find_show_archived_toggle(driver)
    if toggle is not None:
        try:
            toggle.click()
            time.sleep(2)
        except Exception:
            pass
    open_first_card_detail(driver)
    pm_archive_btn = find_archive_button(driver)
    shot(driver, "p11-t02-pm-card-detail.png")
    print(f"  PM: Archive button present in card detail: {pm_archive_btn is not None} "
          f"(expected: False)")
    driver.quit()

    # Now ADMIN: confirm the toggle AND the Archive button are both present.
    admin = common.make_driver()
    try:
        common.login(admin, "admin")
        open_board(admin)
        admin_toggle = find_show_archived_toggle(admin)
        if admin_toggle is not None:
            try:
                admin_toggle.click()
                time.sleep(2)
            except Exception:
                pass
        open_first_card_detail(admin)
        admin_archive_btn = find_archive_button(admin)
        shot(admin, "p11-t02-admin-card-detail.png")
        print(f"  ADMIN: Show-Archived control present: {admin_toggle is not None} "
              f"(expected: True)")
        print(f"  ADMIN: Archive button present in card detail: "
              f"{admin_archive_btn is not None} (expected: True)")
    finally:
        admin.quit()

    print("  Verify (human): PM card detail shows NO Archive button. ADMIN sees the "
          "toggle AND the Archive button. (Server-side, a PM drag-to-archive PATCH "
          "returns 403 — covered by boardPatchArchiveGuard.test.ts.)")


def main():
    driver = common.make_driver()
    quit_in_t02 = False
    try:
        t01_pm_sees_and_opens_archived(driver)
        t02_pm_cannot_archive(driver)  # quits the PM driver, spins up ADMIN itself
        quit_in_t02 = True
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass').", flush=True)
    finally:
        if not quit_in_t02:
            driver.quit()


if __name__ == "__main__":
    main()
