# SIOS Notes v0

**Status:** Phase 1a · plain-text only

## Model

Notes are **`.md` files** under the virtual Files tree at `/Notes`. There is no separate notes database — creating a note in Notes shows up in Files and vice versa.

## Front matter

```md
---
title: Welcome
created: 2026-10-06T00:00:00.000Z
updated: 2026-10-06T00:00:00.000Z
tags: []
---

Body text…
```

## Safety

- Editor is **plain text** only
- **No HTML rendering** of Markdown in v0 (XSS surface deferred)
- Later preview (if any): markdown-it `html:false` + DOMPurify

## Backup

Included in Settings → **UNENCRYPTED** ZIP as `notes/*.md` and inside `files/tree.json`.
