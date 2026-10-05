# SIOS Calendar — event JSON schema (v0)

Interoperability stub for future modules (Notes, Files). Calendar v0 persists and exports this shape **locally only**.

## Event object

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Stable id (UUID preferred) |
| `title` | string | yes | Max 120 chars |
| `date` | string | yes | `YYYY-MM-DD` (local calendar date) |
| `notes` | string | no | Max 2000 chars; empty string ok |
| `updatedAt` | string | yes | ISO-8601 timestamp |

### Example event

```json
{
  "id": "3f2c1a9e-4b8d-4e2a-9c1f-0a7b6d5e4c3b",
  "title": "Ship SIOS Calc notes",
  "date": "2026-10-05",
  "notes": "Optional free text",
  "updatedAt": "2026-10-05T08:15:00.000Z"
}
```

## Export envelope

```json
{
  "app": "SIOS Calendar",
  "version": 0,
  "schema": "https://github.com/superintelligent-silicon/sios/blob/main/docs/EVENTS.md",
  "exportedAt": "2026-10-05T08:20:00.000Z",
  "events": [ /* Event objects */ ]
}
```

Import accepts either the envelope or a bare `Event[]`.

### Import modes

- **Merge** — upsert by `id` into existing local events
- **Replace all** — discard current events, keep only imported set

## Future interop

Other modules may reference `id` + `date` (e.g. attach a note or file). No cloud sync in v0.
