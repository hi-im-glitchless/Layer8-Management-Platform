#!/usr/bin/env python3
"""Run every UI seed script in dependency order to build the full demo dataset.

Order matters: users and clients first, then team members (so the schedule grid
has rows), then assignments (which auto-create projects + board cards), then the
card-content and calendar enrichment.

Run individual scripts directly (e.g. `python3 seed_clients.py`) to re-seed one
slice. Most scripts skip records that already exist; assignments are the
exception (re-running places new ones), so prefer a fresh DB for a clean run.
"""

import sys

import seed_assignments
import seed_clients
import seed_comments
import seed_holidays
import seed_team
import seed_users

STEPS = [
    ("users", seed_users.run),
    ("clients", seed_clients.run),
    ("team", seed_team.run),
    ("assignments", seed_assignments.run),
    ("holidays", seed_holidays.run),
    ("comments", seed_comments.run),
]


def main():
    results = {}
    for name, fn in STEPS:
        try:
            results[name] = ("ok", fn())
        except Exception as e:
            results[name] = ("FAILED", str(e))
            print(f"!! {name} failed: {e}", file=sys.stderr)

    print("\n================ SEED SUMMARY ================")
    any_fail = False
    for name, _ in STEPS:
        status, info = results.get(name, ("skipped", ""))
        if status == "ok":
            print(f"  {name:12s} ok        ({info} created)")
        else:
            any_fail = True
            print(f"  {name:12s} {status}  {info}")
    print("=============================================")
    return 1 if any_fail else 0


if __name__ == "__main__":
    sys.exit(main())
