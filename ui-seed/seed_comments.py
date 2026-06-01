#!/usr/bin/env python3
"""Seed board-card comments via the real UI: /board -> open card -> Post comment.

Comments are allowed for any authenticated user. Cards must already exist
(run seed_assignments.py first).
"""

import sys
import time

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

import common
import data


def open_card(driver, card_match):
    cards = driver.find_elements(By.XPATH, f"//*[contains(normalize-space(), '{card_match}')]")
    for c in cards:
        try:
            c.click()
            time.sleep(1.5)
            if driver.find_elements(By.XPATH, "//*[@role='dialog']//textarea"):
                return True
        except Exception:
            continue
    return False


def close_dialog(driver):
    for _ in range(3):
        if not driver.find_elements(By.XPATH, "//*[@role='dialog']"):
            return
        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
        time.sleep(0.5)


def run():
    driver = common.make_driver()
    created = 0
    try:
        common.banner("Seeding board-card comments")
        common.login(driver, "pm")
        driver.get(common.BASE_URL + "/board")
        time.sleep(3)

        for c in data.COMMENTS:
            if not open_card(driver, c["card_match"]):
                common.log(f"card not found, skip: {c['card_match']}")
                close_dialog(driver)
                continue

            dlg_text = " ".join(
                (p.text or "") for p in driver.find_elements(By.XPATH, "//*[@role='dialog']")
            )
            if c["body"] in dlg_text:
                common.log(f"comment exists, skip on: {c['card_match']}")
                close_dialog(driver)
                continue

            area = driver.find_element(
                By.XPATH, "//*[@role='dialog']//textarea[contains(@placeholder,'Add a comment')]"
            )
            area.clear()
            area.send_keys(c["body"])
            time.sleep(0.3)
            driver.find_element(
                By.XPATH, "//*[@role='dialog']//button[normalize-space()='Post comment']"
            ).click()
            time.sleep(1.2)
            common.log(f"posted comment on: {c['card_match']}")
            created += 1
            close_dialog(driver)
            time.sleep(0.5)

        common.banner(f"Comments done — {created} posted")
    finally:
        driver.quit()
    return created


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
