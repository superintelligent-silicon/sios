/*! SIOS Phase 0 shell — UI only. No storage, crypto, or network beyond this page. */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const windows = Array.from(document.querySelectorAll("[data-window]"));
  const dockBtns = Array.from(document.querySelectorAll(".dock-item[data-open]"));
  const clock = document.getElementById("clock");

  function byId(id) {
    return document.querySelector(`[data-window="${id}"]`);
  }

  function setPressed(id, on) {
    dockBtns.forEach((b) => {
      if (b.getAttribute("data-open") === id) {
        b.setAttribute("aria-pressed", on ? "true" : "false");
      }
    });
  }

  function closeWindow(id) {
    const win = byId(id);
    if (!win) return;
    win.hidden = true;
    win.classList.remove("is-open");
    setPressed(id, false);
  }

  function openWindow(id) {
    const win = byId(id);
    if (!win) return;

    // Single focused window for Phase 0 clarity
    windows.forEach((w) => {
      const wid = w.getAttribute("data-window");
      if (wid === id) return;
      w.hidden = true;
      w.classList.remove("is-open");
      setPressed(wid, false);
    });

    win.hidden = false;
    // reflow for animation restart
    if (!reduceMotion) {
      win.classList.remove("is-open");
      void win.offsetWidth;
    }
    win.classList.add("is-open");
    setPressed(id, true);
    win.focus({ preventScroll: true });
  }

  function toggleWindow(id) {
    const win = byId(id);
    if (!win) return;
    if (!win.hidden && win.classList.contains("is-open")) {
      closeWindow(id);
      // restore welcome if nothing open
      const anyOpen = windows.some((w) => !w.hidden);
      if (!anyOpen) openWindow("welcome");
    } else {
      openWindow(id);
    }
  }

  document.addEventListener("click", (e) => {
    const openEl = e.target.closest("[data-open]");
    if (openEl) {
      e.preventDefault();
      const id = openEl.getAttribute("data-open");
      if (openEl.classList.contains("dock-item")) toggleWindow(id);
      else openWindow(id);
      return;
    }
    const closeEl = e.target.closest("[data-close]");
    if (closeEl) {
      e.preventDefault();
      const id = closeEl.getAttribute("data-close");
      closeWindow(id);
      const anyOpen = windows.some((w) => !w.hidden);
      if (!anyOpen) openWindow("welcome");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const open = windows.find((w) => !w.hidden && w.getAttribute("data-window") !== "welcome");
      if (open) {
        closeWindow(open.getAttribute("data-window"));
        openWindow("welcome");
      }
      return;
    }

    // Digit shortcuts 1-4 for dock when not typing in a field
    if (e.target.matches("input, textarea, select, [contenteditable]")) return;
    const map = { "1": "files", "2": "keys", "3": "calc", "4": "calendar" };
    if (map[e.key]) {
      e.preventDefault();
      toggleWindow(map[e.key]);
    }
  });

  function tick() {
    const d = new Date();
    clock.dateTime = d.toISOString();
    clock.textContent = d.toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  tick();
  setInterval(tick, 30_000);

  // Ensure welcome visible on load
  openWindow("welcome");
})();
