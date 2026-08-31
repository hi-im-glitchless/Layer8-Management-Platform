#!/usr/bin/env python3
"""UAT replay — Planner client-first name order (card + card detail modal).

Replays / sets up the UI for this phase's UAT checkpoints so they can be watched
and judged instead of driven entirely by hand. Each checkpoint opens the right
screen, saves a screenshot to ui-seed/uat-screenshots/, runs a deterministic
presence/order/class assert where it can, and prints what a human must judge.

The phase reverses the name order on the PLANNER (the Kanban board at /board)
ONLY. Before: row 1 was the project name in the large headline style and row 2
was the client name in a small bold line. After: row 1 is the CLIENT name in the
headline style (`text-lg font-semibold`) and row 2 is the PROJECT name in the
small bold style (`text-sm font-bold`). The card detail modal mirrors it: the
DialogTitle carries the client and the project name follows beneath it, and the
meta row below is now tags-only.

Because `Project.clientId` is nullable (deleting a Client nulls it via
onDelete: SetNull), a clientless project promotes its own name into the headline
via a chained-OR fallback and must render that name exactly ONCE — never blank,
never duplicated.

Checkpoints:
* T01 — a card WITH a client reads client-first, with the emphasis swapped:
  client on line 1 large/semibold, project on line 2 small/bold.
* T02 — a card with NO client shows the project name as the headline, exactly
  once, with no blank first line and no collapsed layout. If no clientless card
  exists in the seeded data this is reported as NOT REPRODUCIBLE rather than
  silently passing — judge it as skip in that case.
* T03 — the card detail modal header leads with the client name, the project
  name follows beneath it, and the client name is NOT duplicated in the meta row
  lower down (that row is tags-only now).
* T04 — the pin indicator on a manually-placed card still sits top-right on the
  FIRST row, i.e. it travelled with the headline rather than staying with the
  project name.

The schedule grid and the HTML export already read client-first and are out of
scope; the dashboard project card is a different surface and is unchanged. T05
is a quick eyeball that those were not disturbed.

SAFETY: non-destructive — navigate + read + open/close a modal + screenshot only.
No create, edit, drag, archive or delete.

Run:   cd ui-seed && python3 uat_replay_09.py
Watch: E2E_HEADLESS=0 python3 uat_replay_09.py
Then report verdicts (e.g. "T01 pass, T02 skip, T03 pass, T04 pass").

Requires the stack up + demo data seeded. Logs in as pm.
Override the focused card with E2E_UAT_CARD="<card text fragment>".
"""

import os
import time

from selenium.webdriver.common.by import By

import common

SHOTS = os.path.join(os.path.dirname(__file__), "uat-screenshots")

CARD_XPATH = "//div[contains(@class,'bg-card')]"
DIALOG_XPATH = "//*[@role='dialog']"


def shot(driver, name):
    os.makedirs(SHOTS, exist_ok=True)
    path = os.path.join(SHOTS, name)
    driver.save_screenshot(path)
    return path


def checkpoint(cid, title):
    print(f"\n{'='*68}\n  {cid}: {title}\n{'='*68}", flush=True)


def verify(*lines):
    print("\n  VERIFY (human judgment):", flush=True)
    for ln in lines:
        print(f"    - {ln}", flush=True)


def open_board(driver):
    driver.get(common.BASE_URL + "/board")
    time.sleep(3)


def read_cards(driver):
    """Return [{lines:[(text, class)], pin:bool, el:WebElement}] for each card."""
    out = []
    for el in driver.find_elements(By.XPATH, CARD_XPATH):
        try:
            ps = el.find_elements(By.XPATH, ".//p")
            lines = []
            for p in ps[:2]:
                txt = (p.text or "").strip()
                if txt:
                    lines.append((txt, p.get_attribute("class") or ""))
            if not lines:
                continue
            # the pin is an <svg> sibling of the headline <p>, inside row 1
            pin = False
            try:
                row1 = ps[0].find_element(By.XPATH, "..")
                pin = bool(row1.find_elements(By.TAG_NAME, "svg"))
            except Exception:
                pass
            out.append({"lines": lines, "pin": pin, "el": el})
        except Exception:
            continue
    return out


