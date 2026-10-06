# SIOS Store — IndexedDB adapter

**Status:** Phase 1a

## Promise

- Primary backend: **IndexedDB** (`sios-store-v1` / object store `kv`)
- Fallback: `localStorage` if IndexedDB is unavailable
- One-time **idempotent migration** of known `sios-*-v0` keys from localStorage
- Soft-request `navigator.storage.persist()`; surface estimate + persistence in Settings
- No network

## API (`window.SIOS_STORE`)

| Method | Notes |
|--------|-------|
| `ready` | Promise resolved after boot + migration |
| `get(key)` | Sync read from in-memory cache (after ready) |
| `set(key, value)` | Cache + async persist; returns Promise |
| `remove(key)` | Delete from cache + backends |
| `keys()` | Cache keys (excludes migration meta) |
| `estimate()` | `{ usage, quota, backend, persistent }` |
| `requestPersist()` | `navigator.storage.persist()` |
| `exportAll()` / `importAll()` | Full KV dump helpers |

## Known keys

- `sios-files-tree-v0`
- `sios-calc-history-v0`
- `sios-calendar-events-v0`
- `sios-keys-vault-v0` / `sios-keys-blobs-v0`
- `sios-settings-v0`

OPFS and File System Access are deferred (see ops research Phase 1 report).
