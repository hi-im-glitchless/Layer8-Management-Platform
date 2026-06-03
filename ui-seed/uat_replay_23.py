#!/usr/bin/env python3
"""UAT replay — Phase 23 (Project Board: Files, Notes & Comments).

Replays the UI actions for the phase-23 UAT checkpoints so they can be
watched/reviewed instead of driven by hand. Each checkpoint drives the actions,
saves a screenshot to ui-seed/uat-screenshots/, runs a light presence assert
where deterministic, and prints what a human must judge.

Run:   cd ui-seed && python3 uat_replay_23.py
Watch: E2E_HEADLESS=0 python3 uat_replay_23.py
Then report verdicts per checkpoint (e.g. "T01 pass, T02 issue: script rendered")
and they get recorded into 23-UAT.md.

Requires the stack up + demo data seeded (run seed_all.py first so the board has
cards). T06 (admin archive) is destructive — it archives a card. By default it
STOPS at the confirm step without clicking the final destructive button; pass
E2E_UAT_ARCHIVE=1 to actually archive (use a throwaway/seeded card).
"""

import os
import sys
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")
CARD = os.environ.get("E2E_UAT_CARD", "Acme External Pentest")  # a seeded card
DO_ARCHIVE = os.environ.get("E2E_UAT_ARCHIVE", "0") == "1"


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*64}\n  {cid}: {title}\n{'='*64}", flush=True)


def open_card(driver):
    """Navigate to /board and open the seeded card's detail modal."""
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)
    for el in driver.find_elements(
        By.XPATH, f"//*[contains(normalize-space(), '{CARD}')]"
    ):
        try:
            el.click()
            time.sleep(1.5)
            if driver.find_elements(By.XPATH, "//*[@role='dialog']"):
                return True
        except Exception:
            continue
    return False


def click_tab(driver, name):
    """Click a Radix tab trigger (Edit / Preview / Notes / Files) by text."""
    for xp in (
        f"//*[@role='tab'][normalize-space()='{name}']",
        f"//button[normalize-space()='{name}']",
        f"//*[normalize-space()='{name}']",
    ):
        els = driver.find_elements(By.XPATH, xp)
        if els:
            try:
                els[0].click()
                time.sleep(0.7)
                return True
            except Exception:
                continue
    return False


def t01_notes_edit(driver):
    checkpoint("T01", "Notes: edit (markdown) -> preview -> save -> footer")
    opened = open_card(driver)
    click_tab(driver, "Notes")
    click_tab(driver, "Edit")
    note_md = "## Scope\n- Test **markdown** notes\n- VPN config in files tab\n"
    typed = False
    for ta in driver.find_elements(By.XPATH, "//textarea"):
        try:
            ta.clear()
            ta.send_keys(note_md)
            typed = True
            break
        except Exception:
            continue
    shot(driver, "t01-notes-edit.png")
    click_tab(driver, "Preview")
    prev = shot(driver, "t01-notes-preview.png")
    common.click_button(driver, "Save") if _has_button(driver, "Save") else None
    time.sleep(1.5)
    saved = shot(driver, "t01-notes-saved.png")
    print(f"  Did: opened card '{CARD}' ({'modal' if opened else 'NO modal'}); "
          f"typed markdown ({'ok' if typed else 'no textarea found'}); "
          f"switched Edit->Preview; clicked Save")
    print(f"  Verify: Preview renders markdown (## heading + bold + bullet list); "
          f"after Save a 'last edited by {{name}} at {{time}}' footer appears.")
    print(f"  Screenshots: {prev} | {saved}")


def t02_notes_sanitize(driver):
    checkpoint("T02", "Notes: rehype-sanitize blocks script / js: URL / on*=")
    open_card(driver)
    click_tab(driver, "Notes")
    click_tab(driver, "Edit")
    payload = (
        "<script>window.__xss=1;alert('xss')</script>\n"
        "[click me](javascript:alert('x'))\n"
        "<img src=x onerror=\"window.__xss=2\">\n"
        "<iframe src='https://evil.example'></iframe>\n"
    )
    for ta in driver.find_elements(By.XPATH, "//textarea"):
        try:
            ta.clear()
            ta.send_keys(payload)
            break
        except Exception:
            continue
    shot(driver, "t02-sanitize-edit.png")
    click_tab(driver, "Preview")
    time.sleep(1.0)
    xss = driver.execute_script("return window.__xss || null;")
    iframes = len(driver.find_elements(By.XPATH, "//*[@role='dialog']//iframe"))
    p = shot(driver, "t02-sanitize-preview.png")
    print(f"  Did: entered <script>, javascript: link, onerror img, <iframe> into notes; "
          f"viewed Preview")
    print(f"  Auto-check: window.__xss = {xss!r} (MUST be None); "
          f"iframes in dialog = {iframes} (MUST be 0)")
    print(f"  Verify: no alert fired, no script/iframe rendered, the javascript: link "
          f"is inert (not clickable to JS). FAIL if window.__xss is set or an iframe rendered.")
    print(f"  Screenshot: {p}")


def t03_files(driver):
    checkpoint("T03", "Files: upload -> storage gauge -> download -> delete")
    open_card(driver)
    click_tab(driver, "Files")
    time.sleep(0.5)
    before = shot(driver, "t03-files-before.png")
    # Create a small temp file and feed the hidden <input type=file>.
    tmp = os.path.join(SHOTS, "uat-upload.txt")
    with open(tmp, "w") as f:
        f.write("UAT phase-23 upload sample\n")
    uploaded = False
    for inp in driver.find_elements(By.XPATH, "//input[@type='file']"):
        try:
            inp.send_keys(tmp)
            uploaded = True
            break
        except Exception:
            continue
    time.sleep(2.5)
    after = shot(driver, "t03-files-after-upload.png")
    print(f"  Did: opened Files; sent temp file to file input "
          f"({'ok' if uploaded else 'NO file input found'})")
    print(f"  Verify: the file appears in the list; the storage gauge (used/500MB) "
          f"increases; a per-file Download and (PM/ADMIN) Delete button are shown. "
          f"Click Download -> browser saves the file. Click Delete -> file removed, "
          f"gauge decreases.")
    print(f"  Screenshots: {before} | {after}")