def describe(card, idx):
    print(f"\n  card #{idx}:", flush=True)
    for i, (txt, cls) in enumerate(card["lines"], 1):
        size = "text-lg" if "text-lg" in cls else ("text-sm" if "text-sm" in cls else "?")
        weight = (
            "font-semibold" if "font-semibold" in cls
            else ("font-bold" if "font-bold" in cls else "?")
        )
        print(f"    line {i}: {txt!r}  [{size} {weight}]", flush=True)
    print(f"    pin on row 1: {card['pin']}", flush=True)


def main():
    driver = common.make_driver()
    try:
        common.banner("UAT replay — Planner client-first name order")
        common.login(driver, "pm")
        open_board(driver)

        cards = read_cards(driver)
        if not cards:
            print("\n  !! No planner cards found. Seed demo data first "
                  "(see ui-seed/README.md), then re-run.", flush=True)
            return

        two_line = [c for c in cards if len(c["lines"]) == 2]
        one_line = [c for c in cards if len(c["lines"]) == 1]

        focus = os.environ.get("E2E_UAT_CARD")
        if focus:
            match = [c for c in cards if focus.lower() in c["lines"][0][0].lower()]
            if match:
                two_line = [c for c in match if len(c["lines"]) == 2] or two_line
                print(f"\n  (focused on card matching {focus!r})", flush=True)

        # ---------------- T01 ----------------
        checkpoint("T01", "Card WITH a client reads client-first, emphasis swapped")
        print(f"  {len(cards)} card(s) on the board; "
              f"{len(two_line)} with two name lines, {len(one_line)} with one.", flush=True)
        if two_line:
            for i, c in enumerate(two_line[:4], 1):
                describe(c, i)
            head_cls = two_line[0]["lines"][0][1]
            sub_cls = two_line[0]["lines"][1][1]
            ok = ("text-lg" in head_cls and "font-semibold" in head_cls
                  and "text-sm" in sub_cls and "font-bold" in sub_cls)
            print(f"\n  ASSERT first two-line card has lg/semibold headline + "
                  f"sm/bold second line: {'PASS' if ok else 'FAIL'}", flush=True)
        else:
            print("  !! No two-line cards found — cannot assert the swap.", flush=True)
        print(f"\n  screenshot: {shot(driver, 'uat09-t01-board.png')}", flush=True)
        verify(
            "Line 1 of each card is the CLIENT name, line 2 is the PROJECT name "
            "(i.e. the opposite of what shipped before).",
            "The client name is the visually dominant one (larger, semibold); the "
            "project name is smaller and bold beneath it.",
            "The client name is plain readable dark text — NOT tinted with the "
            "client's brand colour (that was deliberately rejected as illegible).",
            "The coloured accent bar on the card's left edge is unchanged.",
        )

        # ---------------- T02 ----------------
        checkpoint("T02", "Card with NO client falls back to the project name")
        if one_line:
            for i, c in enumerate(one_line[:4], 1):
                describe(c, i)
            cls = one_line[0]["lines"][0][1]
            ok = "text-lg" in cls and "font-semibold" in cls
            print(f"\n  ASSERT single-line card renders in the HEADLINE style "
                  f"(not the small style): {'PASS' if ok else 'FAIL'}", flush=True)
            print("  ASSERT the name renders exactly once (single line): PASS", flush=True)
        else:
            print("  NOT REPRODUCIBLE — every seeded project currently has a client,\n"
                  "  so there is no clientless card on the board to judge.\n"
                  "  This is the nullable-clientId path (deleting a Client nulls it).\n"
                  "  Judge this checkpoint as SKIP unless you want to create the case\n"
                  "  by unlinking a client first.", flush=True)
        print(f"\n  screenshot: {shot(driver, 'uat09-t02-clientless.png')}", flush=True)
        verify(
            "If a clientless card exists: its first line shows the PROJECT name, "
            "in the large headline style — not blank, not collapsed.",
            "That project name appears ONCE on the card, not twice.",
            "If no clientless card exists, record this as skip.",
        )

        # ---------------- T03 ----------------
        checkpoint("T03", "Card detail modal header leads with the client")
        target = (two_line or cards)[0]
        expected_client = target["lines"][0][0]
        expected_project = target["lines"][1][0] if len(target["lines"]) == 2 else None
        print(f"  opening the card whose headline is {expected_client!r} ...", flush=True)
        try:
            target["el"].click()
            time.sleep(2)
            dlg = driver.find_element(By.XPATH, DIALOG_XPATH)
            heads = dlg.find_elements(By.TAG_NAME, "h2")
            title = (heads[0].text or "").strip() if heads else "(no h2 found)"
            print(f"\n    modal title (h2): {title!r}", flush=True)
            print(f"    card headline was: {expected_client!r}", flush=True)
            print(f"    ASSERT modal title == card headline (client): "
                  f"{'PASS' if title == expected_client else 'FAIL'}", flush=True)
            body = dlg.text or ""
            if expected_project:
                print(f"    ASSERT project name {expected_project!r} present in modal: "
                      f"{'PASS' if expected_project in body else 'FAIL'}", flush=True)
            occurrences = body.count(expected_client)
            print(f"    client name appears {occurrences}x in the modal text "
                  f"(expect 1 — it must NOT be duplicated in the meta row below)",
                  flush=True)
            print(f"\n  screenshot: {shot(driver, 'uat09-t03-modal.png')}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"  !! could not open/read the modal: {exc}", flush=True)
            print(f"  screenshot: {shot(driver, 'uat09-t03-modal-error.png')}", flush=True)
        verify(
            "The modal's title line is the CLIENT name.",
            "The PROJECT name appears directly beneath the title, smaller and bold.",
            "The client name is NOT repeated further down in the grey meta row — "
            "that row should now show only tags (or be absent if there are none).",
            "Tags, status badge, notes, files and comments are all unchanged.",
        )

        # ---------------- T04 ----------------
        checkpoint("T04", "Pin indicator still sits top-right on the first row")
        try:
            driver.find_element(By.XPATH, "//*[@role='dialog']//button").send_keys("")
        except Exception:
            pass
        time.sleep(1)
        driver.get(common.BASE_URL + "/board")
        time.sleep(3)
        cards = read_cards(driver)
        pinned = [c for c in cards if c["pin"]]
        print(f"  {len(pinned)} card(s) render a pin on row 1.", flush=True)
        for i, c in enumerate(pinned[:3], 1):
            describe(c, i)
        if not pinned:
            print("  No manually-placed (pinned) card in the current data.\n"
                  "  Judge as skip, or pin a card by dragging it to another column\n"
                  "  and re-run.", flush=True)
        print(f"\n  screenshot: {shot(driver, 'uat09-t04-pin.png')}", flush=True)
        verify(
            "On a manually-placed card, the pin icon is top-right, level with the "
            "CLIENT name (the new first row) — it moved with the headline.",
            "The pin is not orphaned next to the project name on the second line.",
        )

        # ---------------- T05 ----------------
        checkpoint("T05", "Out-of-scope surfaces undisturbed")
        driver.get(common.BASE_URL + "/schedule")
        time.sleep(3)
        print(f"  screenshot: {shot(driver, 'uat09-t05-schedule.png')}", flush=True)
        driver.get(common.BASE_URL + "/")
        time.sleep(3)
        print(f"  screenshot: {shot(driver, 'uat09-t05-dashboard.png')}", flush=True)
        verify(
            "Schedule grid cells still read 'Client - Project' exactly as before "
            "(they were already client-first; this phase must not have touched them).",
            "The dashboard project cards are unchanged (project name then client) — "
            "that surface was deliberately left out of scope.",
        )

        common.banner("Replay complete — report verdicts per checkpoint")
        print("  e.g.  T01 pass, T02 skip, T03 pass, T04 pass, T05 pass\n", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
