#!/usr/bin/env python3
"""UAT replay — Phase 01 (PM Project Delete & Lock).

Replays the UI actions for this phase's UAT checkpoints so they can be
watched/reviewed instead of driven by hand. Each checkpoint drives the actions,
saves a screenshot to ui-seed/uat-screenshots/, runs a light presence assert
where deterministic, and prints what a HUMAN must judge.

Run:   cd ui-seed && python3 uat_replay_25.py
Watch: E2E_HEADLESS=0 python3 uat_replay_25.py
Then report verdicts per checkpoint (e.g. "T01 pass, P02-T02 issue: delete not disabled").

Requires the stack up + demo data seeded (run seed_all.py first so the board has
cards and the schedule has assignments, including at least one split cell).

This replay is NON-DESTRUCTIVE: it surfaces the Delete affordance and the
confirmation dialog but CANCELS instead of confirming, and it toggles a lock and
then toggles it back. The actual permanent-delete (P01-T02 confirm step) and any
data mutation are left for the human to perform deliberately on a disposable card.

Roles: P01-T01 checks pm / normal / admin; the rest log in as pm.
"""

import os
import sys
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*64}\n  {cid}: {title}\n{'='*64}", flush=True)


def open_first_board_card(driver):
    """Best-effort: open the first board card's detail modal."""
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)
    cards = driver.find_elements(
        By.XPATH,
        "//*[@role='button' or @draggable='true'][.//text()]"
        "[ancestor::*[contains(@class,'column') or contains(@class,'kanban') or contains(@class,'board')]]",
    )
    if not cards:
        cards = driver.find_elements(By.XPATH, "//*[@draggable='true']")
    for c in cards:
        try:
            if c.text.strip():
                c.click()
                time.sleep(1.5)
                if driver.find_elements(By.XPATH, "//*[@role='dialog']"):
                    return True
        except Exception:
            continue
    return False


def find_delete_button(driver):
    return driver.find_elements(
        By.XPATH,
        "//*[@role='dialog']//button[contains(normalize-space(),'Delete')]",
    )


def open_first_schedule_cell(driver, split_only=False):
    """Best-effort: click a filled schedule grid cell (optionally a split one)."""
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    cells = driver.find_elements(By.XPATH, "//table//td[normalize-space()]")
    for c in cells:
        try:
            txt = c.text.strip()
            if not txt:
                continue
            if split_only and "\n" not in txt:
                continue
            c.click()
            time.sleep(1.5)
            return True
        except Exception:
            continue
    return False


def p01_t01_delete_affordance(driver):
    checkpoint("P01-T01", "PM-gated Delete affordance on a board card")
    for role in ("pm", "normal", "admin"):
        common.login(driver, role)
        opened = open_first_board_card(driver)
        dels = find_delete_button(driver) if opened else []
        archs = (
            driver.find_elements(
                By.XPATH, "//*[@role='dialog']//button[contains(normalize-space(),'Archive')]"
            )
            if opened
            else []
        )
        p = shot(driver, f"p01-t01-{role}.png")
        print(
            f"  [{role}] modal {'open' if opened else 'NOT open'} — "
            f"Delete button(s): {len(dels)}, Archive button(s): {len(archs)}  ({p})"
        )
    print(
        "  Verify: PM shows a Delete button (no Archive), NORMAL shows neither, "
        "ADMIN shows BOTH Archive and Delete."
    )


