/*! SIOS Settings v0 — theme, lock timeout, storage status, export defaults. Local-only. */
(function () {
  "use strict";

  const STORAGE_KEY = "sios-settings-v0";
  const win = document.querySelector('[data-window="settings"]');
  if (!win) return;

  const themeEl = document.getElementById("settings-theme");
  const lockEl = document.getElementById("settings-lock");
  const includeKeysEl = document.getElementById("settings-include-keys");
  const storageEl = document.getElementById("settings-storage");
  const persistEl = document.getElementById("settings-persist");
  const aboutEl = document.getElementById("settings-about");

  const defaults = {
    theme: "system", // system | dark | light
    lockTimeoutMinutes: 0, // 0 = no idle lock beyond visibility
    exportIncludeKeysBlobs: false,
    version: 0,
  };

  let settings = Object.assign({}, defaults);

  function load() {
    try {
      const raw = window.SIOS_STORE ? window.SIOS_STORE.get(STORAGE_KEY) : null;
      if (!raw || typeof raw !== "object") return Object.assign({}, defaults);
      return Object.assign({}, defaults, raw);
    } catch {
      return Object.assign({}, defaults);
    }
  }

  function save() {
    settings.updatedAt = new Date().toISOString();
    if (window.SIOS_STORE) {
      window.SIOS_STORE.set(STORAGE_KEY, settings).catch(() => {});
    }
  }

  function systemPrefersLight() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  }

  function applyTheme() {
    const t = settings.theme || "system";
    let resolved = t;
    if (t === "system") resolved = systemPrefersLight() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
  }

  function syncForm() {
    if (themeEl) themeEl.value = settings.theme || "system";
    if (lockEl) lockEl.value = String(settings.lockTimeoutMinutes ?? 0);
    if (includeKeysEl) includeKeysEl.checked = !!settings.exportIncludeKeysBlobs;
  }

  async function refreshStorage() {
    if (!storageEl) return;
    if (!window.SIOS_STORE) {
      storageEl.textContent = "Storage adapter unavailable.";
      return;
    }
    const est = await window.SIOS_STORE.estimate();
    const usedMb = est.usage ? (est.usage / (1024 * 1024)).toFixed(2) : "0";
    const quotaMb = est.quota ? (est.quota / (1024 * 1024)).toFixed(0) : "?";
    const backend = window.SIOS_STORE.backend();
    const persisted = window.SIOS_STORE.isPersistent();
    storageEl.textContent =
      `Backend: ${backend} · ~${usedMb} MB used` +
      (est.quota ? ` of ~${quotaMb} MB` : "") +
      (persisted ? " · persistent" : " · best-effort (may be evicted)");
    if (persistEl) {
      persistEl.hidden = !!persisted;
    }
  }

  function onChange() {
    settings.theme = themeEl ? themeEl.value : "system";
    settings.lockTimeoutMinutes = lockEl ? Number(lockEl.value) || 0 : 0;
    settings.exportIncludeKeysBlobs = includeKeysEl ? !!includeKeysEl.checked : false;
    save();
    applyTheme();
    if (window.SIOS_KEYS && window.SIOS_KEYS.setLockTimeoutFromSettings) {
      window.SIOS_KEYS.setLockTimeoutFromSettings();
    }
    if (window.SIOS_BUS && window.SIOS_BUS.toast) {
      window.SIOS_BUS.toast("Settings saved", "ok");
    }
  }

  if (themeEl) themeEl.addEventListener("change", onChange);
  if (lockEl) lockEl.addEventListener("change", onChange);
  if (includeKeysEl) includeKeysEl.addEventListener("change", onChange);

  document.getElementById("settings-persist-btn")?.addEventListener("click", async () => {
    if (!window.SIOS_STORE) return;
    const ok = await window.SIOS_STORE.requestPersist();
    if (window.SIOS_BUS && window.SIOS_BUS.toast) {
      window.SIOS_BUS.toast(
        ok ? "Persistent storage granted" : "Browser declined persistent storage",
        ok ? "ok" : "err"
      );
    }
    refreshStorage();
  });

  document.getElementById("settings-refresh-storage")?.addEventListener("click", () => {
    refreshStorage();
  });

  if (aboutEl) {
    aboutEl.textContent =
      "SIOS shell Phase 1a · Silicon OS / Superintelligent OS · local-first · MIT · no accounts";
  }

  window.SIOS_SETTINGS = {
    isOpen: () => win && !win.hidden,
    get: () => Object.assign({}, settings),
    getLockTimeoutMs() {
      const m = settings.lockTimeoutMinutes;
      if (!m) return 0;
      return Number(m) * 60 * 1000;
    },
    exportIncludeKeysBlobs: () => !!settings.exportIncludeKeysBlobs,
    reloadFromStore() {
      settings = load();
      syncForm();
      applyTheme();
      refreshStorage();
    },
    STORAGE_KEY,
  };

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
      if (settings.theme === "system") applyTheme();
    });
  }

  async function boot() {
    if (window.SIOS_STORE && window.SIOS_STORE.ready) await window.SIOS_STORE.ready;
    settings = load();
    syncForm();
    applyTheme();
    await refreshStorage();
  }
  boot();
})();
