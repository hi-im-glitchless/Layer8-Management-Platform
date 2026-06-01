#!/usr/bin/env python3
"""Seed clients via the real UI: /schedule -> Manage Clients -> Add Client (PM role)."""

import sys
import time

from selenium.webdriver.common.by import By

import common
import data


def existing_client_names(driver):
    names = set()
    for el in driver.find_elements(By.XPATH, "//*[@role='dialog']//td | //*[@role='dialog']//span"):
        t = (el.text or "").strip()
        if t:
            names.add(t)
    return names


def pick_color(driver, hex_color):
    """Click the palette swatch matching hex_color; fall back to the first swatch."""
    swatches = driver.find_elements(
        By.XPATH,
        "//*[@role='dialog']//*[contains(@style,'background-color') or contains(@style,'background')]",
    )
    target = None
    for s in swatches:
        style = (s.get_attribute("style") or "").lower()
        if hex_color.lower() in style:
            target = s
            break
    if target is None and swatches:
        target = swatches[0]
    if target is not None:
        try:
            target.click()
        except Exception:
            driver.execute_script("arguments[0].click();", target)


def run():
    driver = common.make_driver()
    created = 0
    try:
        common.banner("Seeding clients (PM)")
        common.login(driver, "pm")
        driver.get(common.BASE_URL + "/schedule")
        time.sleep(2)
        common.click_button(driver, "Manage Clients")
        common.wait(driver).until(
            lambda d: d.find_elements(By.XPATH, "//*[@role='dialog']//h2[normalize-space()='Manage Clients']")
        )
        before = existing_client_names(driver)

        for client in data.CLIENTS:
            name = client["name"]
            if name in before:
                common.log(f"exists, skip: {name}")
                continue
            common.fill_by_label(driver, "Name", name)
            pick_color(driver, client["color"])
            # The "Add" button inside the dialog commits the new client.
            common.wait(driver).until(
                lambda d: d.find_element(By.XPATH, "//*[@role='dialog']//button[normalize-space()='Add']")
            ).click()
            time.sleep(1.0)
            common.log(f"added client: {name}")
            created += 1

        common.banner(f"Clients done — {created} created")
    finally:
        driver.quit()
    return created


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
