/*! SIOS data bus v0 — local-only pub/sub. Explicit user actions. No network. */
(function () {
  "use strict";

  const EVENT = "sios:bus";

  const TYPES = Object.freeze({
    FILES_WRITE_TEXT: "files.writeText",
    FILES_WRITE_RESULT: "files.writeText.result",
    // Soft hooks reserved for later (Open in…):
    FILES_OPEN_REQUEST: "files.openRequest",
  });

  /**
   * @param {string} type
   * @param {string} from module id e.g. "calendar" | "calc" | "files"
   * @param {object} payload
   */
  function publish(type, from, payload) {
    const detail = {
      type,
      from: String(from || "unknown"),
      payload: payload == null ? {} : payload,
      ts: Date.now(),
    };
    window.dispatchEvent(new CustomEvent(EVENT, { detail }));
    return detail;
  }

  /**
   * @param {(msg: {type:string,from:string,payload:any,ts:number}) => void} handler
   * @returns {() => void} unsubscribe
   */
  function subscribe(handler) {
    const listener = (e) => {
      if (e && e.detail) handler(e.detail);
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }

  function toast(message, kind) {
    let el = document.getElementById("sios-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sios-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.dataset.kind = kind || "info";
    el.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-on"), 3200);
  }

  window.SIOS_BUS = {
    TYPES,
    publish,
    subscribe,
    toast,
    version: 0,
  };
})();
