#!/usr/bin/env python3
"""Seed holidays via the real UI: /schedule -> Manage Holidays (PM role)."""

import sys
import time

from selenium.webdriver.common.by import By

import common
import data


def run():
    driver = common.make_driver()
    created = 0
    try:
        common.banner("Seeding holidays (PM)")
        common.login(driver, "pm")
        driver.get(common.BASE_URL + "/schedule")
        time.sleep(2)
        common.click_button(driver, "Manage Holidays")
        common.wait(driver).until(
            lambda d: d.find_elements(By.XPATH, "//*[@role='dialog']//h2[contains(.,'Holiday')]")
        )

        for h in data.HOLIDAYS:
            dlg_text = " ".join(
                (p.text or "") for p in driver.find_elements(By.XPATH, "//*[@role='dialog']")
            )
            if h["name"] in dlg_text:
                common.log(f"exists, skip: {h['name']}")
                continue

            common.fill_by_label(driver, "Name", h["name"])
            # Month is a Radix Select (default January).
            month_combo = driver.find_element(By.XPATH, "//*[@role='dialog']//*[@role='combobox']")
            common.radix_select(driver, month_combo, h["month"])
            common.fill_by_label(driver, "Day", str(h["day"]))
            # Recurring defaults to checked; data uses recurring=True, so leave as-is.
            driver.find_element(
                By.XPATH, "//*[@role='dialog']//button[normalize-space()='Add']"
            ).click()
            time.sleep(1.0)
            common.log(f"added holiday: {h['name']} ({h['month']} {h['day']})")
            created += 1

        common.banner(f"Holidays done — {created} created")
    finally:
        driver.quit()
    return created


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
