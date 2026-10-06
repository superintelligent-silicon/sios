# SIOS shell (Phase 1a)

Vanilla JS desktop preview — no build step.

| File | Role |
|------|------|
| `store.js` | IndexedDB KV + localStorage migration |
| `files.js` / `notes.js` / `settings.js` | Files tree, Notes-as-`.md`, Settings |
| `backup.js` + `vendor/fflate.min.js` | UNENCRYPTED ZIP export/import |
| `keys.js` | PBKDF2 600k + AES-GCM (migrates 310k vaults) |
| `calc.js` / `calendar.js` / `bus.js` | Modules + data bus |
| `shell.js` / `index.html` / `styles.css` | Chrome |

Live: https://exploresuperintelligence.online/sios/shell/
