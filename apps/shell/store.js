/*! SIOS store — IndexedDB primary, localStorage fallback + one-time migration.
 * Local-only. No network. Request persistent storage when available.
 */
(function () {
  "use strict";

  const DB_NAME = "sios-store-v1";
  const DB_STORE = "kv";
  const DB_VERSION = 1;
  const META_MIGRATED = "sios-store-migrated-v1";
  const LEGACY_KEYS = [
    "sios-files-tree-v0",
    "sios-calc-history-v0",
    "sios-calendar-events-v0",
    "sios-keys-vault-v0",
    "sios-keys-blobs-v0",
    "sios-settings-v0",
  ];

  /** @type {Map<string, any>} */
  const cache = new Map();
  /** @type {IDBDatabase | null} */
  let db = null;
  let backend = "memory";
  let persistent = false;
  let readyResolve;
  const ready = new Promise((r) => {
    readyResolve = r;
  });

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(DB_STORE)) {
          database.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IDB open failed"));
    });
  }

  function idbReq(txStore, mode, fn) {
    return new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("IDB not open"));
        return;
      }
      const tx = db.transaction(DB_STORE, mode);
      const store = tx.objectStore(DB_STORE);
      let req;
      try {
        req = fn(store);
      } catch (err) {
        reject(err);
        return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IDB request failed"));
    });
  }

  async function idbGet(key) {
    return idbReq(DB_STORE, "readonly", (s) => s.get(key));
  }

  async function idbSet(key, value) {
    return idbReq(DB_STORE, "readwrite", (s) => s.put(value, key));
  }

  async function idbDelete(key) {
    return idbReq(DB_STORE, "readwrite", (s) => s.delete(key));
  }

  async function idbGetAllKeys() {
    return idbReq(DB_STORE, "readonly", (s) => s.getAllKeys());
  }

  function lsGetRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function lsSetRaw(key, raw) {
    try {
      localStorage.setItem(key, raw);
      return true;
    } catch {
      return false;
    }
  }

  function lsRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function parseMaybe(raw) {
    if (raw == null) return null;
    if (typeof raw !== "string") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async function migrateFromLocalStorage() {
    const flag = cache.get(META_MIGRATED) || parseMaybe(lsGetRaw(META_MIGRATED));
    if (flag && flag.done) return;

    for (const key of LEGACY_KEYS) {
      if (cache.has(key)) continue;
      const raw = lsGetRaw(key);
      if (raw == null) continue;
      const value = parseMaybe(raw);
      cache.set(key, value);
      if (backend === "idb") {
        try {
          await idbSet(key, value);
        } catch {
          /* keep in cache + LS fallback */
        }
      }
    }

    const meta = { done: true, at: new Date().toISOString(), from: "localStorage" };
    cache.set(META_MIGRATED, meta);
    if (backend === "idb") {
      try {
        await idbSet(META_MIGRATED, meta);
        // Clear migrated LS keys so we don't dual-write forever (keep until IDB write ok)
        for (const key of LEGACY_KEYS) {
          if (cache.has(key)) lsRemove(key);
        }
        lsRemove(META_MIGRATED);
      } catch {
        lsSetRaw(META_MIGRATED, JSON.stringify(meta));
      }
    } else {
      lsSetRaw(META_MIGRATED, JSON.stringify(meta));
    }
  }

  async function hydrateFromIdb() {
    const keys = await idbGetAllKeys();
    for (const key of keys) {
      const val = await idbGet(key);
      cache.set(String(key), val);
    }
  }

  async function requestPersist() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        persistent = await navigator.storage.persist();
        return persistent;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function checkPersistent() {
    try {
      if (navigator.storage && navigator.storage.persisted) {
        persistent = await navigator.storage.persisted();
        return persistent;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  async function estimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return {
          usage: e.usage || 0,
          quota: e.quota || 0,
          backend,
          persistent,
        };
      }
    } catch {
      /* ignore */
    }
    let usage = 0;
    cache.forEach((v) => {
      try {
        usage += JSON.stringify(v).length;
      } catch {
        /* ignore */
      }
    });
    return { usage, quota: 0, backend, persistent };
  }

  function get(key) {
    if (!cache.has(key)) return null;
    return cache.get(key);
  }

  async function set(key, value) {
    cache.set(key, value);
    if (backend === "idb") {
      try {
        await idbSet(key, value);
        return true;
      } catch (err) {
        // Fall back to LS for this key
        const ok = lsSetRaw(key, JSON.stringify(value));
        if (!ok) throw err;
        return true;
      }
    }
    const ok = lsSetRaw(key, JSON.stringify(value));
    if (!ok) throw new Error("Storage quota or private mode");
    return true;
  }

  async function remove(key) {
    cache.delete(key);
    if (backend === "idb") {
      try {
        await idbDelete(key);
      } catch {
        /* ignore */
      }
    }
    lsRemove(key);
  }

  function keys() {
    return Array.from(cache.keys()).filter((k) => k !== META_MIGRATED);
  }

  async function exportAll() {
    const out = {};
    keys().forEach((k) => {
      out[k] = cache.get(k);
    });
    return {
      app: "SIOS Store",
      version: 1,
      exportedAt: new Date().toISOString(),
      keys: out,
    };
  }

  async function importAll(payload, mode) {
    const src = (payload && payload.keys) || payload || {};
    if (mode === "replace") {
      for (const k of keys()) {
        await remove(k);
      }
    }
    for (const [k, v] of Object.entries(src)) {
      if (k === META_MIGRATED) continue;
      await set(k, v);
    }
  }

  async function boot() {
    try {
      db = await openDb();
      backend = "idb";
      await hydrateFromIdb();
    } catch {
      db = null;
      backend = "localStorage";
      // Seed cache from LS
      for (const key of LEGACY_KEYS.concat([META_MIGRATED])) {
        const raw = lsGetRaw(key);
        if (raw != null) cache.set(key, parseMaybe(raw));
      }
    }

    await migrateFromLocalStorage();
    await checkPersistent();
    // Soft-request persist on first interactive save path; also try once at boot
    try {
      await requestPersist();
    } catch {
      /* ignore */
    }

    readyResolve();
  }

  window.SIOS_STORE = {
    ready,
    get,
    set,
    remove,
    keys,
    estimate,
    requestPersist,
    isPersistent: () => persistent,
    backend: () => backend,
    exportAll,
    importAll,
    version: 1,
  };

  boot().catch((err) => {
    console.error("SIOS_STORE boot failed", err);
    backend = "localStorage";
    for (const key of LEGACY_KEYS.concat([META_MIGRATED])) {
      const raw = lsGetRaw(key);
      if (raw != null) cache.set(key, parseMaybe(raw));
    }
    readyResolve();
  });
})();
