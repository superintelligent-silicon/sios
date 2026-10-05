/*! SIOS Calc v0 — local-only. No network. localStorage history + JSON export. */
(function () {
  "use strict";

  const STORAGE_KEY = "sios-calc-history-v0";
  const MAX_HISTORY = 50;

  const exprEl = document.getElementById("calc-expr");
  const valueEl = document.getElementById("calc-value");
  const listEl = document.getElementById("calc-history-list");
  const emptyEl = document.getElementById("calc-history-empty");
  const calcWin = document.querySelector('[data-window="calc"]');

  if (!exprEl || !valueEl || !listEl || !calcWin) return;

  let display = "0";
  let stored = null;
  let pendingOp = null;
  let fresh = true; // next digit replaces display
  let history = loadHistory();

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
    } catch {
      return [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      /* quota / private mode — keep in-memory */
    }
  }

  function formatNum(n) {
    if (!Number.isFinite(n)) return "Error";
    const s = String(n);
    if (s.length > 14) {
      return n.toPrecision(10).replace(/\.?0+e/, "e");
    }
    return s;
  }

  function render() {
    valueEl.textContent = display;
    if (pendingOp != null && stored != null) {
      exprEl.textContent = `${formatNum(stored)} ${pendingOp}`;
    } else {
      exprEl.textContent = "";
    }
  }

  function renderHistory() {
    listEl.innerHTML = "";
    emptyEl.hidden = history.length > 0;
    history.forEach((item, idx) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calc-history-item";
      btn.innerHTML = `<span class="h-expr">${escapeHtml(item.expression)}</span><span class="h-res">${escapeHtml(item.result)}</span>`;
      btn.title = "Use result";
      btn.addEventListener("click", () => {
        display = item.result === "Error" ? "0" : item.result;
        stored = null;
        pendingOp = null;
        fresh = true;
        render();
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

  function applyOp(a, op, b) {
    switch (op) {
      case "+":
        return a + b;
      case "−":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        return b === 0 ? NaN : a / b;
      default:
        return b;
    }
  }

  function inputDigit(d) {
    if (fresh || display === "0" || display === "Error") {
      display = d;
      fresh = false;
    } else if (display.length < 16) {
      display += d;
    }
    render();
  }

  function inputDot() {
    if (fresh || display === "Error") {
      display = "0.";
      fresh = false;
    } else if (!display.includes(".")) {
      display += ".";
    }
    render();
  }

  function setOp(op) {
    const current = parseFloat(display);
    if (pendingOp && stored != null && !fresh) {
      const result = applyOp(stored, pendingOp, current);
      display = formatNum(result);
      stored = Number.isFinite(result) ? result : null;
      if (!Number.isFinite(result)) {
        pendingOp = null;
        fresh = true;
        render();
        return;
      }
    } else {
      stored = Number.isFinite(current) ? current : 0;
    }
    pendingOp = op;
    fresh = true;
    render();
  }

  function equals() {
    if (pendingOp == null || stored == null) return;
    const current = parseFloat(display);
    const a = stored;
    const op = pendingOp;
    const result = applyOp(a, op, current);
    const resultStr = formatNum(result);
    const expression = `${formatNum(a)} ${op} ${formatNum(current)}`;
    pushHistory(expression, resultStr);
    display = resultStr;
    stored = null;
    pendingOp = null;
    fresh = true;
    render();
  }

  function pushHistory(expression, result) {
    history.unshift({
      expression,
      result,
      at: new Date().toISOString(),
    });
    history = history.slice(0, MAX_HISTORY);
    saveHistory();
    renderHistory();
  }

  function clearAll() {
    display = "0";
    stored = null;
    pendingOp = null;
    fresh = true;
    render();
  }

  function toggleSign() {
    if (display === "Error" || display === "0") return;
    if (display.startsWith("-")) display = display.slice(1);
    else display = "-" + display;
    fresh = false;
    render();
  }

  function percent() {
    const n = parseFloat(display);
    if (!Number.isFinite(n)) return;
    display = formatNum(n / 100);
    fresh = true;
    render();
  }

  function isCalcOpen() {
    return calcWin && !calcWin.hidden;
  }

  // Expose for shell.js digit-shortcut guard
  window.SIOS_CALC = {
    isOpen: isCalcOpen,
    handleKey(e) {
      if (!isCalcOpen()) return false;
      if (e.target.matches("input, textarea, select, [contenteditable]")) return false;

      const k = e.key;
      if (k >= "0" && k <= "9") {
        e.preventDefault();
        inputDigit(k);
        return true;
      }
      if (k === ".") {
        e.preventDefault();
        inputDot();
        return true;
      }
      if (k === "+" || k === "-") {
        e.preventDefault();
        setOp(k === "+" ? "+" : "−");
        return true;
      }
      if (k === "*" || k === "x" || k === "X") {
        e.preventDefault();
        setOp("×");
        return true;
      }
      if (k === "/") {
        e.preventDefault();
        setOp("÷");
        return true;
      }
      if (k === "Enter" || k === "=") {
        e.preventDefault();
        equals();
        return true;
      }
      if (k === "Escape") {
        // Let shell close window on Esc; clear if already welcome-only — shell handles close
        // If display dirty, clear first once
        if (display !== "0" || pendingOp) {
          e.preventDefault();
          e.stopPropagation();
          clearAll();
          return true;
        }
        return false;
      }
      if (k === "Backspace") {
        e.preventDefault();
        if (!fresh && display.length > 1) {
          display = display.slice(0, -1);
        } else {
          display = "0";
          fresh = true;
        }
        render();
        return true;
      }
      if (k === "%") {
        e.preventDefault();
        percent();
        return true;
      }
      return false;
    },
  };

  document.querySelector(".calc-pad")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-calc]");
    if (!btn) return;
    const action = btn.getAttribute("data-calc");
    if (action === "digit") inputDigit(btn.getAttribute("data-digit"));
    else if (action === "dot") inputDot();
    else if (action === "op") setOp(btn.getAttribute("data-op"));
    else if (action === "eq") equals();
    else if (action === "clear") clearAll();
    else if (action === "sign") toggleSign();
    else if (action === "percent") percent();
  });

  function historyPayload() {
    return {
      app: "SIOS Calc",
      version: 0,
      exportedAt: new Date().toISOString(),
      history,
    };
  }

  document.getElementById("calc-export")?.addEventListener("click", () => {
    const payload = historyPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sios-calc-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById("calc-to-files")?.addEventListener("click", () => {
    if (!window.SIOS_BUS) {
      alert("Data bus not available.");
      return;
    }
    if (!history.length) {
      alert("No history to save yet.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    window.SIOS_BUS.publish(window.SIOS_BUS.TYPES.FILES_WRITE_TEXT, "calc", {
      folderPath: ["Imports"],
      fileName: `calc-history-${stamp}.json`,
      content: JSON.stringify(historyPayload(), null, 2),
      openAfter: true,
    });
  });

  document.getElementById("calc-clear-history")?.addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  document.addEventListener(
    "keydown",
    (e) => {
      if (window.SIOS_CALC.handleKey(e)) {
        /* handled */
      }
    },
    true
  );

  render();
  renderHistory();
})();
