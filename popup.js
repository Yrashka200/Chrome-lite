"use strict";

const DEFAULTS = {
  enabled: true,
  killAnimations: true,
  killEffects: true,
  lazyRender: true,
  fastFonts: false,
  hideDecorations: false,
  pauseBackgroundMedia: true,
  throttleTimers: true,
  blockHoverVideos: true,
  autoDiscard: true,
  discardAfterMin: 30,
  protectPinned: true,
  protectAudible: true,
  protectActive: true
};

const CHECKBOXES = [
  "enabled",
  "killAnimations",
  "killEffects",
  "lazyRender",
  "fastFonts",
  "hideDecorations",
  "pauseBackgroundMedia",
  "throttleTimers",
  "blockHoverVideos",
  "autoDiscard",
  "protectPinned",
  "protectAudible"
];

let cfg = { ...DEFAULTS };

function saveDebounced() {
  clearTimeout(saveDebounced._t);
  saveDebounced._t = setTimeout(() => {
    chrome.storage.local.set({ lite: cfg });
  }, 150);
}

function render() {
  for (const key of CHECKBOXES) {
    const el = document.getElementById(key);
    if (el) el.checked = !!cfg[key];
  }
  // Рядки, зависящие от master
  document.querySelectorAll(".row[data-key]").forEach(row => {
    row.classList.toggle("disabled", !cfg.enabled);
  });
  document.querySelector(".master").style.opacity = cfg.enabled ? "1" : "0.6";
}

function updateStat() {
  chrome.tabs.query({}, (tabs) => {
    const total = tabs.length;
    const discarded = tabs.filter(t => t.discarded).length;
    const audible = tabs.filter(t => t.audible).length;
    document.getElementById("stat").innerHTML =
      `Tabs: <b>${total}</b> · Discarded: <b>${discarded}</b> · Audible: <b>${audible}</b>`;
  });
}

chrome.storage.local.get("lite").then(({ lite }) => {
  if (lite) cfg = { ...DEFAULTS, ...lite };
  render();
  updateStat();
});

for (const key of CHECKBOXES) {
  const el = document.getElementById(key);
  if (!el) continue;
  el.addEventListener("change", () => {
    cfg[key] = el.checked;
    saveDebounced();
    render();
  });
}

// Клик по строке — переключает чекбокс
document.querySelectorAll(".row[data-key]").forEach(row => {
  row.addEventListener("click", (e) => {
    if (e.target.tagName === "INPUT") return;
    const key = row.dataset.key;
    const cb = document.getElementById(key);
    if (cb) {
      cb.checked = !cb.checked;
      cfg[key] = cb.checked;
      saveDebounced();
      render();
    }
  });
});