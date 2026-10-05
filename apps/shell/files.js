/*! SIOS Files v0 — virtual FS in localStorage. No server upload. No real disk. */
(function () {
  "use strict";

  const STORAGE_KEY = "sios-files-tree-v0";
  const MAX_FILE_CHARS = 50000; // ~50KB text per file
  const WARN_STORE_CHARS = 1_500_000; // soft warn before typical localStorage limits

  const win = document.querySelector('[data-window="files"]');
  if (!win) return;

  const crumbsEl = document.getElementById("files-crumbs");
  const listEl = document.getElementById("files-list");
  const emptyEl = document.getElementById("files-empty");
  const quotaEl = document.getElementById("files-quota");
  const editorEmpty = document.getElementById("files-editor-empty");
  const editor = document.getElementById("files-editor");
  const editorName = document.getElementById("files-editor-name");
  const textarea = document.getElementById("files-textarea");
  const saveBtn = document.getElementById("files-save");
  const promptModal = document.getElementById("files-prompt-modal");
  const promptTitle = document.getElementById("files-prompt-title");
  const promptLabel = document.getElementById("files-prompt-label");
  const promptInput = document.getElementById("files-prompt-input");
  const promptForm = document.getElementById("files-prompt-form");
  const importModal = document.getElementById("files-import-modal");
  const importMsg = document.getElementById("files-import-msg");
  const fileInput = document.getElementById("files-import");

  let root = loadTree();
  let path = []; // array of folder names from root
  let openFilePath = null; // string[] including filename
  let dirty = false;
  let promptResolve = null;
  let pendingImport = null;

  function now() {
    return new Date().toISOString();
  }

  function defaultTree() {
    return {
      type: "dir",
      name: "",
      children: [
        {
          type: "dir",
          name: "Notes",
          children: [
            {
              type: "file",
              name: "welcome.txt",
              content:
                "Welcome to SIOS Files.\n\nThis is a virtual tree stored in localStorage on your device.\nNo real disk access. No server upload.\n",
              updatedAt: now(),
            },
          ],
        },
        {
          type: "file",
          name: "readme.txt",
          content:
            "SIOS (Silicon OS / Superintelligent OS)\nVirtual filesystem v0\n\nExport JSON to back up. Import to restore.\n",
          updatedAt: now(),
        },
      ],
    };
  }

  function loadTree() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultTree();
      const data = JSON.parse(raw);
      const tree = data.tree || data;
      if (!tree || tree.type !== "dir" || !Array.isArray(tree.children)) {
        return defaultTree();
      }
      return sanitizeTree(tree);
    } catch {
      return defaultTree();
    }
  }

  function sanitizeName(name) {
    return String(name || "")
      .replace(/[\/:*?"<>|]/g, "")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 80);
  }

  function sanitizeTree(node) {
    if (!node || (node.type !== "dir" && node.type !== "file")) {
      return { type: "dir", name: "", children: [] };
    }
    if (node.type === "file") {
      return {
        type: "file",
        name: sanitizeName(node.name) || "untitled.txt",
        content: String(node.content || "").slice(0, MAX_FILE_CHARS),
        updatedAt: node.updatedAt || now(),
      };
    }
    const children = Array.isArray(node.children) ? node.children : [];
    const seen = new Set();
    const out = [];
    children.forEach((c) => {
      const n = sanitizeTree(c);
      const key = n.name.toLowerCase();
      if (!n.name || seen.has(key)) return;
      seen.add(key);
      out.push(n);
    });
    out.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { type: "dir", name: sanitizeName(node.name), children: out };
  }

  function persist() {
    const payload = {
      app: "SIOS Files",
      version: 0,
      schema: "https://github.com/superintelligent-silicon/sios/blob/main/docs/FILES.md",
      savedAt: now(),
      tree: root,
    };
    const json = JSON.stringify(payload);
    try {
      localStorage.setItem(STORAGE_KEY, json);
      updateQuota(json.length);
      return true;
    } catch (err) {
      alert(
        "Could not save to localStorage (quota or private mode). Export JSON as a backup.\n\n" +
          (err && err.message ? err.message : "")
      );
      updateQuota(json.length);
      return false;
    }
  }

  function updateQuota(len) {
    const kb = Math.round(len / 1024);
    let msg = `Store ~${kb} KB in localStorage`;
    if (len > WARN_STORE_CHARS) {
      msg += " · nearing typical browser limits — export a backup";
    }
    msg += ` · max ${Math.round(MAX_FILE_CHARS / 1000)}k chars/file`;
    quotaEl.textContent = msg;
  }

  function dirAt(parts) {
    let node = root;
    for (const part of parts) {
      if (!node || node.type !== "dir") return null;
      node = node.children.find((c) => c.type === "dir" && c.name === part);
    }
    return node;
  }

  function fileAt(parts) {
    if (!parts.length) return null;
    const dir = dirAt(parts.slice(0, -1));
    if (!dir) return null;
    const name = parts[parts.length - 1];
    return dir.children.find((c) => c.type === "file" && c.name === name) || null;
  }

  function currentDir() {
    return dirAt(path) || root;
  }

  function renderCrumbs() {
    crumbsEl.innerHTML = "";
    const home = document.createElement("button");
    home.type = "button";
    home.className = "files-crumb";
    home.textContent = "Home";
    home.addEventListener("click", () => {
      maybeLeaveEditor(() => {
        path = [];
        closeEditor();
        render();
      });
    });
    crumbsEl.appendChild(home);
    path.forEach((seg, i) => {
      const sep = document.createElement("span");
      sep.className = "files-crumb-sep";
      sep.textContent = "/";
      crumbsEl.appendChild(sep);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "files-crumb";
      btn.textContent = seg;
      btn.addEventListener("click", () => {
        maybeLeaveEditor(() => {
          path = path.slice(0, i + 1);
          closeEditor();
          render();
        });
      });
      crumbsEl.appendChild(btn);
    });
  }

  function renderList() {
    const dir = currentDir();
    listEl.innerHTML = "";
    const kids = dir.children || [];
    emptyEl.hidden = kids.length > 0;
    kids.forEach((node) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "files-item" + (node.type === "dir" ? " is-dir" : " is-file");
      if (
        openFilePath &&
        openFilePath.length === path.length + 1 &&
        openFilePath[openFilePath.length - 1] === node.name &&
        node.type === "file"
      ) {
        btn.classList.add("is-active");
      }
      btn.innerHTML = `<span class="ico" aria-hidden="true">${
        node.type === "dir" ? "▦" : "▤"
      }</span><span class="nm">${escapeHtml(node.name)}</span>`;
      btn.addEventListener("click", () => {
        if (node.type === "dir") {
          maybeLeaveEditor(() => {
            path = path.concat(node.name);
            closeEditor();
            render();
          });
        } else {
          maybeLeaveEditor(() => openFile(path.concat(node.name)));
        }
      });
      btn.addEventListener("dblclick", () => {
        if (node.type === "dir") btn.click();
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    renderCrumbs();
    renderList();
  }

  function openFile(parts) {
    const file = fileAt(parts);
    if (!file) return;
    openFilePath = parts.slice();
    editorEmpty.hidden = true;
    editor.hidden = false;
    editorName.textContent = parts.join("/") || file.name;
    textarea.value = file.content || "";
    setDirty(false);
    renderList();
    textarea.focus();
  }

  function closeEditor() {
    openFilePath = null;
    editor.hidden = true;
    editorEmpty.hidden = false;
    textarea.value = "";
    setDirty(false);
  }

  function setDirty(v) {
    dirty = v;
    saveBtn.disabled = !v;
    saveBtn.textContent = v ? "Save" : "Saved";
  }

  function maybeLeaveEditor(next) {
    if (dirty && openFilePath) {
      const ok = confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    next();
  }

  function saveOpenFile() {
    if (!openFilePath) return;
    const file = fileAt(openFilePath);
    if (!file) return;
    let content = textarea.value;
    if (content.length > MAX_FILE_CHARS) {
      alert(`File truncated to ${MAX_FILE_CHARS} characters (v0 localStorage limit).`);
      content = content.slice(0, MAX_FILE_CHARS);
      textarea.value = content;
    }
    file.content = content;
    file.updatedAt = now();
    if (persist()) setDirty(false);
  }

  function nameExists(dir, name, skip) {
    return dir.children.some(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c !== skip
    );
  }

  function askName(title, label, initial) {
    return new Promise((resolve) => {
      promptResolve = resolve;
      promptTitle.textContent = title;
      promptLabel.textContent = label;
      promptInput.value = initial || "";
      promptModal.hidden = false;
      promptInput.focus();
      promptInput.select();
    });
  }

  function closePrompt(value) {
    promptModal.hidden = true;
    const r = promptResolve;
    promptResolve = null;
    if (r) r(value);
  }

  promptForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = sanitizeName(promptInput.value);
    if (!name) return;
    closePrompt(name);
  });
  document.getElementById("files-prompt-cancel").addEventListener("click", () => {
    closePrompt(null);
  });

  document.getElementById("files-new-folder").addEventListener("click", async () => {
    const name = await askName("New folder", "Folder name", "Folder");
    if (!name) return;
    const dir = currentDir();
    if (nameExists(dir, name)) {
      alert("That name already exists here.");
      return;
    }
    dir.children.push({ type: "dir", name, children: [] });
    dir.children = sanitizeTree(dir).children;
    persist();
    render();
  });

  document.getElementById("files-new-file").addEventListener("click", async () => {
    const name = await askName("New file", "File name", "untitled.txt");
    if (!name) return;
    const dir = currentDir();
    if (nameExists(dir, name)) {
      alert("That name already exists here.");
      return;
    }
    dir.children.push({
      type: "file",
      name,
      content: "",
      updatedAt: now(),
    });
    dir.children = sanitizeTree(dir).children;
    persist();
    openFile(path.concat(name));
    render();
  });

  document.getElementById("files-rename").addEventListener("click", async () => {
    if (!openFilePath) return;
    const file = fileAt(openFilePath);
    if (!file) return;
    const name = await askName("Rename", "New name", file.name);
    if (!name) return;
    const dir = dirAt(openFilePath.slice(0, -1));
    if (nameExists(dir, name, file)) {
      alert("That name already exists here.");
      return;
    }
    file.name = name;
    dir.children = sanitizeTree(dir).children;
    openFilePath = path.concat(name);
    persist();
    editorName.textContent = openFilePath.join("/");
    render();
  });

  document.getElementById("files-delete").addEventListener("click", () => {
    if (!openFilePath) return;
    const name = openFilePath[openFilePath.length - 1];
    if (!confirm(`Delete “${name}”?`)) return;
    const dir = dirAt(openFilePath.slice(0, -1));
    dir.children = dir.children.filter(
      (c) => !(c.type === "file" && c.name === name)
    );
    persist();
    closeEditor();
    render();
  });

  // Context: delete/rename folders via list — add long-press alternative: right-click menu simple
  listEl.addEventListener("contextmenu", (e) => {
    const item = e.target.closest(".files-item");
    if (!item) return;
    e.preventDefault();
    const nm = item.querySelector(".nm")?.textContent;
    if (!nm) return;
    const dir = currentDir();
    const node = dir.children.find((c) => c.name === nm);
    if (!node) return;
    const action = prompt(
      `“${nm}” — type rename or delete`,
      "rename"
    );
    if (!action) return;
    if (action.toLowerCase() === "delete") {
      if (!confirm(`Delete “${nm}”${node.type === "dir" ? " and its contents" : ""}?`))
        return;
      if (openFilePath && openFilePath.join("/").startsWith([...path, nm].join("/"))) {
        closeEditor();
      }
      dir.children = dir.children.filter((c) => c.name !== nm);
      persist();
      render();
      return;
    }
    if (action.toLowerCase() === "rename") {
      askName("Rename", "New name", nm).then((newName) => {
        if (!newName) return;
        if (nameExists(dir, newName, node)) {
          alert("That name already exists here.");
          return;
        }
        if (openFilePath && openFilePath[openFilePath.length - 1] === nm) {
          openFilePath[openFilePath.length - 1] = newName;
          editorName.textContent = openFilePath.join("/");
        }
        node.name = newName;
        dir.children = sanitizeTree(dir).children;
        persist();
        render();
      });
    }
  });

  document.getElementById("files-save").addEventListener("click", saveOpenFile);
  textarea.addEventListener("input", () => setDirty(true));

  document.getElementById("files-download").addEventListener("click", () => {
    if (!openFilePath) return;
    const file = fileAt(openFilePath);
    if (!file) return;
    const blob = new Blob([file.content || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById("files-export").addEventListener("click", () => {
    const payload = {
      app: "SIOS Files",
      version: 0,
      schema: "https://github.com/superintelligent-silicon/sios/blob/main/docs/FILES.md",
      exportedAt: now(),
      tree: root,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sios-files-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById("files-import-btn").addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const tree = sanitizeTree(data.tree || data);
      if (tree.type !== "dir") throw new Error("Root must be a directory");
      pendingImport = tree;
      const count = countNodes(tree);
      importMsg.textContent = `Found ${count.dirs} folder(s) and ${count.files} file(s). Merge combines by path; Replace discards the current virtual tree.`;
      importModal.hidden = false;
    } catch (err) {
      alert("Import failed: " + (err && err.message ? err.message : "invalid JSON"));
    }
  });

  function countNodes(node, acc = { dirs: 0, files: 0 }) {
    if (node.type === "file") {
      acc.files++;
      return acc;
    }
    acc.dirs++;
    (node.children || []).forEach((c) => countNodes(c, acc));
    return acc;
  }

  function mergeTrees(base, incoming) {
    const cloned = JSON.parse(JSON.stringify(base));
    function mergeInto(target, src) {
      (src.children || []).forEach((sc) => {
        const existing = target.children.find(
          (t) => t.name.toLowerCase() === sc.name.toLowerCase()
        );
        if (!existing) {
          target.children.push(JSON.parse(JSON.stringify(sc)));
        } else if (sc.type === "dir" && existing.type === "dir") {
          mergeInto(existing, sc);
        } else if (sc.type === "file" && existing.type === "file") {
          existing.content = sc.content;
          existing.updatedAt = sc.updatedAt || now();
        } else {
          // type conflict: keep existing, add with suffix
          let n = sc.name + " (imported)";
          let i = 2;
          while (target.children.some((t) => t.name.toLowerCase() === n.toLowerCase())) {
            n = `${sc.name} (imported ${i++})`;
          }
          const copy = JSON.parse(JSON.stringify(sc));
          copy.name = n;
          target.children.push(copy);
        }
      });
      target.children = sanitizeTree(target).children;
    }
    mergeInto(cloned, incoming);
    return sanitizeTree(cloned);
  }

  document.getElementById("files-import-cancel").addEventListener("click", () => {
    pendingImport = null;
    importModal.hidden = true;
  });
  document.getElementById("files-import-merge").addEventListener("click", () => {
    if (!pendingImport) return;
    root = mergeTrees(root, pendingImport);
    pendingImport = null;
    importModal.hidden = true;
    path = [];
    closeEditor();
    persist();
    render();
  });
  document.getElementById("files-import-replace").addEventListener("click", () => {
    if (!pendingImport) return;
    root = pendingImport;
    pendingImport = null;
    importModal.hidden = true;
    path = [];
    closeEditor();
    persist();
    render();
  });

  function isFilesOpen() {
    return win && !win.hidden;
  }
  function isModalOpen() {
    return (
      (promptModal && !promptModal.hidden) ||
      (importModal && !importModal.hidden)
    );
  }


  /**
   * Write (or overwrite) a text file under folderPath segments from root.
   * Creates intermediate folders. Used by SIOS_BUS files.writeText.
   * @returns {{ ok: boolean, path: string, error?: string }}
   */
  function writeTextFile({ folderPath, fileName, content, openAfter }) {
    try {
      const folders = Array.isArray(folderPath)
        ? folderPath.map((p) => sanitizeName(p)).filter(Boolean)
        : [];
      let name = sanitizeName(fileName);
      if (!name) return { ok: false, path: "", error: "Invalid file name" };
      if (!/\.[a-z0-9]+$/i.test(name)) name += ".txt";

      let dir = root;
      const walked = [];
      for (const seg of folders) {
        let child = dir.children.find((c) => c.type === "dir" && c.name === seg);
        if (!child) {
          child = { type: "dir", name: seg, children: [] };
          dir.children.push(child);
          dir.children = sanitizeTree(dir).children;
          child = dir.children.find((c) => c.type === "dir" && c.name === seg);
        }
        dir = child;
        walked.push(seg);
      }

      let file = dir.children.find((c) => c.type === "file" && c.name === name);
      let text = String(content == null ? "" : content);
      if (text.length > MAX_FILE_CHARS) {
        text = text.slice(0, MAX_FILE_CHARS);
      }
      if (!file) {
        // unique if somehow conflict with dir
        let finalName = name;
        let n = 2;
        while (dir.children.some((c) => c.name.toLowerCase() === finalName.toLowerCase())) {
          const parts = name.split(".");
          if (parts.length > 1) {
            const ext = parts.pop();
            finalName = `${parts.join(".")}-${n++}.${ext}`;
          } else {
            finalName = `${name}-${n++}`;
          }
        }
        name = finalName;
        dir.children.push({
          type: "file",
          name,
          content: text,
          updatedAt: now(),
        });
      } else {
        file.content = text;
        file.updatedAt = now();
      }
      dir.children = sanitizeTree(dir).children;
      if (!persist()) {
        return { ok: false, path: [...walked, name].join("/"), error: "Persist failed" };
      }

      const full = [...walked, name];
      if (openAfter) {
        path = walked.slice();
        openFile(full);
      } else {
        path = walked.slice();
        render();
      }
      return { ok: true, path: full.join("/") };
    } catch (err) {
      return {
        ok: false,
        path: "",
        error: err && err.message ? err.message : "write failed",
      };
    }
  }

  // Receive cross-module writes (explicit publish from other apps)
  if (window.SIOS_BUS) {
    window.SIOS_BUS.subscribe((msg) => {
      if (!msg || msg.type !== window.SIOS_BUS.TYPES.FILES_WRITE_TEXT) return;
      const p = msg.payload || {};
      const result = writeTextFile({
        folderPath: p.folderPath || ["Imports"],
        fileName: p.fileName || "import.txt",
        content: p.content || "",
        openAfter: !!p.openAfter,
      });
      window.SIOS_BUS.publish(
        window.SIOS_BUS.TYPES.FILES_WRITE_RESULT,
        "files",
        { requestFrom: msg.from, ...result }
      );
      if (result.ok && window.SIOS_BUS.toast) {
        window.SIOS_BUS.toast(`Saved to Files · ${result.path}`, "ok");
      } else if (!result.ok && window.SIOS_BUS.toast) {
        window.SIOS_BUS.toast(`Files write failed · ${result.error || "error"}`, "err");
      }
    });
  }

  window.SIOS_FILES = {
    isOpen: isFilesOpen,
    isModalOpen,
    writeTextFile,
    handleKey(e) {

      if (!isFilesOpen()) return false;
      if (isModalOpen()) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (!importModal.hidden) {
            pendingImport = null;
            importModal.hidden = true;
          } else closePrompt(null);
          return true;
        }
        return false;
      }
      if (e.target === textarea) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveOpenFile();
          return true;
        }
        return false;
      }
      if (e.target.matches("input, textarea, select, [contenteditable]")) return false;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveOpenFile();
        return true;
      }
      return false;
    },
  };

  document.addEventListener(
    "keydown",
    (e) => {
      if (window.SIOS_FILES.handleKey(e)) {
        /* handled */
      }
    },
    true
  );

  promptModal.addEventListener("click", (e) => {
    if (e.target === promptModal) closePrompt(null);
  });
  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) {
      pendingImport = null;
      importModal.hidden = true;
    }
  });

  // initial persist if first run
  if (!localStorage.getItem(STORAGE_KEY)) persist();
  else updateQuota(JSON.stringify(root).length);

  render();
})();
