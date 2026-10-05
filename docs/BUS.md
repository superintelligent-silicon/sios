# SIOS data bus v0

Minimal **local-only** publish/subscribe channel so shell modules can hand data to each other **after an explicit user action**.

## Principles

1. **Local-only** — in-page `CustomEvent`; no network, no analytics, no workers talking off-origin  
2. **Explicit** — buttons like “Save to Files”; no silent background sync  
3. **No secrets on the bus** — never publish passphrases or raw CryptoKeys (Keys stays opt-in / separate)  
4. **Typed messages** — `{ type, from, payload, ts }`  
5. **Fail soft** — receivers validate payloads; toast on success/failure  

## API

```js
SIOS_BUS.publish(type, from, payload) → message
SIOS_BUS.subscribe(handler) → unsubscribe()
SIOS_BUS.toast(message, kind?)  // "ok" | "err" | "info"
SIOS_BUS.TYPES.FILES_WRITE_TEXT
SIOS_BUS.TYPES.FILES_WRITE_RESULT
SIOS_BUS.TYPES.FILES_OPEN_REQUEST  // reserved
```

### Message shape

```ts
{
  type: string;      // e.g. "files.writeText"
  from: string;      // "calc" | "calendar" | "files" | …
  payload: object;
  ts: number;        // Date.now()
}
```

### `files.writeText` payload

| Field | Type | Notes |
|-------|------|-------|
| `folderPath` | `string[]` | e.g. `["Imports"]` |
| `fileName` | `string` | e.g. `calc-history-2026-10-05.json` |
| `content` | `string` | text only |
| `openAfter` | `boolean` | open file in Files editor |

Files responds with `files.writeText.result`: `{ requestFrom, ok, path, error? }`.

## Demos (v0)

1. **Calendar** → Files: `Day → Files` / `All → Files` write JSON under `Imports/`  
2. **Calc** → Files: `Save to Files` writes history JSON under `Imports/`  

## Not in v0

- Automatic encryption via Keys (no passphrase handoff)  
- “Open in…” consumers beyond Files receiving writes  
- Cross-tab bus (single page only)  

## Source

`apps/shell/bus.js` — loaded before module scripts.
