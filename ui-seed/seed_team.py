#!/usr/bin/env python3
"""Seed schedule team members via the real UI: /schedule -> Manage Team (PM role).

Adds users to the schedule grid so assignments can be placed for them.
"""

import sys
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

import common
import data


def panel_text(driver):
    """Visible text of the open Manage Team sheet/dialog."""
    panels = driver.find_elements(By.XPATH, "//*[@role='dialog']")
    return " ".join((p.text or "") for p in panels)


def run():
    driver = common.make_driver()
    added = 0
    try:
        # The add-user dropdown loads the user list only for ADMIN
        # (TeamManagementPanel uses useUsers(hasRole('ADMIN'))), so seed as admin.
        common.banner("Seeding schedule team members (ADMIN)")
        common.login(driver, "admin")
        driver.get(common.BASE_URL + "/schedule")
        time.sleep(2)
        common.click_button(driver, "Manage Team")
        common.wait(driver).until(
            lambda d: d.find_elements(By.XPATH, "//*[@role='dialog']//*[@role='combobox']")
        )

        for username in data.TEAM_MEMBERS:
            if username in panel_text(driver):
                common.log(f"already on team, skip: {username}")
                continue

            combo = driver.find_element(By.XPATH, "//*[@role='dialog']//*[@role='combobox']")
            combo.click()
            time.sleep(0.6)
            # Options list users not already on the team; match by username text.
            opt_xpath = f"//*[@role='option'][contains(., '{username}')]"
            opts = driver.find_elements(By.XPATH, opt_xpath)
            if not opts:
                common.log(f"not selectable (already added or inactive): {username}")
                driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
                continue
            opts[0].click()
            time.sleep(0.4)
            driver.find_element(
                By.XPATH, "//*[@role='dialog']//button[normalize-space()='Add']"
            ).click()
            time.sleep(1.0)
            common.log(f"added team member: {username}")
            added += 1

        common.banner(f"Team done — {added} added")
    finally:
        driver.quit()
    return added


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
