#!/usr/bin/env python3
"""UAT replay — Phase 04 (Board Kanban cards show pentester AVATARS, not names).

Replays / sets up the UI for the phase-04 UAT checkpoints so they can be watched
and judged instead of driven entirely by hand. Each checkpoint opens the board,
saves a screenshot to ui-seed/uat-screenshots/, runs a light presence/count
assert where it is deterministic, and prints what a human must judge.

The phase replaces the comma-joined pentester *name* text on each board card with
small circular avatars — reusing the schedule's avatar logic (shadcn
Avatar/AvatarImage/AvatarFallback in an AvatarGroup). A pentester with both a
primary and a split assignment renders exactly ONE avatar (deduped by
teamMemberId), and beyond a cap of 3 the card shows a "+N" overflow node
(AvatarGroupCount). Photo when available, single-initial fallback otherwise; the
avatar's hover title / image alt carries the pentester name.

The deterministic part this script CAN check is the *presence* of avatar elements
(data-slot=avatar / avatar-image / avatar-fallback) inside cards and the presence
of a "+N" overflow node (data-slot=avatar-group-count); whether they read
correctly and match the schedule's look is human judgment.

SAFETY: non-destructive — this script only navigates, reads the DOM, and takes
screenshots. It never clicks a card, drags, or mutates any data.

Run:   cd ui-seed && python3 uat_replay_04.py
Watch: E2E_HEADLESS=0 python3 uat_replay_04.py
Then report verdicts per checkpoint (e.g. "P01-T01 pass, P01-T02 pass").

Requires the stack up + demo data seeded (run seed_all.py first so the board has
cards with assigned pentesters). Logs in as pm (PM sees the full board).
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

# Card container: KanbanCard renders the outermost card <div> with bg-card.
CARD_XPATH = "//div[contains(@class,'bg-card')]"

# Avatar DOM (from frontend/src/components/ui/avatar.tsx — stable data-slot attrs):
#   AvatarGroup       -> <div data-slot="avatar-group">
#   Avatar root       -> <div data-slot="avatar" data-size="sm" title="{name}">
#   AvatarImage       -> <img data-slot="avatar-image" alt="{name}">  (Radix Image)
#   AvatarFallback    -> <span data-slot="avatar-fallback">{initial}</span>
#   AvatarGroupCount  -> <div data-slot="avatar-group-count">+N</div>
AVATAR_ANY = ".//*[@data-slot='avatar']"
AVATAR_IMG = ".//*[@data-slot='avatar-image']"
AVATAR_FALLBACK = ".//*[@data-slot='avatar-fallback']"
OVERFLOW = "//*[@data-slot='avatar-group-count']"


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*64}\n  {cid}: {title}\n{'='*64}", flush=True)


def open_board(driver):
    """Open the board and return the visible card container elements."""
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)
    return driver.find_elements(By.XPATH, CARD_XPATH)


def card_avatars(card):
    """Return the list of avatar root elements (data-slot=avatar) inside a card."""
    return card.find_elements(By.XPATH, AVATAR_ANY)


def card_has_name_paragraph(card):
    """Best-effort: True if the card still renders a plain comma-joined pentester
    name <p> (a <p> containing a comma and no avatar element). After this phase the
    pentester line should be avatars, not such a name paragraph."""
    for p in card.find_elements(By.XPATH, ".//p"):
        txt = (p.text or "").strip()
        if "," in txt and not p.find_elements(By.XPATH, AVATAR_ANY):
            return True
    return False


def t01_avatars_not_names(driver):
    checkpoint("P01-T01", "Cards show pentester avatars, not name text")
    cards = open_board(driver)
    path = shot(driver, "p04_t01_board_avatars.png")

    cards_with_avatar = 0
    total_imgs = 0
    total_fallbacks = 0
    cards_with_name_p = 0
    for c in cards:
        avs = card_avatars(c)
        if avs:
            cards_with_avatar += 1
        total_imgs += len(c.find_elements(By.XPATH, AVATAR_IMG))
        total_fallbacks += len(c.find_elements(By.XPATH, AVATAR_FALLBACK))
        if card_has_name_paragraph(c):
            cards_with_name_p += 1

    print(f"  Did: opened /board, scanned {len(cards)} visible card container(s).")
    print(f"  Auto-check: cards rendering >=1 avatar element = {cards_with_avatar} "
          f"of {len(cards)}  (expected: cards with assigned pentesters show avatars)")
    print(f"  Auto-check: avatar <img> (photo) count = {total_imgs}; "
          f"avatar fallback (initials) count = {total_fallbacks}")
    print(f"  Auto-check: cards still showing a plain comma-joined name <p> = "
          f"{cards_with_name_p}  (expected: 0 — names replaced by avatars)")
    print(f"  Screenshot: {path}")
    print("  Verify (human): each card's pentester line shows small circular "
          "avatars matching the schedule's look — a photo when available, single "
          "uppercased initials fallback otherwise; the Project name and Client "
          "lines are still plain text. Hovering an avatar surfaces the pentester "
          "name (title on the avatar root / alt on the image).")


def t02_dedup_and_overflow(driver):
    checkpoint("P01-T02", "Multiple/deduped avatars + '+N' overflow beyond the cap")
    cards = open_board(driver)

    busiest = 0
    for c in cards:
        n = len(card_avatars(c))
        if n > busiest:
            busiest = n

    overflow_present = bool(driver.find_elements(By.XPATH, OVERFLOW))
    overflow_texts = [
        (e.text or "").strip()
        for e in driver.find_elements(By.XPATH, OVERFLOW)
        if (e.text or "").strip()
    ]
    path = shot(driver, "p04_t02_board_overflow.png")

    print(f"  Did: opened /board, scanned {len(cards)} card(s) for multi-avatar "
          f"cards and overflow nodes.")
    print(f"  Auto-check: most avatars on a single card = {busiest}  "
          f"(expected: >=2 on a card with multiple pentesters; cap is 3 + '+N')")
    print(f"  Auto-check: '+N' overflow node (data-slot=avatar-group-count) "
          f"present anywhere = {overflow_present}"
          + (f"  texts={overflow_texts}" if overflow_texts else ""))
    print(f"  Screenshot: {path}")
    print("  Verify (human): a card with multiple distinct pentesters shows "
          "multiple avatars — and a pentester assigned twice (primary + split) is "
          "NOT duplicated into two circles. Beyond the cap (3) the card shows a "
          "'+N' overflow circle, styled like the schedule's overflow.")


def t03_layout_status_then_avatar_rows(driver):
    checkpoint("P01-T03", "StatusBadge alone below client; checklist count bottom-left, avatars bottom-right")
    cards = open_board(driver)
    path = shot(driver, "p04_t03_board_layout.png")

    # After the FINAL UAT round-01 layout tweak the card body stacks (top -> bottom):
    #   Row1 Project name | Row2 Client name | Row3 StatusBadge ALONE
    #   | Row4 (flex justify-between): {checked}/{total} count LEFT, AvatarGroup RIGHT.
    # The avatar group now shares its row with the checklist count (justify-between),
    # NOT with the StatusBadge. Deterministic structural check: for a card that has
    # avatars, the avatar group's nearest flex row is a justify-between row, and the
    # StatusBadge pill is NOT a sibling inside that bottom row (it lives one row up).
    cards_with_bottom_row = 0
    cards_with_status_separate = 0
    cards_with_avatar = 0
    for c in cards:
        groups = c.find_elements(By.XPATH, ".//*[@data-slot='avatar-group']")
        if not groups:
            continue
        cards_with_avatar += 1
        grp = groups[0]
        # Wrapper of the avatar group should be the justify-between bottom row.
        wrappers = grp.find_elements(By.XPATH, "./ancestor::div[contains(@class,'justify-between')][1]")
        if wrappers:
            cards_with_bottom_row += 1
        # The StatusBadge pill must NOT be a sibling within the avatar's bottom row —
        # it lives on its own row above. We approximate by checking the bottom row
        # does not contain the rounded/font-medium status pill.
        if wrappers:
            w = wrappers[0]
            badge_inside = w.find_elements(
                By.XPATH, ".//span[contains(@class,'rounded') and contains(@class,'font-medium')]"
            )
            if not badge_inside:
                cards_with_status_separate += 1

    print(f"  Did: opened /board, scanned {len(cards)} card(s) for the final row layout.")
    print(f"  Auto-check: cards with avatars = {cards_with_avatar}")
    print(f"  Auto-check: avatar group on the justify-between bottom row = "
          f"{cards_with_bottom_row} of {cards_with_avatar}  (expected: all)")
    print(f"  Auto-check: bottom (avatar/count) row free of the StatusBadge = "
          f"{cards_with_status_separate} of {cards_with_avatar}  (expected: all)")
    print(f"  Screenshot: {path}")
    print("  Verify (human): on each card the StatusBadge sits ALONE directly under "
          "the client name; the bottom row carries the {checked}/{total} checklist "
          "count on the LEFT and the pentester avatars on the RIGHT. Cards without "
          "pentesters still show the count bottom-left. Spacing stays tasteful "
          "(space-y-1.5).")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "pm")
        t01_avatars_not_names(driver)
        t02_dedup_and_overflow(driver)
        t03_layout_status_then_avatar_rows(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass, P01-T03 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
