"""
Shared helpers for the Layer8 UI data-population scripts.

Every seed_*.py script drives the REAL app UI (no DB shortcuts) with Selenium to
create a realistic demo/test dataset. This module owns the driver factory, the
TOTP-aware login flow, and small helpers for the app's Shadcn/Radix widgets
(label inputs, Select dropdowns, dialogs).

Auth: MFA is mandatory. The deterministic E2E users share one TOTP secret
(seeded by `backend/src/scripts/seed-e2e.ts`). Run `cd backend && npm run seed:e2e`
once before seeding so the users exist with TOTP enabled.

Env overrides:
  E2E_BASE_URL      frontend URL          (default http://localhost:5173)
  E2E_HEADLESS      "0" to watch a browser (default headless)
  E2E_CHROME_BIN    chrome binary path    (default /usr/bin/google-chrome-stable)
"""

import os
import time

import pyotp
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# --- Configuration -----------------------------------------------------------

BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:5173").rstrip("/")
CHROME_BIN = os.environ.get("E2E_CHROME_BIN", "/usr/bin/google-chrome-stable")
HEADLESS = os.environ.get("E2E_HEADLESS", "1") != "0"

# Must match backend/src/scripts/seed-e2e.ts and e2e/support/roles.ts.
PASSWORD = "E2eTestPass123!"
TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

# role -> seeded username
USERS = {
    "admin": "e2e_admin",
    "pm": "e2e_pm",
    "normal": "e2e_normal",
}

DEFAULT_TIMEOUT = 20
_totp = pyotp.TOTP(TOTP_SECRET)


# --- Driver ------------------------------------------------------------------

def make_driver():
    """Create a Chrome driver. Selenium Manager auto-fetches the matching driver."""
    opts = Options()
    if HEADLESS:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1500,1000")
    if os.path.exists(CHROME_BIN):
        opts.binary_location = CHROME_BIN
    driver = webdriver.Chrome(options=opts)
    driver.set_page_load_timeout(60)
    return driver


def wait(driver, timeout=DEFAULT_TIMEOUT):
    return WebDriverWait(driver, timeout)


# --- TOTP --------------------------------------------------------------------

def _fresh_totp():
    """Return a code with >=10s of window left so it can't expire mid-submit
    (the backend verifies the exact current 30s step, no skew tolerance)."""
    left = 30 - (time.time() % 30)
    if left < 10:
        time.sleep(left + 0.5)
    return _totp.now()


# --- Login -------------------------------------------------------------------

def login(driver, role):
    """Drive the real login UI (username/password + mandatory TOTP) for a role.

    role: "admin" | "pm" | "normal". Returns once the app leaves /login.
    """
    username = USERS[role]
    driver.get(f"{BASE_URL}/login")

    wait(driver).until(EC.presence_of_element_located((By.ID, "username")))
    _set_value(driver, driver.find_element(By.ID, "username"), username)
    _set_value(driver, driver.find_element(By.ID, "password"), PASSWORD)
    _click_button(driver, "Sign In")

    # TOTP screen (totpEnabled=true -> requiresTOTP)
    wait(driver).until(EC.presence_of_element_located((By.ID, "totp-code")))

    last_code = None
    for attempt in range(1, 5):
        code = _fresh_totp()
        # On retry, wait for a genuinely new window so we don't resubmit a code
        # the server already rejected at this step.
        while attempt > 1 and code == last_code:
            time.sleep(30 - (time.time() % 30) + 0.5)
            code = _fresh_totp()
        last_code = code

        field = driver.find_element(By.ID, "totp-code")
        _set_value(driver, field, code)
        _click_button(driver, "Verify")
        try:
            WebDriverWait(driver, 6).until_not(EC.url_contains("/login"))
            return  # authenticated
        except Exception:
            pass  # boundary/rejected — loop fetches a fresh-window code

    raise RuntimeError(f"login failed for {username}: still on /login after TOTP retries")


# --- Element helpers ---------------------------------------------------------

def _set_value(driver, element, value):
    """Clear and type into a (possibly controlled) input so React onChange fires."""
    element.clear()
    element.send_keys(value)


def fill_by_id(driver, element_id, value, timeout=DEFAULT_TIMEOUT):
    el = wait(driver, timeout).until(EC.presence_of_element_located((By.ID, element_id)))
    _set_value(driver, el, value)
    return el


def fill_by_label(driver, label_text, value, timeout=DEFAULT_TIMEOUT):
    """Fill an input associated with a <Label> by its visible text.

    Handles both `<label for=id>` + `#id` and label-wraps-input markup.
    """
    xpath = (
        f"//label[normalize-space()='{label_text}']"
        f"/following::input[1] | //label[normalize-space()='{label_text}']//input"
    )
    el = wait(driver, timeout).until(EC.presence_of_element_located((By.XPATH, xpath)))
    _set_value(driver, el, value)
    return el


def _click_button(driver, text, timeout=DEFAULT_TIMEOUT):
    """Click a <button> by its exact (trimmed) visible text."""
    xpath = f"//button[normalize-space()='{text}']"
    btn = wait(driver, timeout).until(EC.element_to_be_clickable((By.XPATH, xpath)))
    btn.click()
    return btn


def click_button(driver, text, timeout=DEFAULT_TIMEOUT):
    return _click_button(driver, text, timeout)


def click_text(driver, text, timeout=DEFAULT_TIMEOUT):
    """Click the first clickable element containing the given text."""
    xpath = f"//*[normalize-space()='{text}' or contains(normalize-space(), '{text}')]"
    el = wait(driver, timeout).until(EC.element_to_be_clickable((By.XPATH, xpath)))
    el.click()
    return el


def radix_select(driver, trigger, option_text, timeout=DEFAULT_TIMEOUT):
    """Open a Shadcn/Radix Select trigger and click the option with given text."""
    trigger.click()
    opt_xpath = f"//*[@role='option'][normalize-space()='{option_text}' or contains(., '{option_text}')]"
    opt = wait(driver, timeout).until(EC.element_to_be_clickable((By.XPATH, opt_xpath)))
    opt.click()


def exists(driver, by, sel):
    return len(driver.find_elements(by, sel)) > 0


def log(msg):
    print(f"  {msg}", flush=True)


def banner(msg):
    print(f"\n=== {msg} ===", flush=True)
