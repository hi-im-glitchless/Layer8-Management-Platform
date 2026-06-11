#!/usr/bin/env python3
"""UAT replay — Phase 08 (Planner avatar name precedence: full account name).

Phase 07 made board/planner card avatars show initials on an account colour, but
in production the avatars showed only ONE letter because the editable TeamMember
alias (often just a first name) shadowed the account's full `user.displayName`.
Phase 08 flips the name-resolution precedence in KanbanCard.tsx so the linked
account's full name wins ("Rui Marques" -> "RM"), with the alias kept only as the
fallback for backlog members that have no linked user (e.g. "Futuro 1").

This replay parks you on the board and reports, per avatar, the monogram text it
renders so you can confirm full-name accounts now show TWO initials. It is the
same deterministic read as the phase-07 replay, framed for the precedence fix.

* P01-T01 — a real pentester whose account has a first AND last name now shows a
  TWO-letter monogram (e.g. "RM"), not a single letter. The script flags any
  single-letter avatar so you can check whether that person genuinely has only a
  one-word name (OK) or is a regression.
* P01-T02 — no regression: backlog members ("Futuro 1" -> "F1" via the unchanged
  two-token splitter) and genuinely single-name accounts still render sensibly;
  Phase-07 colour/dedupe/overflow unchanged.

SAFETY: non-destructive — navigate + read + screenshot only.

Run:   cd ui-seed && python3 uat_replay_08.py
Watch: E2E_HEADLESS=0 python3 uat_replay_08.py
Then report verdicts (e.g. "P01-T01 pass, P01-T02 pass").

Requires the stack up + demo data seeded with assigned pentesters whose accounts
have full "First Last" display names. Logs in as pm. Override focus card with
E2E_UAT_CARD.
"""

import os
import re
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD_XPATH = "//div[contains(@class,'bg-card')]"
AV_FALLBACK = ".//*[@data-slot='avatar-fallback']"
AV_IMAGE = ".//*[@data-slot='avatar-image'] | .//img"
AV_GROUP_COUNT = ".//*[@data-slot='avatar-group-count']"

TWO_INITIAL_RE = re.compile(r"^[A-Z?][A-Z0-9]$")  # e.g. RM, AS, F1
ONE_INITIAL_RE = re.compile(r"^[A-Z?]$")


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


def scan(driver):
    out = []
    for c in driver.find_elements(By.XPATH, CARD_XPATH):
        try:
            label = (c.text or "").strip().split("\n")[0][:40]
        except Exception:
            label = "?"
        fbs = c.find_elements(By.XPATH, AV_FALLBACK)
        imgs = c.find_elements(By.XPATH, AV_IMAGE)
        overflow = c.find_elements(By.XPATH, AV_GROUP_COUNT)
        monos = []
        for fb in fbs:
            txt = (fb.text or "").strip()
            title = (fb.get_attribute("title") or "")
            # the hover/title sits on the Avatar wrapper; try parent if blank
            if not title:
                try:
                    title = fb.find_element(By.XPATH, "./ancestor::*[@title][1]").get_attribute("title") or ""
                except Exception:
                    title = ""
            monos.append((txt, title))
        out.append((label, monos, len(imgs), len(overflow)))
    return out


def t01_two_initials(driver):
    checkpoint("P01-T01", "Full-name accounts now show TWO initials (precedence fix)")
    open_board(driver)
    path = shot(driver, "p08-t01-board.png")
    rows = scan(driver)
    two = one = 0
    for label, monos, _img, _ovf in rows:
        for txt, title in monos:
            if TWO_INITIAL_RE.match(txt or ""):
                two += 1
            elif ONE_INITIAL_RE.match(txt or ""):
                one += 1
                hint = ""
                if title and len(title.split()) >= 2:
                    hint = "  <-- single letter but title has 2+ words: POSSIBLE REGRESSION"
                print(f"  single-letter avatar: text={txt!r} title={title!r}{hint}")
    print(f"  Auto-count: two-initial monograms = {two}, single-initial = {one}")
    print(f"  Screenshot (board): {path}")
    print("  Verify (human): a pentester whose account has a first AND last name now "
          "shows a two-letter monogram (e.g. 'Rui Marques' -> 'RM'), NOT a single 'R'. "
          "Hover an avatar — the tooltip/title shows the full name. Any single-letter "
          "avatar should correspond to a genuinely one-word name (not a truncated alias).")


def t02_no_regression(driver):
    checkpoint("P01-T02", "Backlog + single-name accounts unchanged; Phase-7 behaviour intact")
    open_board(driver)
    rows = scan(driver)
    for label, monos, _img, ovf in rows:
        if not monos:
            continue
        texts = ", ".join(t for t, _ in monos)
        print(f"  card {label!r}: monograms=[{texts}]"
              f"{', +N overflow' if ovf else ''}")
    path = shot(driver, "p08-t02-board.png")
    print(f"  Screenshot (board): {path}")
    print("  Verify (human): backlog members (no login account, e.g. 'Futuro 1') still "
          "render as before ('F1' from the two-token splitter); genuinely single-name "
          "accounts show one initial; colours stable per account; at most 3 circles + "
          "'+N' overflow; the Schedule view is unchanged.")


def main():
    driver = common.make_driver()
    try:
        common.login(driver, "pm")
        t01_two_initials(driver)
        t02_no_regression(driver)
        print("\nDone. Report verdicts per checkpoint "
              "(e.g. 'P01-T01 pass, P01-T02 pass').", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
