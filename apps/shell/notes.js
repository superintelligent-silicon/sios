/*! SIOS Notes v0 — .md files under Files/Notes. Plain-text only (no HTML render). */
(function () {
  "use strict";

  const win = document.querySelector('[data-window="notes"]');
  if (!win) return;

  const listEl = document.getElementById("notes-list");
  const emptyEl = document.getElementById("notes-empty");
  const searchEl = document.getElementById("notes-search");
  const editorEmpty = document.getElementById("notes-editor-empty");
  const editor = document.getElementById("notes-editor");
  const titleEl = document.getElementById("notes-title");
  const metaEl = document.getElementById("notes-meta");
  const textarea = document.getElementById("notes-textarea");
  const saveBtn = document.getElementById("notes-save");
  const openFilesBtn = document.getElementById("notes-open-files");

  let notes = [];
  let openPath = null; // string[]
  let dirty = false;
  let filter = "";

  function now() {
    return new Date().toISOString();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseFrontMatter(content) {
    const text = String(content || "");
    if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
      return { meta: {}, body: text };
    }
    const end = text.indexOf("\n---", 4);
    if (end < 0) return { meta: {}, body: text };
    const fm = text.slice(4, end).trim();
    let body = text.slice(end + 4);
    if (body.startsWith("\n")) body = body.slice(1);
    const meta = {};
    fm.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!m) return;
      let v = m[2].trim();
      if ((v.startsWith("[") && v.endsWith("]")) || (v.startsWith('"') && v.endsWith('"'))) {
        try {
          meta[m[1]] = JSON.parse(v.replace(/'/g, '"'));
          return;
        } catch {
          /* keep string */
        }
      }
      meta[m[1]] = v;
    });
    return { meta, body };
  }

  function buildFrontMatter(meta, body) {
    const title = meta.title || "Untitled";
    const created = meta.created || now();
    const updated = meta.updated || now();
    let tags = meta.tags;
    if (!Array.isArray(tags)) tags = [];
    return (
      "---\n" +
      "title: " +
      title +
      "\n" +
      "created: " +
      created +
      "\n" +
      "updated: " +
      updated +
      "\n" +
      "tags: " +
      JSON.stringify(tags) +
      "\n" +
      "---\n\n" +
      (body || "")
    );
  }

  function displayTitle(note) {
    const { meta, body } = parseFrontMatter(note.content);
    if (meta.title) return String(meta.title);
    const first = (body || "").trim().split(/\r?\n/)[0] || "";
    if (first) return first.replace(/^#+\s*/, "").slice(0, 60);
    return note.name.replace(/\.md$/i, "");
  }

  function refreshNotes() {
    if (!window.SIOS_FILES || !window.SIOS_FILES.listMarkdownNotes) {
      notes = [];
      return;
    }
    notes = window.SIOS_FILES.listMarkdownNotes();
  }

  function setDirty(v) {
    dirty = v;
    saveBtn.disabled = !v;
    saveBtn.textContent = v ? "Save" : "Saved";
  }

  function renderList() {
    refreshNotes();
    listEl.innerHTML = "";
    const q = filter.trim().toLowerCase();
    const shown = notes.filter((n) => {
      if (!q) return true;
      const title = displayTitle(n).toLowerCase();
      return title.includes(q) || n.name.toLowerCase().includes(q);
    });
    emptyEl.hidden = shown.length > 0;
    shown.forEach((n) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "notes-item";
      const pathKey = n.path.join("/");
      if (openPath && openPath.join("/") === pathKey) btn.classList.add("is-active");
      const title = displayTitle(n);
      btn.innerHTML =
        `<span class="nm">${escapeHtml(title)}</span>` +
        `<span class="path">${escapeHtml(n.path.join("/"))}</span>`;
      btn.addEventListener("click", () => {
        maybeLeave(() => openNote(n.path));
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function openNote(parts) {
    if (!window.SIOS_FILES || !window.SIOS_FILES.fileAt) return;
    const file = window.SIOS_FILES.fileAt(parts);
    if (!file) return;
    openPath = parts.slice();
    const { meta, body } = parseFrontMatter(file.content || "");
    editorEmpty.hidden = true;
    editor.hidden = false;
    titleEl.value = meta.title || file.name.replace(/\.md$/i, "");
    metaEl.textContent =
      (parts.join("/") || file.name) +
      (meta.updated ? " · updated " + String(meta.updated).slice(0, 19).replace("T", " ") : "");
    textarea.value = body;
    setDirty(false);
    renderList();
    textarea.focus();
  }

  function closeEditor() {
    openPath = null;
    editor.hidden = true;
    editorEmpty.hidden = false;
    titleEl.value = "";
    textarea.value = "";
    metaEl.textContent = "";
    setDirty(false);
  }

  function maybeLeave(next) {
    if (dirty && openPath) {
      if (!confirm("Discard unsaved changes?")) return;
    }
    next();
  }

  function saveOpen() {
    if (!openPath || !window.SIOS_FILES) return;
    const file = window.SIOS_FILES.fileAt(openPath);
    if (!file) return;
    const prev = parseFrontMatter(file.content || "");
    const meta = Object.assign({}, prev.meta, {
      title: (titleEl.value || "Untitled").trim().slice(0, 120) || "Untitled",
      created: prev.meta.created || now(),
      updated: now(),
      tags: Array.isArray(prev.meta.tags) ? prev.meta.tags : [],
    });
    const content = buildFrontMatter(meta, textarea.value);
    const folderPath = openPath.slice(0, -1);
    const fileName = openPath[openPath.length - 1];
    const result = window.SIOS_FILES.writeTextFile({
      folderPath,
      fileName,
      content,
      openAfter: false,
    });
    if (result && result.ok) {
      setDirty(false);
      metaEl.textContent =
        openPath.join("/") + " · updated " + meta.updated.slice(0, 19).replace("T", " ");
      renderList();
      if (window.SIOS_BUS && window.SIOS_BUS.toast) {
        window.SIOS_BUS.toast("Note saved · " + openPath.join("/"), "ok");
      }
    }
  }

  async function newNote() {
    if (!window.SIOS_FILES) return;
    const ts = now();
    const slug = "note-" + ts.slice(0, 10) + "-" + String(Date.now()).slice(-4);
    const fileName = slug + ".md";
    const content = buildFrontMatter(
      { title: "Untitled", created: ts, updated: ts, tags: [] },
      ""
    );
    const result = window.SIOS_FILES.writeTextFile({
      folderPath: ["Notes"],
      fileName,
      content,
      openAfter: false,
    });
    if (result && result.ok) {
      openNote(["Notes", fileName]);
      renderList();
    }
  }

  document.getElementById("notes-new").addEventListener("click", () => {
    maybeLeave(() => newNote());
  });
  document.getElementById("notes-save").addEventListener("click", saveOpen);
  document.getElementById("notes-delete").addEventListener("click", () => {
    if (!openPath || !window.SIOS_FILES) return;
    const name = openPath[openPath.length - 1];
    if (!confirm("Delete note \u201c" + name + "\u201d?")) return;
    const dir = window.SIOS_FILES.dirAt(openPath.slice(0, -1));
    if (!dir) return;
    dir.children = dir.children.filter(
      (c) => !(c.type === "file" && c.name === name)
    );
    if (window.SIOS_FILES.getTree && window.SIOS_FILES.replaceTree) {
      window.SIOS_FILES.replaceTree(window.SIOS_FILES.getTree(), { notify: false });
    } else if (window.SIOS_FILES.persistAsync) {
      window.SIOS_FILES.persistAsync();
    }
    closeEditor();
    renderList();
  });

  titleEl.addEventListener("input", () => setDirty(true));
  textarea.addEventListener("input", () => setDirty(true));
  searchEl.addEventListener("input", () => {
    filter = searchEl.value || "";
    renderList();
  });

  if (openFilesBtn) {
    openFilesBtn.addEventListener("click", () => {
      const open = document.querySelector('[data-open="files"]');
      if (open) open.click();
    });
  }

  window.SIOS_NOTES = {
    isOpen: () => win && !win.hidden,
    isModalOpen: () => false,
    refresh: renderList,
    handleKey(e) {
      if (!win || win.hidden) return false;
      if (e.target === textarea || e.target === titleEl) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          saveOpen();
          return true;
        }
      }
      return false;
    },
  };

  document.addEventListener(
    "keydown",
    (e) => {
      if (window.SIOS_NOTES.handleKey(e)) {
        /* handled */
      }
    },
    true
  );

  function boot() {
    renderList();
  }

  window.addEventListener("sios:files-ready", boot);
  if (window.SIOS_STORE && window.SIOS_STORE.ready) {
    window.SIOS_STORE.ready.then(() => {
      // Files may still be booting; retry shortly
      setTimeout(boot, 50);
      setTimeout(boot, 300);
    });
  } else {
    boot();
  }
})();
