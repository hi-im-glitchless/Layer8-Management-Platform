#!/usr/bin/env python3
"""UAT replay — Phase 07 (Planner card avatars: initials + account colour).

Replays / sets up the UI for the phase-07 UAT checkpoints so they can be watched
and judged instead of driven entirely by hand. Each checkpoint opens the right
screen, saves a screenshot to ui-seed/uat-screenshots/, runs a light
presence/measurement assert where it is deterministic, and prints what a human
must judge.

The phase changes the pentester avatar "circles" on the PLANNER / board (Kanban)
cards ONLY: instead of a photo / single letter, each circle now shows a
two-letter monogram (first initial of first name + first initial of last name,
uppercase; one letter for a mononym) on a background colour deterministically
derived from the account (hash of the stable teamMemberId). The Schedule view is
unchanged. This is a purely visual change, so the verdict is human judgment; the
script automates what is deterministic:

* P01-T01 — board avatars are initials+colour monograms, NOT photos: reads each
  board card's avatar fallbacks (data-slot='avatar-fallback'), reports their text
  (expected 1-2 uppercase letters) and inline backgroundColor, and asserts that
  NO <img>/avatar-image renders inside board cards.
* P01-T02 — determinism + Schedule isolation: re-reads the same board after an
  in-app reload to confirm each account's colour is stable, then parks you on
  /schedule so you can confirm the Schedule avatars are visually unchanged.
* P01-T03 — Phase-4 behaviour preserved: reports avatar count per card and any
  '+N' overflow node (data-slot='avatar-group-count') so you can confirm dedupe
  and the cap-3 overflow still work.

SAFETY: non-destructive — navigate + read + screenshot only. No demo data is
mutated.

Run:   cd ui-seed && python3 uat_replay_07.py
Watch: E2E_HEADLESS=0 python3 uat_replay_07.py
Then report verdicts per checkpoint (e.g. "P01-T01 pass, P01-T02 pass").

Requires the stack up + demo data seeded (run seed_all.py first so the board has
cards with assigned pentesters). Logs in as pm (PM sees the full board). Override
the focus card with E2E_UAT_CARD.
"""

import os
import re
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD = os.environ.get("E2E_UAT_CARD", "Acme External Pentest")

# --- Selectors ---------------------------------------------------------------
# KanbanCard outermost container (frontend/.../KanbanCard.tsx: bg-card div).
CARD_XPATH = "//div[contains(@class,'bg-card')]"
# shadcn Avatar primitives carry data-slot markers (frontend/.../ui/avatar.tsx).
AV_FALLBACK = ".//*[@data-slot='avatar-fallback']"
AV_IMAGE = ".//*[@data-slot='avatar-image'] | .//img"
AV_GROUP_COUNT = ".//*[@data-slot='avatar-group-count']"

INITIALS_RE = re.compile(r"^[A-Z?]{1,2}$")


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


def cards(driver):
    return driver.find_elements(By.XPATH, CARD_XPATH)


def bg_color(driver, el):
    """Computed backgroundColor of an element (rgb string)."""
    return driver.execute_script(
        "return getComputedStyle(arguments[0]).backgroundColor;", el
    )


def scan_avatars(driver):
    """Return a list of (card_text, [(initials, bgcolor)], img_count, overflow)."""
    out = []
    for c in cards(driver):
        try:
            label = (c.text or "").strip().split("\n")[0][:40]
        except Exception:
            label = "?"
        fbs = c.find_elements(By.XPATH, AV_FALLBACK)
        imgs = c.find_elements(By.XPATH, AV_IMAGE)
        overflow = c.find_elements(By.XPATH, AV_GROUP_COUNT)
        avatars = []
        for fb in fbs:
            txt = (fb.text or "").strip()
            try:
                color = bg_color(driver, fb)
            except Exception:
                color = "?"
            avatars.append((txt, color))
        out.append((label, avatars, len(imgs), len(overflow)))
    return out


def report(scan, focus=None):
    any_avatar = False
    for label, avatars, img_count, overflow in scan:
        if focus and focus not in label:
            continue
        if not avatars:
            continue
        any_avatar = True
        print(f"  card {label!r}:")
        for txt, color in avatars:
            ok = "ok" if INITIALS_RE.match(txt or "") else "??"
            print(f"      avatar text={txt!r:8} bg={color}   [{ok} 1-2 uppercase letters]")
        if overflow:
            print(f"      overflow '+N' node present: yes")
        print(f"      <img>/avatar-image inside this card: {img_count}  (expected 0)")
    if not any_avatar:
        print("  No avatar fallbacks found on any board card. Ensure demo data is "
              "seeded with assigned pentesters (run seed_all.py).")
    return any_avatar


def t01_initials_colour(driver):
    checkpoint("P01-T01", "Board avatars are two-initial monograms on an account colour (not photos)")
    open_board(driver)
    path = shot(driver, "p07-t01-board.png")
    scan = scan_avatars(driver)
    total_imgs = sum(s[2] for s in scan)
    report(scan)
    print(f"  Auto-check: total <img>/avatar-image elements inside board cards = "
          f"{total_imgs}  (expected 0 — board avatars must be initials+colour, no photo)")
    print(f"  Screenshot (board): {path}")
    print("  Verify (human): every pentester circle on the planner shows a 1-2 letter "
          "monogram (first initial of first + last name, uppercase) on a coloured "
          "circle, NOT a photo and NOT a single grey letter. White text is legible on "
          "every colour.")


def t02_determinism_schedule(driver):
    checkpoint("P01-T02", "Colour is stable per account + Schedule avatars unchanged")
    open_board(driver)
    first = {a[0]: a[1] for label, avs, _, _ in scan_avatars(driver) for a in avs if a[0]}
    # In-app reload (no manual browser refresh needed; just re-navigate).
    driver.get(common.BASE_URL + "/schedule")
    time.sleep(2)
    open_board(driver)
    second = {a[0]: a[1] for label, avs, _, _ in scan_avatars(driver) for a in avs if a[0]}
    stable = all(first.get(k) == second.get(k) for k in first) if first else False
    print(f"  Auto-check: same initials -> same background colour across reload? "
          f"{stable}  (expected True — colour is hashed from the stable account id)")
    spath = shot(driver, "p07-t02-schedule.png")
    print(f"  Screenshot (schedule for comparison): {spath}")
    print("  Verify (human): 1) each person keeps the SAME circle colour every time "
          "the board renders. 2) On /schedule, the avatars are UNCHANGED from before "
          "this phase (photos / original style) — only the planner/board changed.")


def t03_dedupe_overflow(driver):
    checkpoint("P01-T03", "Phase-4 dedupe + '+N' overflow preserved")
    open_board(driver)
    scan = scan_avatars(driver)
    for label, avatars, _img, overflow in scan:
        if not avatars:
            continue
        print(f"  card {label!r}: {len(avatars)} avatar circle(s)"
              f"{', +N overflow node present' if overflow else ''}")
    path = shot(driver, "p07-t03-board.png")
    print(f"  Screenshot (board): {path}")
    print("  Verify (human): a card with several pentesters shows at most 3 circles "
          "plus a '+N' overflow chip, and the same person is not shown twice "
          "(dedup by team member) — same behaviour as before, just initials+colour now.")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "pm")
        t01_initials_colour(driver)
        t02_determinism_schedule(driver)
        t03_dedupe_overflow(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass, P01-T03 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
