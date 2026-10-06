# SIOS Backup ZIP

**Status:** Phase 1a

Uses vendored **fflate** (MIT) at `apps/shell/vendor/fflate.min.js`.

## Labeling

Downloads are named:

`sios-backup-YYYY-MM-DD-UNENCRYPTED.zip`

The archive `README.txt` repeats the plaintext warning. Settings UI says **UNENCRYPTED** before export.

## Contents

- `settings.json`
- `notes/*.md`
- `files/tree.json` + `files/export/**`
- `calendar/events.json`
- `calc/history.json`
- optional `keys/blobs.json` (encrypted envelopes only — never the vault passphrase; vault verifier is **not** exported)

## Import

Merge or Replace (same pattern as Calendar/Files JSON). Keys **vault** is never replaced from a ZIP.
