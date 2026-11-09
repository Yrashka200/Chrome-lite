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

const clearCacheButton = document.getElementById("clearCache");
const cacheStatus = document.getElementById("cacheStatus");
const cacheEstimate = document.getElementById("cacheEstimate");

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function renderCacheEstimate(bytes) {
  cacheEstimate.textContent = `Estimated cacheable data: ${formatBytes(bytes)}`;
}

chrome.storage.local.get("liteCacheBytes").then(({ liteCacheBytes }) => {
  renderCacheEstimate(Number.isSafeInteger(liteCacheBytes) && liteCacheBytes > 0 ? liteCacheBytes : 0);
}).catch(error => {
  console.error("Failed to read estimated cache size:", error);
  cacheEstimate.textContent = "Estimated cacheable data: unavailable";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.liteCacheBytes) {
    renderCacheEstimate(changes.liteCacheBytes.newValue || 0);
  }
});

clearCacheButton.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Clear Chrome's cached files? Cookies and browsing history will not be deleted."
  );
  if (!confirmed) return;

  clearCacheButton.disabled = true;
  cacheStatus.textContent = "Clearing cache…";

  try {
    await chrome.browsingData.removeCache({ since: 0 });
    const result = await chrome.runtime.sendMessage({ type: "lite-cache-cleared" });
    cacheStatus.textContent = result?.success
      ? "Chrome cache cleared. Estimate reset."
      : "Chrome cache cleared, but the estimate could not be reset.";
  } catch (error) {
    console.error("Failed to clear Chrome cache:", error);
    cacheStatus.textContent = "Could not clear the cache. Please try again.";
  } finally {
    clearCacheButton.disabled = false;
  }
});

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