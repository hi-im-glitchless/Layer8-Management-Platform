#!/usr/bin/env python3
"""Seed users via the real UI: /admin -> Create User (ADMIN role)."""

import sys
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

import common
import data

ROLE_LABEL = {"NORMAL": "Normal", "PM": "Project Manager", "ADMIN": "Admin"}


def existing_usernames(driver):
    """Read usernames already listed in the Users tab."""
    names = set()
    for cell in driver.find_elements(By.XPATH, "//table//td | //table//span"):
        t = (cell.text or "").strip()
        if t:
            names.add(t)
    return names


def dialog_open(driver):
    return bool(driver.find_elements(By.ID, "username"))


def close_dialog(driver):
    for _ in range(4):
        if not driver.find_elements(By.XPATH, "//*[@role='dialog']"):
            return
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        time.sleep(0.6)


def run():
    driver = common.make_driver()
    created = 0
    try:
        common.banner("Seeding users (ADMIN)")
        common.login(driver, "admin")
        driver.get(common.BASE_URL + "/admin")
        time.sleep(2)
        present = existing_usernames(driver)

        for user in data.USERS:
            uname = user["username"]
            if uname in present:
                common.log(f"exists, skip: {uname}")
                continue

            # Open the create dialog via the page-level trigger (not a dialog button).
            common.wait(driver).until(
                lambda d: d.find_element(
                    By.XPATH, "//button[normalize-space()='Create User'][not(ancestor::*[@role='dialog'])]"
                )
            ).click()
            common.wait(driver).until(lambda d: dialog_open(d))

            common.fill_by_id(driver, "username", uname)
            common.fill_by_id(driver, "displayName", user["displayName"])
            common.fill_by_id(driver, "password", user["password"])

            # Role select (Radix combobox inside the dialog).
            combo = driver.find_element(By.XPATH, "//*[@role='dialog']//*[@role='combobox']")
            common.radix_select(driver, combo, ROLE_LABEL[user["role"]])

            # Submit via the dialog's own "Create User" button.
            driver.find_element(
                By.XPATH, "//*[@role='dialog']//button[normalize-space()='Create User']"
            ).click()
            time.sleep(1.2)
            common.log(f"created user: {uname} ({user['role']})")
            created += 1
            close_dialog(driver)
            time.sleep(0.5)

        common.banner(f"Users done — {created} created")
    finally:
        driver.quit()
    return created


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
