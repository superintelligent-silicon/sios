# SIOS Keys v0 — threat model & crypto notes

**Status:** experimental · **not audited** · use only for **non-critical** data.

## Promise (v0)

- Cryptography via the browser **Web Crypto API** only: **PBKDF2-SHA-256** (600,000 iterations; legacy vaults at 310,000 migrate on unlock) → **AES-256-GCM**.
- Passphrases are **never** written to `localStorage`, cookies, or the network.
- Raw key material is **non-extractable** `CryptoKey` held in memory while unlocked; cleared on Lock, when the Keys window closes, or when the tab is hidden.
- Ciphertext downloads and optional local blob library contain **salt + iv + ciphertext** only (plus public metadata such as label).
- **No** network calls, analytics, cloud backup, key escrow, or seed-phrase export.

## What v0 does

1. **Create vault** — random 16-byte salt; derive key; encrypt a fixed check string; store `{ salt, iv, check, kdf params }` locally.
2. **Unlock** — re-derive; decrypt check; keep `CryptoKey` in memory for this tab.
3. **Encrypt** — AES-GCM with a fresh 12-byte IV; download JSON envelope; optionally remember envelope in a local list.
4. **Decrypt** — from pasted/uploaded envelope + passphrase (does not require unlock).

## What v0 does NOT do

| Not in v0 | Why it matters |
|-----------|----------------|
| Security audit / formal verification | Treat as demo-grade |
| Sync / multi-device | Would expand the threat surface |
| Recovery without passphrase | Forgotten passphrase = data loss |
| Password strength meter / breach checks | Still your responsibility |
| Binary/file encryption UI | Text only in v0 |
| age/PGP compatibility | Different formats |
| Protection against XSS on a compromised origin | If the page is XSS’d, an attacker can abuse unlocked memory |
| Protection against malware / shoulder surfing | OS-level threats out of scope |
| “Remember passphrase” | Intentionally omitted |

## Envelope shape (export)

```json
{
  "v": 0,
  "app": "SIOS Keys",
  "schema": "https://github.com/superintelligent-silicon/sios/blob/main/docs/KEYS.md",
  "alg": "AES-GCM",
  "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000 },
  "label": "optional",
  "salt": "<base64>",
  "iv": "<base64>",
  "ciphertext": "<base64>",
  "createdAt": "<ISO-8601>"
}
```

## Local storage keys

| Key | Contents |
|-----|----------|
| `sios-keys-vault-v0` | Salt + verifier ciphertext (not passphrase); held in IndexedDB via SIOS_STORE |
| `sios-keys-blobs-v0` | Optional list of envelopes + labels |

## Operational advice

- Prefer a long, unique passphrase.
- Lock when stepping away; closing Keys or switching browser tabs locks automatically in v0.
- Keep downloaded JSON backups offline if the data matters.
- Do **not** paste passphrases into chat, tickets, or screenshots.

## Algorithms (normative for v0)

- KDF: PBKDF2, hash SHA-256, iterations **600000** (new vaults); unlock migrates 310000 → 600000, salt 16 bytes  
- Cipher: AES-GCM, 256-bit key, IV 12 bytes, plaintext UTF-8  

Phase 1a bumps PBKDF2 to 600,000 with an on-unlock migration from 310,000. Future versions may move to Argon2id only with an explicit version bump and migration path.
