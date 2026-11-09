"use strict";

/* ═══════════════════════════════════════════════════════════
   CHROME LITE — SERVICE WORKER
   - Автоматически discard'ает неактивные вкладки
   - Синхронизирует настройки между вкладками
   ═══════════════════════════════════════════════════════════ */

const DEFAULTS = {
  enabled: true,
  autoDiscard: true,
  discardAfterMin: 30,     // минут неактивности
  protectPinned: true,
  protectAudible: true,
  protectActive: true
};

let cfg = { ...DEFAULTS };
const MAX_TRACKED_CACHE_RESOURCES = 5000;
let cacheResourcesPromise;
let cacheEstimateQueue = Promise.resolve();

// ─── Загрузка настроек ───
chrome.storage.local.get("lite").then(({ lite }) => {
  if (lite) cfg = { ...DEFAULTS, ...lite };
  setupAlarm();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.lite) return;
  cfg = { ...DEFAULTS, ...(changes.lite.newValue || {}) };
  setupAlarm();
});

// ─── Alarm для периодической проверки ───
function setupAlarm() {
  chrome.alarms.clear("lite-sweep");
  if (cfg.enabled && cfg.autoDiscard) {
    // Проверяем раз в 5 минут — этого достаточно
    chrome.alarms.create("lite-sweep", { periodInMinutes: 5 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "lite-sweep") sweepTabs();
});

// ─── Discard неактивных вкладок ───
async function sweepTabs() {
  if (!cfg.enabled || !cfg.autoDiscard) return;

  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const threshold = (cfg.discardAfterMin || 30) * 60 * 1000;

  for (const tab of tabs) {
    if (!tab.id || tab.discarded) continue;

    // Защиты
    if (cfg.protectPinned && tab.pinned) continue;
    if (cfg.protectAudible && tab.audible) continue;
    if (cfg.protectActive && tab.active) continue;
    if (tab.status === "loading") continue;

    // Защита: не трогаем вкладки с формами (эвристика)
    // и chrome:// страницы
    if (tab.url && (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    )) continue;

    // lastAccessed может быть undefined на некоторых платформах
    const lastAccess = tab.lastAccessed || now;
    if (now - lastAccess < threshold) continue;

    try {
      await chrome.tabs.discard(tab.id);
    } catch (e) {
      // Игнорируем — некоторые вкладки нельзя discard'ить
    }
  }
}

// ─── При старте Chrome — сразу применяем настройки ───
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("lite").then(({ lite }) => {
    if (lite) cfg = { ...DEFAULTS, ...lite };
    setupAlarm();
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("lite").then(({ lite }) => {
    if (!lite) {
      // Первый запуск — ставим дефолты
      chrome.storage.local.set({ lite: DEFAULTS });
    } else {
      cfg = { ...DEFAULTS, ...lite };
    }
    setupAlarm();
  });
});

// ─── Навигация: если вкладка стала активной — снимаем pause-флаг ───
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.sendMessage(tabId, { type: "lite-activated" }).catch(() => {});
});

function getCacheResources() {
  if (!cacheResourcesPromise) {
    cacheResourcesPromise = chrome.storage.local.get("liteCacheResources").then(({ liteCacheResources }) => (
      liteCacheResources && typeof liteCacheResources === "object" ? liteCacheResources : {}
    ));
  }
  return cacheResourcesPromise;
}

function recordCacheCandidate(details) {
  if (details.method !== "GET" || details.statusCode !== 200) return;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const headers = details.responseHeaders || [];
  const cacheControl = headers.find(header => header.name.toLowerCase() === "cache-control")?.value || "";
  if (/\bno-store\b/i.test(cacheControl)) return;

  const contentLength = headers.find(header => header.name.toLowerCase() === "content-length")?.value;
  const bytes = Number(contentLength);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return;

  const encodedUrl = new TextEncoder().encode(details.url);
  crypto.subtle.digest("SHA-256", encodedUrl).then(hashBuffer => {
    const hash = Array.from(new Uint8Array(hashBuffer), byte => byte.toString(16).padStart(2, "0")).join("");
    cacheEstimateQueue = cacheEstimateQueue.then(async () => {
      const resources = await getCacheResources();
      if (resources[hash] === bytes || (
        !Object.prototype.hasOwnProperty.call(resources, hash) &&
        Object.keys(resources).length >= MAX_TRACKED_CACHE_RESOURCES
      )) return;

      resources[hash] = bytes;
      const totalBytes = Object.values(resources).reduce((total, size) => total + size, 0);
      await chrome.storage.local.set({
        liteCacheResources: resources,
        liteCacheBytes: totalBytes
      });
    }).catch(error => {
      console.error("Failed to update estimated cache size:", error);
    });
  }).catch(error => {
    console.error("Failed to hash cached resource URL:", error);
  });
}

chrome.webRequest.onCompleted.addListener(
  recordCacheCandidate,
  { urls: ["http://*/*", "https://*/*"] },
  ["responseHeaders"]
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "lite-cache-cleared") return;

  cacheResourcesPromise = Promise.resolve({});
  cacheEstimateQueue = cacheEstimateQueue.then(async () => {
    await chrome.storage.local.set({
      liteCacheResources: {},
      liteCacheBytes: 0
    });
    sendResponse({ success: true });
  }).catch(error => {
    console.error("Failed to reset estimated cache size:", error);
    sendResponse({ success: false });
  });
  return true;
});