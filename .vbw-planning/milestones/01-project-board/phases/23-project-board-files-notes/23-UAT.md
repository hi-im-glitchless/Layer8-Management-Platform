---
phase: 23
plan_count: 3
status: complete
started: 2026-06-03
completed: 2026-06-03
total_tests: 7
passed: 7
skipped: 0
issues: 0
---

UAT for Phase 23 — Project Board: Files, Notes & Comments. Covers the notes editor
(markdown + sanitization), file attachments (upload/download/delete + storage gauge),
threaded comments (edit/soft-delete window), notification read-state, the ADMIN
archive flow, and the NON-NEGOTIABLE schedule-isolation invariant. Driven interactively
(guided checkpoints); a Selenium replay is available at ui-seed/uat_replay_23.py.

## Tests

### P06-T01: Notes editor — edit, preview, save

- **Plan:** 23-06 — NotesEditor (MH-12)
- **Scenario:** Open a card → Notes → Edit tab, type markdown (heading, bold, bullet) → switch to Preview → Save.
- **Expected:** Preview renders the markdown (real heading/bold/list, not raw `##`); after Save a "last edited by {name} at {time}" footer appears.
- **Result:** pass

### P06-T02: Notes sanitization — script/iframe/js-URL blocked

- **Plan:** 23-06 — rehype-sanitize (MH-13)
- **Scenario:** Paste `<script>`, a `javascript:` link, an `onerror` img, and an `<iframe>` into notes; view Preview.
- **Expected:** Nothing executes — no alert, no script run, no iframe rendered; the javascript: link is inert.
- **Result:** pass

### P06-T03: Files — upload, storage gauge, download, delete

- **Plan:** 23-06 — FilesPanel (MH-14)
- **Scenario:** In the card's Files section, upload a file, watch the storage gauge, download it, then delete it (PM/ADMIN).
- **Expected:** File appears after upload; storage gauge increases; download saves via the browser; delete removes the file and the gauge decreases.
- **Result:** pass

### P06-T04: Comments — add, edit within window, soft-delete

- **Plan:** 23-06 — CardDetailModal comments (MH-15)
- **Scenario:** Add a comment; within 10 minutes use the Edit pencil on your own comment to change it; then soft-delete it.
- **Expected:** Comment shows author + timestamp; after editing shows an "(edited)" marker; after deleting shows a "[deleted]" placeholder (row preserved, not removed).
- **Result:** pass

### P07-T01: Notifications — unread dot clears on card open

- **Plan:** 23-07 / 23-05 — notification dot + mark-read (MH-17, MH-06, MH-07, MH-20)
- **Scenario:** With an unread notification, observe the dot on the Planner nav icon, open the relevant card, return to the board.
- **Expected:** The unread dot shows when notifications exist and clears after opening the card (mark-read fires on modal open).
- **Result:** pass

### P07-T02: Admin archive — type-to-confirm + file deletion with metadata retention

- **Plan:** 23-07 / 23-05 — ArchiveCardDialog + archive flow (MH-19, MH-03, MH-04)
- **Scenario:** As ADMIN, open a card → Archive; verify the destructive confirm button is disabled until the project name is typed exactly (case-sensitive); confirm on a throwaway card.
- **Expected:** Confirm stays disabled until the name matches exactly; on confirm the card leaves the board (stage=archived), its files are permanently deleted, but notes/comments/checklist are preserved; success toast shows.
- **Result:** pass

### P05-T01: Schedule isolation (NON-NEGOTIABLE)

- **Plan:** 23-05 / 23-06 / 23-07 — schedule isolation (MH-05, MH-08, MH-16, MH-21, MH-22)
- **Scenario:** After exercising notes, files, comments, and archive, open the Schedule view and confirm assignments/absences/holidays are unchanged.
- **Expected:** Schedule is identical before/after — no rows added, moved, or removed by any board operation. (Backed by scheduleIsolation.phase23.test.ts, 6/6 passing.)
- **Result:** pass

## Summary

- Passed: 7
- Skipped: 0
- Issues: 0
- Total: 7
