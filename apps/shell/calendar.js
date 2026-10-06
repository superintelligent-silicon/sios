/*! SIOS Calendar v0 — local-only. SIOS_STORE + JSON import/export. No network. */
(function () {
  "use strict";

  const STORAGE_KEY = "sios-calendar-events-v0";
  const win = document.querySelector('[data-window="calendar"]');
  if (!win) return;

  const gridEl = document.getElementById("cal-grid");
  const monthLabel = document.getElementById("cal-month-label");
  const dayLabel = document.getElementById("cal-day-label");
  const listEl = document.getElementById("cal-event-list");
  const emptyEl = document.getElementById("cal-empty");
  const modal = document.getElementById("cal-modal");
  const form = document.getElementById("cal-form");
  const titleInput = document.getElementById("cal-title");
  const dateInput = document.getElementById("cal-date");
  const notesInput = document.getElementById("cal-notes");
  const deleteBtn = document.getElementById("cal-delete");
  const importModal = document.getElementById("cal-import-modal");
  const importMsg = document.getElementById("cal-import-msg");
  const fileInput = document.getElementById("cal-import");

  let view = startOfMonth(new Date());
  let selected = isoDate(new Date());
  let events = [];
  let editingId = null;
  let pendingImport = null;

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "e-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function parseISO(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function normalizeEvents(parsed) {
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map((e) => ({
        id: String(e.id || uid()),
        title: String(e.title).slice(0, 120),
        date: e.date,
        notes: e.notes != null ? String(e.notes).slice(0, 2000) : "",
        updatedAt: e.updatedAt || new Date().toISOString(),
      }));
  }

  function loadEvents() {
    try {
      const parsed = window.SIOS_STORE ? window.SIOS_STORE.get(STORAGE_KEY) : null;
      return normalizeEvents(parsed);
    } catch {
      return [];
    }
  }

  function saveEvents() {
    try {
      if (window.SIOS_STORE) {
        window.SIOS_STORE.set(STORAGE_KEY, events).catch(() => {});
      }
    } catch {
      /* private mode / quota */
    }
  }

  function eventsOn(date) {
    return events
      .filter((e) => e.date === date)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  function countsByDate() {
    const map = Object.create(null);
    events.forEach((e) => {
      map[e.date] = (map[e.date] || 0) + 1;
    });
    return map;
  }

  function renderMonth() {
    const y = view.getFullYear();
    const m = view.getMonth();
    monthLabel.textContent = view.toLocaleString(undefined, {
      month: "long",
      year: "numeric",
    });

    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const counts = countsByDate();
    const today = isoDate(new Date());

    gridEl.innerHTML = "";
    for (let i = 0; i < firstDow; i++) {
      const cell = document.createElement("div");
      cell.className = "cal-cell empty";
      cell.setAttribute("aria-hidden", "true");
      gridEl.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-cell";
      btn.setAttribute("role", "gridcell");
      btn.dataset.date = date;
      if (date === today) btn.classList.add("is-today");
      if (date === selected) btn.classList.add("is-selected");
      btn.innerHTML = `<span class="d">${day}</span>`;
      if (counts[date]) {
        btn.classList.add("has-events");
        btn.innerHTML += `<span class="dots" aria-label="${counts[date]} events">${"·".repeat(
          Math.min(counts[date], 3)
        )}</span>`;
      }
      btn.addEventListener("click", () => {
        selected = date;
        renderMonth();
        renderDay();
      });
      gridEl.appendChild(btn);
    }
  }

  function renderDay() {
    const d = parseISO(selected);
    dayLabel.textContent = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const dayEvents = eventsOn(selected);
    listEl.innerHTML = "";
    emptyEl.hidden = dayEvents.length > 0;
    dayEvents.forEach((ev) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cal-event-item";
      btn.innerHTML = `<span class="t">${escapeHtml(ev.title)}</span>${
        ev.notes
          ? `<span class="n">${escapeHtml(ev.notes.slice(0, 80))}${
              ev.notes.length > 80 ? "…" : ""
            }</span>`
          : ""
      }`;
      btn.addEventListener("click", () => openEditor(ev));
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

  function openEditor(ev) {
    editingId = ev ? ev.id : null;
    document.getElementById("cal-modal-title").textContent = ev ? "Edit event" : "New event";
    titleInput.value = ev ? ev.title : "";
    dateInput.value = ev ? ev.date : selected;
    notesInput.value = ev ? ev.notes || "" : "";
    deleteBtn.hidden = !ev;
    modal.hidden = false;
    titleInput.focus();
  }

  function closeEditor() {
    modal.hidden = true;
    editingId = null;
    form.reset();
  }

  function isCalOpen() {
    return win && !win.hidden;
  }

  function isModalOpen() {
    return (modal && !modal.hidden) || (importModal && !importModal.hidden);
  }

  window.SIOS_CALENDAR = {
    isOpen: isCalOpen,
    isModalOpen,
    getEvents: () => events.slice(),
    setEvents(list) {
      events = normalizeEvents(list);
      saveEvents();
      renderMonth();
      renderDay();
    },
    reloadFromStore() {
      events = loadEvents();
      renderMonth();
      renderDay();
    },
    STORAGE_KEY,
    handleKey(e) {
      if (!isCalOpen()) return false;
      if (isModalOpen()) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (!importModal.hidden) {
            pendingImport = null;
            importModal.hidden = true;
          } else closeEditor();
          return true;
        }
        return false; // let inputs work
      }
      if (e.target.matches("input, textarea, select, [contenteditable]")) return false;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
        renderMonth();
        return true;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
        renderMonth();
        return true;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        const now = new Date();
        view = startOfMonth(now);
        selected = isoDate(now);
        renderMonth();
        renderDay();
        return true;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openEditor(null);
        return true;
      }
      // Esc → let shell close (no stopPropagation)
      return false;
    },
  };

  document.getElementById("cal-prev").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    renderMonth();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    renderMonth();
  });
  document.getElementById("cal-today").addEventListener("click", () => {
    const now = new Date();
    view = startOfMonth(now);
    selected = isoDate(now);
    renderMonth();
    renderDay();
  });
  document.getElementById("cal-add").addEventListener("click", () => openEditor(null));
  document.getElementById("cal-cancel").addEventListener("click", closeEditor);
  deleteBtn.addEventListener("click", () => {
    if (!editingId) return;
    events = events.filter((e) => e.id !== editingId);
    saveEvents();
    closeEditor();
    renderMonth();
    renderDay();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const date = dateInput.value;
    const notes = notesInput.value.trim();
    if (!title || !date) return;
    const now = new Date().toISOString();
    if (editingId) {
      events = events.map((ev) =>
        ev.id === editingId
          ? { ...ev, title, date, notes, updatedAt: now }
          : ev
      );
    } else {
      events.push({ id: uid(), title, date, notes, updatedAt: now });
    }
    saveEvents();
    selected = date;
    view = startOfMonth(parseISO(date));
    closeEditor();
    renderMonth();
    renderDay();
  });

  function eventsPayload(list) {
    return {
      app: "SIOS Calendar",
      version: 0,
      schema: "https://github.com/superintelligent-silicon/sios/blob/main/docs/EVENTS.md",
      exportedAt: new Date().toISOString(),
      events: list,
    };
  }

  document.getElementById("cal-export").addEventListener("click", () => {
    const payload = eventsPayload(events);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sios-calendar-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  function saveEventsToFiles(list, fileName) {
    if (!window.SIOS_BUS) {
      alert("Data bus not available.");
      return;
    }
    if (!list.length) {
      alert("No events to save.");
      return;
    }
    window.SIOS_BUS.publish(window.SIOS_BUS.TYPES.FILES_WRITE_TEXT, "calendar", {
      folderPath: ["Imports"],
      fileName,
      content: JSON.stringify(eventsPayload(list), null, 2),
      openAfter: true,
    });
  }

  document.getElementById("cal-to-files-day")?.addEventListener("click", () => {
    const dayEvents = eventsOn(selected);
    saveEventsToFiles(dayEvents, `calendar-${selected}.json`);
  });

  document.getElementById("cal-to-files-all")?.addEventListener("click", () => {
    const stamp = new Date().toISOString().slice(0, 10);
    saveEventsToFiles(events, `calendar-all-${stamp}.json`);
  });

  document.getElementById("cal-import-btn").addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let list = [];
      if (Array.isArray(data)) list = data;
      else if (data && Array.isArray(data.events)) list = data.events;
      else throw new Error("Expected { events: [...] } or an array");

      const normalized = list
        .filter((e) => e && e.title && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)))
        .map((e) => ({
          id: String(e.id || uid()),
          title: String(e.title).slice(0, 120),
          date: String(e.date),
          notes: e.notes != null ? String(e.notes).slice(0, 2000) : "",
          updatedAt: e.updatedAt || new Date().toISOString(),
        }));

      if (!normalized.length) throw new Error("No valid events found");

      pendingImport = normalized;
      importMsg.textContent = `Found ${normalized.length} event${
        normalized.length === 1 ? "" : "s"
      }. Merge keeps yours and adds/updates by id; Replace discards current events.`;
      importModal.hidden = false;
    } catch (err) {
      alert("Import failed: " + (err && err.message ? err.message : "invalid JSON"));
    }
  });

  document.getElementById("cal-import-cancel").addEventListener("click", () => {
    pendingImport = null;
    importModal.hidden = true;
  });

  document.getElementById("cal-import-merge").addEventListener("click", () => {
    if (!pendingImport) return;
    const byId = Object.create(null);
    events.forEach((e) => {
      byId[e.id] = e;
    });
    pendingImport.forEach((e) => {
      byId[e.id] = e;
    });
    events = Object.values(byId);
    saveEvents();
    pendingImport = null;
    importModal.hidden = true;
    renderMonth();
    renderDay();
  });

  document.getElementById("cal-import-replace").addEventListener("click", () => {
    if (!pendingImport) return;
    events = pendingImport.slice();
    saveEvents();
    pendingImport = null;
    importModal.hidden = true;
    renderMonth();
    renderDay();
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (window.SIOS_CALENDAR.handleKey(e)) {
        /* handled */
      }
    },
    true
  );

  // Close modal on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeEditor();
  });
  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) {
      pendingImport = null;
      importModal.hidden = true;
    }
  });

  async function bootCalendar() {
    if (window.SIOS_STORE && window.SIOS_STORE.ready) await window.SIOS_STORE.ready;
    events = loadEvents();
    renderMonth();
    renderDay();
  }
  bootCalendar();
})();
