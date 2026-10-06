/*! SIOS Backup — ZIP export/import via fflate (MIT). Clearly UNENCRYPTED. */
(function () {
  "use strict";

  function enc(str) {
    return new TextEncoder().encode(str);
  }

  function dec(buf) {
    return new TextDecoder().decode(buf);
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function flattenFiles(node, prefix, out) {
    if (!node) return;
    if (node.type === "file") {
      const path = (prefix ? prefix + "/" : "") + node.name;
      out[path] = node.content || "";
      return;
    }
    const base = node.name ? (prefix ? prefix + "/" + node.name : node.name) : prefix || "";
    (node.children || []).forEach((c) => flattenFiles(c, base, out));
  }

  function collectNotesMd(tree) {
    const all = {};
    flattenFiles(tree, "", all);
    const notes = {};
    Object.keys(all).forEach((p) => {
      if (p.startsWith("Notes/") && /\.md$/i.test(p)) {
        notes[p.slice("Notes/".length)] = all[p];
      }
    });
    return notes;
  }

  function buildReadme() {
    return [
      "SIOS backup archive",
      "==================",
      "",
      "WARNING: This ZIP is UNENCRYPTED.",
      "Anyone with the file can read your notes, files, calendar, calc history, and settings.",
      "Optional keys/blobs.json holds encrypted envelopes + labels only — never passphrases.",
      "The Keys vault verifier is NOT included (cannot be replaced from a ZIP).",
      "",
      "Created: " + new Date().toISOString(),
      "App: SIOS (Silicon OS / Superintelligent OS)",
      "Repo: https://github.com/superintelligent-silicon/sios",
      "",
      "Layout:",
      "  README.txt",
      "  settings.json",
      "  notes/*.md",
      "  files/tree.json",
      "  files/export/**",
      "  calendar/events.json",
      "  calc/history.json",
      "  keys/blobs.json   (optional)",
      "",
    ].join("\n");
  }

  async function gatherPayload() {
    if (window.SIOS_STORE && window.SIOS_STORE.ready) await window.SIOS_STORE.ready;

    const filesPayload = window.SIOS_STORE.get("sios-files-tree-v0");
    const tree =
      (filesPayload && filesPayload.tree) ||
      (window.SIOS_FILES && window.SIOS_FILES.getTree && window.SIOS_FILES.getTree()) ||
      { type: "dir", name: "", children: [] };
    const calendar = window.SIOS_STORE.get("sios-calendar-events-v0") || [];
    const calc = window.SIOS_STORE.get("sios-calc-history-v0") || [];
    const settings =
      window.SIOS_STORE.get("sios-settings-v0") ||
      (window.SIOS_SETTINGS && window.SIOS_SETTINGS.get && window.SIOS_SETTINGS.get()) ||
      {};
    const includeKeys =
      (window.SIOS_SETTINGS &&
        window.SIOS_SETTINGS.exportIncludeKeysBlobs &&
        window.SIOS_SETTINGS.exportIncludeKeysBlobs()) ||
      !!(settings && settings.exportIncludeKeysBlobs);
    const keysBlobs = includeKeys ? window.SIOS_STORE.get("sios-keys-blobs-v0") || [] : null;
    return { tree, calendar, calc, settings, keysBlobs, includeKeys };
  }

  async function exportZip() {
    if (!window.fflate || !window.fflate.zipSync) {
      alert("ZIP library (fflate) failed to load.");
      return;
    }
    const data = await gatherPayload();
    const flat = {};
    flattenFiles(data.tree, "", flat);
    const notes = collectNotesMd(data.tree);

    const files = {
      "README.txt": enc(buildReadme()),
      "settings.json": enc(JSON.stringify(data.settings, null, 2)),
      "calendar/events.json": enc(JSON.stringify(data.calendar, null, 2)),
      "calc/history.json": enc(JSON.stringify(data.calc, null, 2)),
      "files/tree.json": enc(
        JSON.stringify(
          {
            app: "SIOS Files",
            version: 0,
            exportedAt: new Date().toISOString(),
            tree: data.tree,
          },
          null,
          2
        )
      ),
    };

    Object.keys(notes).forEach((name) => {
      files["notes/" + name] = enc(notes[name]);
    });
    Object.keys(flat).forEach((path) => {
      files["files/export/" + path] = enc(flat[path]);
    });

    if (data.includeKeys && data.keysBlobs) {
      files["keys/blobs.json"] = enc(
        JSON.stringify(
          {
            warning: "UNENCRYPTED archive containing encrypted envelopes + labels. No passphrase.",
            blobs: data.keysBlobs,
          },
          null,
          2
        )
      );
    }

    const zipped = window.fflate.zipSync(files, { level: 6 });
    const blob = new Blob([zipped], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sios-backup-" + dateStamp() + "-UNENCRYPTED.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (window.SIOS_BUS && window.SIOS_BUS.toast) {
      window.SIOS_BUS.toast("Exported UNENCRYPTED backup ZIP", "ok");
    }
  }

  function parseJson(u8) {
    return JSON.parse(dec(u8));
  }

  function entry(unzipped, path) {
    return unzipped[path] || unzipped["/" + path] || null;
  }

  async function applyImport(unzipped, mode) {
    const treeEntry = entry(unzipped, "files/tree.json");
    if (treeEntry && window.SIOS_FILES) {
      const payload = parseJson(treeEntry);
      const incoming = payload.tree || payload;
      if (mode === "replace") {
        window.SIOS_FILES.replaceTree(incoming, { notify: false });
      } else {
        const flat = {};
        flattenFiles(incoming, "", flat);
        Object.keys(flat).forEach((path) => {
          const parts = path.split("/").filter(Boolean);
          const fileName = parts.pop();
          window.SIOS_FILES.writeTextFile({
            folderPath: parts,
            fileName,
            content: flat[path],
            openAfter: false,
          });
        });
      }
    }

    const calEntry = entry(unzipped, "calendar/events.json");
    if (calEntry && window.SIOS_CALENDAR) {
      const list = parseJson(calEntry);
      if (mode === "replace") {
        window.SIOS_CALENDAR.setEvents(list);
      } else {
        const cur = window.SIOS_CALENDAR.getEvents() || [];
        const byId = new Map(cur.map((e) => [e.id, e]));
        (list || []).forEach((e) => {
          if (e && e.id) byId.set(e.id, e);
        });
        window.SIOS_CALENDAR.setEvents(Array.from(byId.values()));
      }
    }

    const calcEntry = entry(unzipped, "calc/history.json");
    if (calcEntry && window.SIOS_CALC) {
      const list = parseJson(calcEntry);
      if (mode === "replace") {
        window.SIOS_CALC.setHistory(list);
      } else {
        const cur = window.SIOS_CALC.getHistory() || [];
        window.SIOS_CALC.setHistory([].concat(list || [], cur).slice(0, 50));
      }
    }

    const settingsEntry = entry(unzipped, "settings.json");
    if (settingsEntry && window.SIOS_STORE) {
      const s = parseJson(settingsEntry);
      await window.SIOS_STORE.set("sios-settings-v0", s);
      if (window.SIOS_SETTINGS && window.SIOS_SETTINGS.reloadFromStore) {
        window.SIOS_SETTINGS.reloadFromStore();
      }
    }

    const keysEntry = entry(unzipped, "keys/blobs.json");
    if (keysEntry && window.SIOS_STORE) {
      const payload = parseJson(keysEntry);
      const blobs = payload.blobs || payload;
      if (Array.isArray(blobs)) {
        if (mode === "replace") {
          await window.SIOS_STORE.set("sios-keys-blobs-v0", blobs);
        } else {
          const cur = window.SIOS_STORE.get("sios-keys-blobs-v0") || [];
          await window.SIOS_STORE.set("sios-keys-blobs-v0", [].concat(blobs, cur).slice(0, 40));
        }
        if (window.SIOS_KEYS && window.SIOS_KEYS.reloadFromStore) {
          window.SIOS_KEYS.reloadFromStore();
        }
      }
    }

    if (window.SIOS_NOTES && window.SIOS_NOTES.refresh) window.SIOS_NOTES.refresh();
  }

  let pendingUnzip = null;

  async function handleFile(file) {
    if (!window.fflate || !window.fflate.unzipSync) {
      alert("ZIP library (fflate) failed to load.");
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    let unzipped;
    try {
      unzipped = window.fflate.unzipSync(buf);
    } catch (err) {
      alert("Could not read ZIP: " + (err && err.message ? err.message : "error"));
      return;
    }
    pendingUnzip = unzipped;
    const modal = document.getElementById("backup-import-modal");
    const msg = document.getElementById("backup-import-msg");
    if (msg) {
      msg.textContent =
        "Archive has " +
        Object.keys(unzipped).length +
        " entries. This backup is UNENCRYPTED. Merge overlays data; Replace overwrites Files/Calendar/Calc/Settings. Keys vault is never replaced from ZIP.";
    }
    if (modal) modal.hidden = false;
  }

  async function finishImport(mode) {
    if (!pendingUnzip) return;
    const unzipped = pendingUnzip;
    pendingUnzip = null;
    const modal = document.getElementById("backup-import-modal");
    if (modal) modal.hidden = true;
    try {
      await applyImport(unzipped, mode);
      if (window.SIOS_BUS && window.SIOS_BUS.toast) {
        window.SIOS_BUS.toast("Backup imported (" + mode + ")", "ok");
      }
    } catch (err) {
      alert("Import failed: " + (err && err.message ? err.message : "error"));
    }
  }

  window.SIOS_BACKUP = {
    exportZip,
    importZipFile: handleFile,
  };

  document.getElementById("settings-export-zip")?.addEventListener("click", () => {
    const ok = confirm(
      "Export an UNENCRYPTED ZIP backup of your SIOS data?\n\nAnyone with the file can read your notes and files. Continue?"
    );
    if (!ok) return;
    exportZip();
  });

  const importInput = document.getElementById("settings-import-zip");
  document.getElementById("settings-import-zip-btn")?.addEventListener("click", () => {
    if (importInput) {
      importInput.value = "";
      importInput.click();
    }
  });
  importInput?.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    await handleFile(file);
  });

  document.getElementById("backup-import-cancel")?.addEventListener("click", () => {
    pendingUnzip = null;
    const modal = document.getElementById("backup-import-modal");
    if (modal) modal.hidden = true;
  });
  document.getElementById("backup-import-merge")?.addEventListener("click", () => finishImport("merge"));
  document.getElementById("backup-import-replace")?.addEventListener("click", () => finishImport("replace"));
})();
