"""
The demo/test dataset, defined once and consumed by the seed_*.py scripts.

Edit this to change what gets seeded. Everything is created through the real
UI in dependency order (users -> clients -> team -> assignments -> card content).
"""

# Demo users created by an ADMIN via /admin. Roles: NORMAL | PM | ADMIN.
# Passwords meet the complexity policy (>=8). These are demo-only credentials.
USERS = [
    {"username": "alice_pentest", "displayName": "Alice Carter", "role": "NORMAL", "password": "DemoPass123!"},
    {"username": "bob_pentest", "displayName": "Bob Nguyen", "role": "NORMAL", "password": "DemoPass123!"},
    {"username": "carol_pentest", "displayName": "Carol Diaz", "role": "NORMAL", "password": "DemoPass123!"},
    {"username": "dan_lead", "displayName": "Dan Foster", "role": "PM", "password": "DemoPass123!"},
]

# Clients created by a PM via /schedule -> Manage Clients. Color is a hex string;
# the script picks the closest palette swatch (or the Nth swatch as a fallback).
CLIENTS = [
    {"name": "Acme Corp", "color": "#ef4444"},
    {"name": "Globex", "color": "#3b82f6"},
    {"name": "Initech", "color": "#22c55e"},
    {"name": "Umbrella Health", "color": "#a855f7"},
    {"name": "Wayne Industries", "color": "#f59e0b"},
]

# Usernames to add to the schedule team (Manage Team). Mix of seeded + demo users.
TEAM_MEMBERS = ["e2e_normal", "alice_pentest", "bob_pentest", "carol_pentest"]

# Assignments placed on the schedule grid. `member_match` is text used to find the
# member's row; `week_offset` is weeks from the current week (0 = this week).
# Creating an assignment auto-creates the Project and its board card.
ASSIGNMENTS = [
    {"member_match": "Alice", "week_offset": 0, "client": "Acme Corp", "project": "Acme External Pentest", "status": "Confirmed", "tags": ["Web"]},
    {"member_match": "Alice", "week_offset": 1, "client": "Globex", "project": "Globex Web App Assessment", "status": "Confirmed", "tags": ["Web"]},
    {"member_match": "Bob", "week_offset": 0, "client": "Initech", "project": "Initech Internal Network", "status": "Needs-Reqs", "tags": ["Red Team"]},
    {"member_match": "Bob", "week_offset": 2, "client": "Umbrella Health", "project": "Umbrella HIPAA Review", "status": "Placeholder", "tags": []},
    {"member_match": "Carol", "week_offset": 1, "client": "Wayne Industries", "project": "Wayne Cloud Config Audit", "status": "Confirmed", "tags": ["Web"]},
]

# Holidays created by a PM via Manage Holidays.
HOLIDAYS = [
    {"name": "New Year's Day", "month": "January", "day": 1, "recurring": True},
    {"name": "Labour Day", "month": "May", "day": 1, "recurring": True},
    {"name": "Christmas Day", "month": "December", "day": 25, "recurring": True},
]

# Comments posted to board cards (matched by project name in the card title).
COMMENTS = [
    {"card_match": "Acme External Pentest", "body": "Kickoff scheduled. Scope confirmed with the client."},
    {"card_match": "Initech Internal Network", "body": "Waiting on VPN credentials before we can start."},
]
