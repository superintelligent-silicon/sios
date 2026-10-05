# SIOS — Silicon OS / Superintelligent OS

**SIOS** (**Silicon OS** / **Superintelligent OS**, from Superintelligent Silicon) is a compact, **local-first** utility OS you can open in a page or wrap as a small desktop app.

Interoperable modules (planned): **Files**, **Keys**, **Calculator**, **Calendar**, **Notes**, **Settings** — exportable data, calm design, no account required for the core path.

> **Phase 0.5 — first modules.** Files, Keys, Calc, Calendar + local **data bus** (Save to Files). Keys = Web Crypto, **not audited**. Passphrases never stored or uploaded.

## Principles

- **Local-first** — your data stays on the device by default
- **Small footprint** — not a cloud desktop clone
- **Interoperable** — modules share a typed data bus (coming in Phase 1+)
- **Exportable** — plain formats so you are never trapped
- **Honest security** — keys never leave the device without deliberate export (when Keys exists); this repo does **not** collect keys

## Repo layout

| Path | Purpose |
|------|---------|
| [`docs/VISION.md`](docs/VISION.md) | Public vision (what it is / isn’t) |
| [`apps/shell/`](apps/shell/) | Desktop preview + Files / Keys / Calc / Calendar v0 |
| [`docs/FILES.md`](docs/FILES.md) | Virtual filesystem JSON schema |
| [`docs/KEYS.md`](docs/KEYS.md) | Keys threat model + algorithms |
| [`docs/BUS.md`](docs/BUS.md) | Cross-module data bus API |
| [`docs/EVENTS.md`](docs/EVENTS.md) | Calendar event JSON schema (interop stub) |

## Roadmap (summary)

| Phase | Focus |
|-------|--------|
| **0** | Research, architecture, public scaffold |
| **0.5** | Modules + **data bus** (Calc/Calendar → Files) *(current)* |
| **1** | Notes module + Settings + Files polish (OPFS optional) |
| **2** | Keys hardening (audit path) + module polish + optional Tauri shell |
| **3** | Cross-module polish (Notes ↔ Calendar ↔ Files) |
| **4** | Public lab release |

Detailed private planning lives with the Superintelligent Silicon ops vault; this repo stays public and secret-free.

## Try the Phase 0 preview

Live desktop chrome — **Files**, **Keys**, **Calc**, and **Calendar** work:

**https://exploresuperintelligence.online/sios/shell/**

Or open [`apps/shell/`](apps/shell/) locally. Landing: **https://exploresuperintelligence.online/sios/**

Shell UI: Apple-level polish pass (typography, chrome, empty states, motion) — no new modules.

## Data bus v0

Local pub/sub (`apps/shell/bus.js`). Try:

1. Open **Calc**, do a few equations → **Save to Files** → see `Imports/calc-history-….json`
2. Open **Calendar**, add events → **Day → Files** or **All → Files**

Details: [`docs/BUS.md`](docs/BUS.md). No passphrase handoff to Keys.

## Keys v0

Open the shell → **Keys** (or press `2`).

- Web Crypto **PBKDF2 + AES-GCM** only · passphrase unlock · encrypt/decrypt text blobs
- Passphrase **never** stored · key cleared on Lock / close / tab hide
- **Not audited** — non-critical data only · see [`docs/KEYS.md`](docs/KEYS.md)

## Files v0

Open the shell → **Files** dock icon (or press `1`).

- Virtual folders + text files in `localStorage` (not real disk / not uploaded)
- Create folder/file · rename/delete · in-panel text editor · breadcrumbs
- **Export JSON** / **Import** with **Merge** or **Replace all**
- Download current text file · ⌘/Ctrl+S to save · schema [`docs/FILES.md`](docs/FILES.md)

## Calc v0

Open the shell → **Calc** dock icon (or press `3` when Calc is closed).

- Arithmetic: `+ − × ÷`, decimals, `%`, sign toggle, `AC`
- Keyboard: digits, operators, Enter, Backspace, Esc clears then closes
- History in-panel; **Export** downloads JSON (stays on your machine)
- Persisted with `localStorage` only — **no network**

## Calendar v0

Open the shell → **Calendar** dock icon (or press `4` when Calendar is closed).

- Month grid · add / edit / delete events (title, date, optional notes)
- ← → month nav · `T` today · `N` new event · Esc closes modal then window
- **Export JSON** / **Import JSON** with explicit **Merge** or **Replace all**
- Schema: [`docs/EVENTS.md`](docs/EVENTS.md) · `localStorage` only — **no network**

## License

[MIT](LICENSE) — © Superintelligent Silicon

## Links

- Explore: [exploresuperintelligence.online](https://exploresuperintelligence.online)
- Lab: [superintelligentsilicon.com](https://superintelligentsilicon.com)
- Org: [github.com/superintelligent-silicon](https://github.com/superintelligent-silicon)