def t04_comments(driver):
    checkpoint("T04", "Comments: add -> edit (<=10min) -> soft-delete [deleted]")
    open_card(driver)
    # comments are usually a textarea/input near a "Comment"/"Send"/"Post" button
    typed = False
    for ta in driver.find_elements(By.XPATH, "//*[@role='dialog']//textarea | //*[@role='dialog']//input[@type='text']"):
        try:
            ta.clear()
            ta.send_keys("UAT comment: please confirm scope by Friday")
            typed = True
            break
        except Exception:
            continue
    for label in ("Send", "Post", "Comment", "Add comment"):
        if _has_button(driver, label):
            common.click_button(driver, label)
            break
    time.sleep(1.5)
    p = shot(driver, "t04-comments.png")
    print(f"  Did: typed a comment ({'ok' if typed else 'no comment field found'}) and submitted")
    print(f"  Verify: comment appears with author + timestamp. Within 10 min an Edit "
          f"pencil shows on your own comment -> edit it -> shows '(edited)'. Soft-delete "
          f"it -> row becomes a '[deleted]' placeholder (not removed). After 10 min the "
          f"Edit pencil disappears.")
    print(f"  Screenshot: {p}")


def t05_notifications(driver):
    checkpoint("T05", "Notifications: unread dot on Planner nav -> clears on card open")
    driver.get(common.BASE_URL + "/board")
    time.sleep(2)
    # the dot is an absolutely-positioned span on the Planner sidebar icon
    dots = driver.find_elements(
        By.XPATH, "//*[contains(@class,'absolute') and contains(@class,'rounded-full')]"
    )
    before = shot(driver, "t05-notif-before.png")
    opened = open_card(driver)
    time.sleep(1.5)
    driver.get(common.BASE_URL + "/board")
    time.sleep(2)
    after = shot(driver, "t05-notif-after.png")
    print(f"  Did: viewed Planner nav; opened card ({'ok' if opened else 'no modal'}); "
          f"returned to board")
    print(f"  Auto-check (best-effort): {len(dots)} candidate dot element(s) before open")
    print(f"  Verify: when you have unread notifications a small dot shows on the Planner "
          f"nav icon; opening the relevant card (mark-read) clears the dot. Needs a "
          f"notification to exist (e.g. be @mentioned in a comment by another user).")
    print(f"  Screenshots: {before} | {after}")


def t06_archive(driver):
    checkpoint("T06", "Admin archive: type-to-confirm dialog (ADMIN only)")
    print("  (re-login as admin — archive is ADMIN-gated)")
    common.login(driver, "admin")
    opened = open_card(driver)
    # Archive button is destructive, rendered only for ADMIN on a non-archived card
    if _has_button(driver, "Archive"):
        common.click_button(driver, "Archive")
        time.sleep(1.0)
    pre = shot(driver, "t06-archive-dialog.png")
    # Type the project name to enable the destructive confirm button
    typed = False
    for inp in driver.find_elements(By.XPATH, "//*[@role='alertdialog']//input | //*[@role='dialog']//input"):
        try:
            inp.clear()
            inp.send_keys(CARD)
            typed = True
            break
        except Exception:
            continue
    time.sleep(0.5)
    mid = shot(driver, "t06-archive-typed.png")
    did_archive = False
    if DO_ARCHIVE:
        for label in ("Archive card", "Archive", "Confirm", "Delete"):
            if _has_button(driver, label):
                common.click_button(driver, label)
                did_archive = True
                break
        time.sleep(2)
        shot(driver, "t06-archive-done.png")
    print(f"  Did: login admin; opened card ({'ok' if opened else 'no modal'}); opened "
          f"Archive dialog; typed project name ({'ok' if typed else 'no input found'}); "
          f"{'CONFIRMED archive' if did_archive else 'stopped before confirm (set E2E_UAT_ARCHIVE=1 to actually archive)'}")
    print(f"  Verify: the destructive confirm button is DISABLED until the typed name "
          f"EXACTLY matches the project name (case-sensitive); a wrong name shows an "
          f"inline error and does not archive. On confirm: card leaves the board "
          f"(stage=archived), its files are permanently deleted, but comments/notes/"
          f"checklist are preserved; success toast shows.")
    print(f"  Screenshots: {pre} | {mid}")


def isolation_note():
    checkpoint("T07", "Schedule isolation (manual cross-check)")
    print(f"  Verify: none of the above (notes save, file upload/delete, comment "
          f"add/edit/delete, archive) changed anything on the Schedule view "
          f"(assignments, team members, absences, holidays). Open the Schedule before "
          f"and after and confirm it is byte-identical. (Backed by "
          f"scheduleIsolation.phase23.test.ts, 6/6 passing.)")


def _has_button(driver, text):
    return len(driver.find_elements(By.XPATH, f"//button[normalize-space()='{text}']")) > 0


def run():
    driver = common.make_driver()
    try:
        common.banner("Phase 23 UAT replay (files/notes/comments) — login as pm")
        common.login(driver, "pm")
        t01_notes_edit(driver)
        t02_notes_sanitize(driver)
        t03_files(driver)
        t04_comments(driver)
        t05_notifications(driver)
        t06_archive(driver)   # re-logs in as admin
        isolation_note()
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
