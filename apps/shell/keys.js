/*! SIOS Keys v0 — Web Crypto only (PBKDF2 + AES-GCM). Local-only. Not audited.
 * Never stores passphrases or raw CryptoKey material in localStorage.
 * No network. No analytics. No escrow / recovery.
 */
(function () {
  "use strict";

  const VAULT_KEY = "sios-keys-vault-v0";
  const BLOBS_KEY = "sios-keys-blobs-v0";
  const CHECK_PLAIN = "SIOS_KEYS_VAULT_V0";
  const PBKDF2_ITERATIONS = 600000; // OWASP / Bitwarden floor (was 310000)
  const PBKDF2_LEGACY = 310000;
  const MAX_PLAIN_CHARS = 200000;
  const MAX_LIBRARY = 40;
  let idleTimer = null;
  let lockTimeoutMs = 0; // 0 = only visibility/close (Settings can raise)

  const win = document.querySelector('[data-window="keys"]');
  if (!win) return;

  if (!window.crypto || !window.crypto.subtle) {
    const status = document.getElementById("keys-status");
    if (status) {
      status.textContent =
        "Web Crypto unavailable in this browser/context. Keys cannot run (needs secure context / modern browser).";
    }
    return;
  }

  const statusEl = document.getElementById("keys-status");
  const setupEl = document.getElementById("keys-setup");
  const unlockEl = document.getElementById("keys-unlock");
  const unlockedEl = document.getElementById("keys-unlocked");
  const blobListEl = document.getElementById("keys-blob-list");
  const blobEmptyEl = document.getElementById("keys-blob-empty");

  /** @type {CryptoKey | null} */
  let sessionKey = null;
  /** @type {string | null} vault salt b64 */
  let sessionSaltB64 = null;

  function b64(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function clearField(el) {
    if (!el) return;
    el.value = "";
  }

  function loadVault() {
    try {
      const v = window.SIOS_STORE ? window.SIOS_STORE.get(VAULT_KEY) : null;
      if (!v || !v.salt || !v.iv || !v.check || !v.kdf) return null;
      return v;
    } catch {
      return null;
    }
  }

  function saveVault(v) {
    if (window.SIOS_STORE) {
      window.SIOS_STORE.set(VAULT_KEY, v).catch(() => {});
    }
  }

  function loadLibrary() {
    try {
      const list = window.SIOS_STORE ? window.SIOS_STORE.get(BLOBS_KEY) : null;
      return Array.isArray(list) ? list.slice(0, MAX_LIBRARY) : [];
    } catch {
      return [];
    }
  }

  function saveLibrary(list) {
    if (window.SIOS_STORE) {
      window.SIOS_STORE.set(BLOBS_KEY, list.slice(0, MAX_LIBRARY)).catch(() => {});
    }
  }

  async function deriveKey(passphrase, saltBytes, iterations) {
    const iters = iterations || PBKDF2_ITERATIONS;
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: iters,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false, // not extractable
      ["encrypt", "decrypt"]
    );
  }

  function vaultIterations(vault) {
    const n = vault && vault.kdf && vault.kdf.iterations;
    return typeof n === "number" && n > 0 ? n : PBKDF2_LEGACY;
  }

  async function migrateVaultKdf(passphrase, vault) {
    const current = vaultIterations(vault);
    if (current >= PBKDF2_ITERATIONS) return sessionKey;
    const salt = fromB64(vault.salt);
    const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
    const enc = new TextEncoder();
    const { iv, ciphertext } = await encryptBytes(key, enc.encode(CHECK_PLAIN));
    const next = {
      ...vault,
      v: Math.max(vault.v || 0, 1),
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: PBKDF2_ITERATIONS,
      },
      alg: "AES-GCM",
      salt: vault.salt,
      iv: b64(iv),
      check: b64(ciphertext),
      migratedAt: new Date().toISOString(),
      previousIterations: current,
    };
    saveVault(next);
    if (window.SIOS_BUS && window.SIOS_BUS.toast) {
      window.SIOS_BUS.toast("Keys vault upgraded to 600k PBKDF2", "ok");
    }
    return key;
  }

  function readLockTimeout() {
    try {
      if (window.SIOS_SETTINGS && typeof window.SIOS_SETTINGS.getLockTimeoutMs === "function") {
        return window.SIOS_SETTINGS.getLockTimeoutMs();
      }
      const s = window.SIOS_STORE ? window.SIOS_STORE.get("sios-settings-v0") : null;
      const mins = s && s.lockTimeoutMinutes;
      if (mins === 0 || mins === "0") return 0;
      if (typeof mins === "number" && mins > 0) return mins * 60 * 1000;
    } catch {
      /* ignore */
    }
    return 0;
  }

  function bumpIdle() {
    lockTimeoutMs = readLockTimeout();
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (!sessionKey || !lockTimeoutMs) return;
    idleTimer = setTimeout(() => {
      lockSession();
      if (window.SIOS_BUS && window.SIOS_BUS.toast) {
        window.SIOS_BUS.toast("Keys locked · idle timeout", "info");
      }
    }, lockTimeoutMs);
  }

  async function encryptBytes(key, plainBytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plainBytes
    );
    return { iv, ciphertext };
  }

  async function decryptBytes(key, iv, ciphertext) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  }

  function refreshUI() {
    const vault = loadVault();
    setupEl.hidden = true;
    unlockEl.hidden = true;
    unlockedEl.hidden = true;

    if (!vault) {
      statusEl.textContent = "No vault on this device yet.";
      setupEl.hidden = false;
    } else if (sessionKey) {
      const iters = vaultIterations(vault);
      statusEl.textContent =
        "Unlocked · key in memory for this tab only · PBKDF2 " +
        iters.toLocaleString() +
        " iterations.";
      unlockedEl.hidden = false;
    } else {
      const iters = vaultIterations(vault);
      statusEl.textContent =
        "Vault present · locked · PBKDF2 " + iters.toLocaleString() + " iterations.";
      unlockEl.hidden = false;
    }
    renderLibrary();
  }

  function renderLibrary() {
    const list = loadLibrary();
    blobListEl.innerHTML = "";
    blobEmptyEl.hidden = list.length > 0;
    list.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = "keys-blob-item";
      const meta = document.createElement("div");
      meta.className = "keys-blob-meta";
      meta.innerHTML = `<strong>${escapeHtml(
        item.label || "Untitled"
      )}</strong><span>${escapeHtml(
        (item.createdAt || "").slice(0, 19).replace("T", " ")
      )} · ${item.bytes || "?"} B</span>`;
      const actions = document.createElement("div");
      actions.className = "keys-blob-actions";
      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "keys-link";
      loadBtn.textContent = "Load into decrypt";
      loadBtn.addEventListener("click", () => {
        document.getElementById("keys-dec-blob").value = JSON.stringify(
          item.envelope,
          null,
          2
        );
        document.getElementById("keys-dec-out-wrap").hidden = true;
      });
      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.className = "keys-link";
      dlBtn.textContent = "Download";
      dlBtn.addEventListener("click", () => downloadEnvelope(item.envelope, item.label));
      const rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "keys-link danger";
      rmBtn.textContent = "Remove";
      rmBtn.addEventListener("click", () => {
        const next = loadLibrary().filter((_, i) => i !== idx);
        saveLibrary(next);
        renderLibrary();
      });
      actions.append(loadBtn, dlBtn, rmBtn);
      li.append(meta, actions);
      blobListEl.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function downloadEnvelope(envelope, label) {
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (label || "sios-ciphertext").replace(/[^\w.-]+/g, "_").slice(0, 40);
    a.download = `${safe}-${new Date().toISOString().slice(0, 10)}.sios.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function lockSession() {
    sessionKey = null;
    sessionSaltB64 = null;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    clearField(document.getElementById("keys-unlock-pass"));
    clearField(document.getElementById("keys-enc-text"));
    clearField(document.getElementById("keys-dec-pass"));
    clearField(document.getElementById("keys-dec-out"));
    document.getElementById("keys-dec-out-wrap").hidden = true;
    refreshUI();
  }

  document.getElementById("keys-setup-btn").addEventListener("click", async () => {
    const p1 = document.getElementById("keys-setup-pass").value;
    const p2 = document.getElementById("keys-setup-pass2").value;
    if (p1.length < 8) {
      alert("Use at least 8 characters. Longer is better.");
      return;
    }
    if (p1 !== p2) {
      alert("Passphrases do not match.");
      return;
    }
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(p1, salt);
      const enc = new TextEncoder();
      const { iv, ciphertext } = await encryptBytes(key, enc.encode(CHECK_PLAIN));
      saveVault({
        v: 0,
        kdf: {
          name: "PBKDF2",
          hash: "SHA-256",
          iterations: PBKDF2_ITERATIONS,
        },
        alg: "AES-GCM",
        salt: b64(salt),
        iv: b64(iv),
        check: b64(ciphertext),
        createdAt: new Date().toISOString(),
      });
      sessionKey = key;
      sessionSaltB64 = b64(salt);
      clearField(document.getElementById("keys-setup-pass"));
      clearField(document.getElementById("keys-setup-pass2"));
      refreshUI();
    } catch (err) {
      alert("Vault setup failed: " + (err && err.message ? err.message : "error"));
      lockSession();
    }
  });

  document.getElementById("keys-unlock-btn").addEventListener("click", async () => {
    const vault = loadVault();
    if (!vault) return;
    const pass = document.getElementById("keys-unlock-pass").value;
    if (!pass) {
      alert("Enter your passphrase.");
      return;
    }
    try {
      const salt = fromB64(vault.salt);
      const iters = vaultIterations(vault);
      const key = await deriveKey(pass, salt, iters);
      const plain = await decryptBytes(key, fromB64(vault.iv), fromB64(vault.check));
      const text = new TextDecoder().decode(plain);
      if (text !== CHECK_PLAIN) throw new Error("Vault check mismatch");
      sessionKey = key;
      sessionSaltB64 = vault.salt;
      // Upgrade legacy 310k vaults to 600k while passphrase is known
      if (iters < PBKDF2_ITERATIONS) {
        sessionKey = await migrateVaultKdf(pass, vault);
      }
      clearField(document.getElementById("keys-unlock-pass"));
      bumpIdle();
      refreshUI();
    } catch {
      alert("Unlock failed. Wrong passphrase or corrupted vault data.");
      lockSession();
    }
  });

  document.getElementById("keys-lock-btn").addEventListener("click", lockSession);

  document.getElementById("keys-reset-btn").addEventListener("click", () => {
    const ok = confirm(
      "Reset vault? This deletes the local vault verifier and the optional blob list.\n\nEncrypted files you already downloaded are NOT deleted — but you must remember the passphrase.\n\nThere is no recovery."
    );
    if (!ok) return;
    if (window.SIOS_STORE) {
      window.SIOS_STORE.remove(VAULT_KEY);
      window.SIOS_STORE.remove(BLOBS_KEY);
    }
    lockSession();
  });

  document.getElementById("keys-encrypt-btn").addEventListener("click", async () => {
    if (!sessionKey || !sessionSaltB64) {
      alert("Unlock the vault first.");
      return;
    }
    const text = document.getElementById("keys-enc-text").value;
    if (!text) {
      alert("Enter plaintext to encrypt.");
      return;
    }
    if (text.length > MAX_PLAIN_CHARS) {
      alert(`Plaintext too long (max ${MAX_PLAIN_CHARS} characters in v0).`);
      return;
    }
    const label = document.getElementById("keys-enc-label").value.trim().slice(0, 80);
    try {
      const enc = new TextEncoder();
      const { iv, ciphertext } = await encryptBytes(sessionKey, enc.encode(text));
      const envelope = {
        v: 0,
        app: "SIOS Keys",
        schema: "https://github.com/superintelligent-silicon/sios/blob/main/docs/KEYS.md",
        alg: "AES-GCM",
        kdf: {
          name: "PBKDF2",
          hash: "SHA-256",
          iterations: PBKDF2_ITERATIONS,
        },
        label: label || undefined,
        salt: sessionSaltB64,
        iv: b64(iv),
        ciphertext: b64(ciphertext),
        createdAt: new Date().toISOString(),
      };
      downloadEnvelope(envelope, label || "sios-ciphertext");
      const lib = loadLibrary();
      lib.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        label: label || "Untitled",
        createdAt: envelope.createdAt,
        bytes: ciphertext.byteLength,
        envelope,
      });
      saveLibrary(lib);
      clearField(document.getElementById("keys-enc-text"));
      renderLibrary();
    } catch (err) {
      alert("Encrypt failed: " + (err && err.message ? err.message : "error"));
    }
  });

  document.getElementById("keys-dec-upload-btn").addEventListener("click", () => {
    document.getElementById("keys-dec-file").click();
  });
  document.getElementById("keys-dec-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text); // validate
      document.getElementById("keys-dec-blob").value = text;
    } catch {
      alert("Could not read a valid JSON blob.");
    }
    e.target.value = "";
  });

  document.getElementById("keys-decrypt-btn").addEventListener("click", async () => {
    const pass = document.getElementById("keys-dec-pass").value;
    const raw = document.getElementById("keys-dec-blob").value.trim();
    if (!pass || !raw) {
      alert("Provide ciphertext JSON and passphrase.");
      return;
    }
    try {
      const envelope = JSON.parse(raw);
      if (!envelope.salt || !envelope.iv || !envelope.ciphertext) {
        throw new Error("Blob missing salt, iv, or ciphertext");
      }
      if (envelope.kdf && envelope.kdf.iterations && envelope.kdf.iterations !== PBKDF2_ITERATIONS) {
        // Allow reading documented iterations from blob for forward compat — use blob value
      }
      const iterations =
        (envelope.kdf && envelope.kdf.iterations) || PBKDF2_ITERATIONS;
      const salt = fromB64(envelope.salt);
      const enc = new TextEncoder();
      const baseKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(pass),
        "PBKDF2",
        false,
        ["deriveKey"]
      );
      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: (envelope.kdf && envelope.kdf.hash) || "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
      const plainBuf = await decryptBytes(
        key,
        fromB64(envelope.iv),
        fromB64(envelope.ciphertext)
      );
      const out = document.getElementById("keys-dec-out");
      out.value = new TextDecoder().decode(plainBuf);
      document.getElementById("keys-dec-out-wrap").hidden = false;
      clearField(document.getElementById("keys-dec-pass"));
    } catch {
      alert("Decrypt failed. Wrong passphrase or invalid/corrupt blob.");
      clearField(document.getElementById("keys-dec-pass"));
      document.getElementById("keys-dec-out-wrap").hidden = true;
    }
  });

  // Lock when window closes / hides via MutationObserver-ish: on dock close, shell hides window
  const obs = new MutationObserver(() => {
    if (win.hidden && sessionKey) {
      // Keep session across hide within same page — actually safer to lock when closed
      // Conservative: lock when Keys window is hidden
      lockSession();
    }
  });
  obs.observe(win, { attributes: true, attributeFilter: ["hidden"] });

  window.SIOS_KEYS = {
    isOpen: () => win && !win.hidden,
    lock: lockSession,
    bumpIdle,
    setLockTimeoutFromSettings: bumpIdle,
    PBKDF2_ITERATIONS,
    reloadFromStore() {
      lockSession();
      refreshUI();
    },
  };

  // Also lock on page hide
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lockSession();
  });

  win.addEventListener("pointerdown", bumpIdle);
  win.addEventListener("keydown", bumpIdle);

  async function bootKeys() {
    if (window.SIOS_STORE && window.SIOS_STORE.ready) await window.SIOS_STORE.ready;
    refreshUI();
  }
  bootKeys();
})();
