# SIOS Files — virtual filesystem JSON schema (v0)

Local-only virtual tree for the Files module. **No real disk access. No server upload.**

## Limits (v0)

| Limit | Value |
|-------|-------|
| Persistence | `localStorage` key `sios-files-tree-v0` |
| Max chars per text file | 50,000 |
| Soft warning | ~1.5 MB serialized tree size |
| Node names | No `\ / : * ? " < > \|`; max 80 chars |

When storage quota is exceeded, save fails with an alert — **Export JSON** as backup.

## Node types

### Directory

```json
{
  "type": "dir",
  "name": "Notes",
  "children": [ /* file | dir */ ]
}
```

Root directory uses `name: ""`.

### File

```json
{
  "type": "file",
  "name": "welcome.txt",
  "content": "plain text only in v0",
  "updatedAt": "2026-10-05T08:00:00.000Z"
}
```

## Export envelope

```json
{
  "app": "SIOS Files",
  "version": 0,
  "schema": "https://github.com/superintelligent-silicon/sios/blob/main/docs/FILES.md",
  "exportedAt": "2026-10-05T08:05:00.000Z",
  "tree": { "type": "dir", "name": "", "children": [] }
}
```

Import accepts the envelope or a bare root `dir` node.

### Import modes

- **Merge** — walk by name; files overwrite on name match; folders recurse; type conflicts get ` (imported)` suffix
- **Replace all** — discard current tree

## Interop stub

Future modules may deep-link paths like `/Notes/welcome.txt`. v0 paths are name segments from root (not POSIX mounts).
