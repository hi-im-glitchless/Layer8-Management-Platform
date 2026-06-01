#!/usr/bin/env python3
"""Seed schedule assignments via the real UI: /schedule grid cell -> New Assignment (PM).

Creating an assignment auto-creates its Project and the board card, so this is the
script that actually populates the Kanban board. Each assignment is placed in the
next free week cell of the matching member's row (exact calendar week is not
important for a demo dataset).
"""

import sys
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

import common
import data

# data status value -> button label in the modal
STATUS_LABEL = {
    "Placeholder": "Placeholder",
    "Needs-Reqs": "Needs Requirements",
    "Confirmed": "Confirmed",
}


def member_row(driver, match):
    for r in driver.find_elements(By.XPATH, "//table//tr"):
        cells = r.find_elements(By.XPATH, "./td|./th")
        if cells and match in (cells[0].text or ""):
            return r
    return None


def dialog_title(driver):
    h = driver.find_elements(By.XPATH, "//*[@role='dialog']//h2")
    return (h[0].text or "").strip() if h else ""


def close_dialog(driver):
    for _ in range(3):
        if not driver.find_elements(By.XPATH, "//*[@role='dialog']"):
            return
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        time.sleep(0.5)


def open_empty_cell(driver, match, start_idx):
    """Click successive week cells in the member's row until a 'New Assignment'
    modal opens. Returns the cell index used, or None."""
    row = member_row(driver, match)
    if row is None:
        return None
    ncells = len(row.find_elements(By.XPATH, "./td"))
    idx = start_idx
    while idx < ncells:
        row = member_row(driver, match)  # re-find (DOM may be stale)
        tds = row.find_elements(By.XPATH, "./td")
        try:
            tds[idx].click()
            time.sleep(1.0)
        except Exception:
            idx += 1
            continue
        title = dialog_title(driver)
        if title == "New Assignment":
            return idx
        # occupied cell or non-assignment cell — close and advance
        close_dialog(driver)
        idx += 1
    return None


def select_client(driver, name):
    trigger = driver.find_element(
        By.XPATH, "//*[@role='dialog']//label[normalize-space()='Client']/following::button[1]"
    )
    trigger.click()
    time.sleep(0.5)
    search = common.wait(driver).until(
        lambda d: d.find_element(By.XPATH, "//input[@placeholder='Search clients...']")
    )
    search.clear()
    search.send_keys(name)
    time.sleep(0.6)
    opt = common.wait(driver).until(
        lambda d: d.find_element(
            By.XPATH, f"//button[contains(normalize-space(), '{name}')]"
        )
    )
    opt.click()
    time.sleep(0.4)


def run():
    driver = common.make_driver()
    created = 0
    try:
        common.banner("Seeding assignments (PM) — auto-creates projects + board cards")
        common.login(driver, "pm")
        driver.get(common.BASE_URL + "/schedule")
        time.sleep(3)

        next_cell = {}  # member_match -> next week-cell index to try (col 0 is the name)
        for a in data.ASSIGNMENTS:
            match = a["member_match"]
            start = next_cell.get(match, 1)
            idx = open_empty_cell(driver, match, start)
            if idx is None:
                common.log(f"no free cell for {match}, skip: {a['project']}")
                continue
            next_cell[match] = idx + 1

            if a.get("client"):
                select_client(driver, a["client"])
            if a.get("project"):
                common.fill_by_id(driver, "projectName", a["project"])
            status_label = STATUS_LABEL.get(a["status"], "Placeholder")
            driver.find_element(
                By.XPATH, f"//*[@role='dialog']//button[normalize-space()='{status_label}']"
            ).click()
            for tag in a.get("tags", []):
                try:
                    driver.find_element(
                        By.XPATH, f"//*[@role='dialog']//button[normalize-space()='{tag}']"
                    ).click()
                except Exception:
                    common.log(f"tag not found, skipping: {tag}")

            driver.find_element(
                By.XPATH, "//*[@role='dialog']//button[normalize-space()='Save']"
            ).click()
            common.wait(driver).until_not(
                lambda d: d.find_elements(By.XPATH, "//*[@role='dialog']//h2[normalize-space()='New Assignment']")
            )
            time.sleep(1.0)
            common.log(f"created assignment: {match} -> {a['project']} ({a['status']})")
            created += 1

        common.banner(f"Assignments done — {created} created")
    finally:
        driver.quit()
    return created


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