def p01_t02_confirm_dialog(driver):
    checkpoint("P01-T02", "Delete confirmation dialog — cancel aborts (non-destructive replay)")
    common.login(driver, "pm")
    opened = open_first_board_card(driver)
    dels = find_delete_button(driver) if opened else []
    dialog_text = ""
    if dels:
        try:
            dels[0].click()
            time.sleep(1.2)
            alerts = driver.find_elements(By.XPATH, "//*[@role='alertdialog']|//*[@role='dialog']")
            if alerts:
                dialog_text = alerts[-1].text.strip()
        except Exception:
            pass
    p = shot(driver, "p01-t02-confirm-dialog.png")
    for label in ("Cancel", "Close"):
        btns = driver.find_elements(
            By.XPATH, f"//*[@role='alertdialog' or @role='dialog']//button[normalize-space()='{label}']"
        )
        if btns:
            try:
                btns[0].click()
                time.sleep(0.6)
                break
            except Exception:
                pass
    print(f"  Did: PM opened a card, clicked Delete, captured the confirm dialog, then CANCELLED.")
    print(f"  Dialog text seen: {dialog_text[:300]!r}")
    print(f"  Screenshot: {p}")
    print(
        "  Verify (human, deliberate): the dialog clearly warns this is a permanent delete "
        "(comments/notes/files removed, schedule assignments unaffected, cannot be undone) and "
        "names the project. Cancel changes nothing. Confirm (do this manually on a disposable "
        "card) removes the card; the project's schedule assignment must still exist on /schedule."
    )


def p02_t01_split_cell_lock(driver):
    checkpoint("P02-T01", "Lock control on a split (two-project) schedule cell")
    common.login(driver, "pm")
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(3)
    locks = driver.find_elements(
        By.XPATH,
        "//table//td//button[.//svg or @aria-label]"
        "[contains(@aria-label,'lock') or contains(@aria-label,'Lock') or .//*[contains(@class,'lucide-lock')]]",
    )
    p = shot(driver, "p02-t01-split-lock.png")
    print(f"  Did: PM opened /schedule.")
    print(f"  Auto-check: {len(locks)} candidate lock-toggle button(s) found in grid cells.")
    print(
        "  Verify: a SPLIT cell (two projects) shows a clickable lock/unlock control consistent "
        "with non-split cells; clicking it toggles the whole-assignment lock and does NOT open "
        "the cell edit modal; a non-editor sees only a static lock icon when locked."
    )
    print(f"  Screenshot: {p}")


def p02_t02_modal_lock(driver):
    checkpoint("P02-T02", "Lock toggle + locked-field disabling in the assignment modal")
    common.login(driver, "pm")
    opened = open_first_schedule_cell(driver)
    toggles = driver.find_elements(
        By.XPATH,
        "//*[@role='dialog']//button[normalize-space()='Lock' or normalize-space()='Unlock']",
    )
    before = shot(driver, "p02-t02-modal-before.png")
    locked_shot = ""
    if toggles:
        try:
            label = toggles[0].text.strip()
            toggles[0].click()
            time.sleep(1.0)
            locked_shot = shot(driver, "p02-t02-modal-toggled.png")
            back = driver.find_elements(
                By.XPATH,
                "//*[@role='dialog']//button[normalize-space()='Lock' or normalize-space()='Unlock']",
            )
            if back:
                back[0].click()
                time.sleep(0.6)
            print(f"  Did: opened an assignment modal, clicked the '{label}' toggle, then toggled back.")
        except Exception as e:
            print(f"  Toggle interaction issue: {e}")
    else:
        print(f"  Modal {'open' if opened else 'NOT open'} — no Lock/Unlock toggle button found.")
    print(f"  Auto-check: {len(toggles)} Lock/Unlock toggle button(s) in the modal.")
    print(
        "  Verify: while locked, all fields + Save + Delete are disabled but the Lock/Unlock "
        "toggle stays enabled; unlocking re-enables them; the toggle label/icon matches state."
    )
    print(f"  Screenshots: {before}{(' | ' + locked_shot) if locked_shot else ''}")


def run():
    driver = common.make_driver()
    try:
        common.banner("Phase 01 UAT replay (PM project delete & lock)")
        p01_t01_delete_affordance(driver)
        p01_t02_confirm_dialog(driver)
        p02_t01_split_cell_lock(driver)
        p02_t02_modal_lock(driver)
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
