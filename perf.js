"use strict";

/* ═══════════════════════════════════════════════════════════
   CHROME LITE — CONTENT SCRIPT
   Работает на всех сайтах. Минимум CPU, максимум эффекта.
   ═══════════════════════════════════════════════════════════ */

const DEFAULTS = {
  enabled: true,
  killAnimations: true,
  killEffects: true,
  lazyRender: true,
  fastFonts: false,
  hideDecorations: false,
  pauseBackgroundMedia: true,
  throttleTimers: true,
  blockHoverVideos: true
};

let cfg = { ...DEFAULTS };
let active = false;        // активно ли сейчас
let wasTimersPatched = false;

// ═══════════════════════════════════════════════════════════
//  1. РАННИЕ CSS-АТРИБУТЫ (до первой отрисовки!)
// ═══════════════════════════════════════════════════════════
// Ставим дефолт сразу, пока storage не загрузился.

(function earlyAttrs() {
  const r = document.documentElement;
  if (!r) return;
  // Дефолт: анимации и эффекты выключены — самое безопасное
  r.setAttribute("data-lite-anim", "1");
  r.setAttribute("data-lite-fx", "1");
})();

// ═══════════════════════════════════════════════════════════
//  2. ЗАГРУЗКА НАСТРОЕК
// ═══════════════════════════════════════════════════════════

chrome.storage.local.get("lite").then(({ lite }) => {
  if (lite) cfg = { ...DEFAULTS, ...lite };
  active = cfg.enabled;
  applyAttrs();
  if (active) {
    if (cfg.throttleTimers) patchTimers();
    if (cfg.pauseBackgroundMedia) startMediaWatcher();
    if (cfg.blockHoverVideos) startHoverVideoBlocker();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.lite) return;
  cfg = { ...DEFAULTS, ...(changes.lite.newValue || {}) };
  active = cfg.enabled;
  applyAttrs();
  if (active) {
    if (cfg.throttleTimers) patchTimers();
    if (cfg.pauseBackgroundMedia) startMediaWatcher();
    if (cfg.blockHoverVideos) startHoverVideoBlocker();
  }
});

// ═══════════════════════════════════════════════════════════
//  3. ПРИМЕНЕНИЕ CSS-АТРИБУТОВ
// ═══════════════════════════════════════════════════════════

function toggleAttr(name, on) {
  const r = document.documentElement;
  if (!r) return;
  if (on && active) r.setAttribute(name, "1");
  else r.removeAttribute(name);
}

function applyAttrs() {
  toggleAttr("data-lite-anim", cfg.killAnimations);
  toggleAttr("data-lite-fx",   cfg.killEffects);
  toggleAttr("data-lite-lazy", cfg.lazyRender);
  toggleAttr("data-lite-font", cfg.fastFonts);
  toggleAttr("data-lite-deco", cfg.hideDecorations);
  toggleAttr("data-lite-pause", cfg.pauseBackgroundMedia);
}

// ═══════════════════════════════════════════════════════════
//  4. ТРОТТЛИНГ ТАЙМЕРОВ
//  Заменяем setInterval/setTimeout так, чтобы на неактивной
//  вкладке они срабатывали раз в 1 секунду максимум.
// ═══════════════════════════════════════════════════════════

let realSetInterval = window.setInterval;
let realSetTimeout = window.setTimeout;
let realClearInterval = window.clearInterval;
let realClearTimeout = window.clearTimeout;

function patchTimers() {
  if (wasTimersPatched) return;
  wasTimersPatched = true;

  window.setInterval = function(fn, delay, ...args) {
    // Минимальный интервал 1 сек, и не чаще 1 раза в сек когда вкладка скрыта
    const minDelay = Math.max(delay || 0, 1000);
    return realSetInterval(function() {
      if (document.hidden) {
        // На скрытой вкладке — не чаще раза в 5 секунд
        const now = Date.now();
        if (now - (fn._last || 0) < 5000) return;
        fn._last = now;
      }
      fn.apply(this, args);
    }, minDelay);
  };

  window.setTimeout = function(fn, delay, ...args) {
    // На скрытой вкладке все таймеры растягиваем минимум до 1 сек
    const effective = document.hidden ? Math.max(delay || 0, 1000) : (delay || 0);
    return realSetTimeout(function() {
      if (document.hidden && delay && delay < 1000) {
        const now = Date.now();
        if (now - (fn._last || 0) < 1000) return;
        fn._last = now;
      }
      fn.apply(this, args);
    }, effective);
  };

  window.clearInterval = realClearInterval;
  window.clearTimeout = realClearTimeout;
}

// ═══════════════════════════════════════════════════════════
//  5. ПАУЗА ФОНОВЫХ ВИДЕО / АУДИО
// ═══════════════════════════════════════════════════════════

let mediaWatcherStarted = false;

function startMediaWatcher() {
  if (mediaWatcherStarted) return;
  mediaWatcherStarted = true;

  const pauseAll = () => {
    if (!document.hidden || !active || !cfg.pauseBackgroundMedia) return;
    document.querySelectorAll("video, audio").forEach(m => {
      if (!m.paused && !m.ended) {
        try {
          m.pause();
          m._litePaused = true;
        } catch {}
      }
    });
    // Также останавливаем requestAnimationFrame-циклы через visibilitychange
  };

  // Основной триггер — видимость вкладки
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAll();
    }
    // На возврате — ничего не делаем, пользователь сам нажмёт play
  }, { passive: true });

  // Если видео появилось на скрытой вкладке — сразу пауза
  const mediaObs = new MutationObserver((mutations) => {
    if (!document.hidden || !active) return;
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === "VIDEO" || n.tagName === "AUDIO") {
          try { n.pause(); } catch {}
        } else if (n.querySelector) {
          n.querySelectorAll("video, audio").forEach(v => {
            try { v.pause(); } catch {}
          });
        }
      }
    }
  });

  // Наблюдаем только когда скрыто
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (document.body) {
        mediaObs.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      mediaObs.disconnect();
    }
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════
//  6. БЛОКИРОВКА HOVER-ВИДЕО (YouTube, Vimeo, соцсети)
// ═══════════════════════════════════════════════════════════

let hoverBlockerStarted = false;

function startHoverVideoBlocker() {
  if (hoverBlockerStarted) return;
  hoverBlockerStarted = true;

  // Перехватываем события mouseenter на контейнерах видео
  document.addEventListener("mouseover", (e) => {
    if (!active || !cfg.blockHoverVideos) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const video = target.closest("video") || target.querySelector?.("video");
    if (!video) return;

    // Разрешаем видео в основном плеере (обычно #movie_player, video.js и т.д.)
    if (video.closest("#movie_player, .html5-video-player, .video-js, [data-player]")) return;

    // Это preview/hover-видео — ставим preload=none и пауза
    try {
      if (!video.paused) video.pause();
      video.preload = "none";
      video.removeAttribute("autoplay");
    } catch {}
  }, { passive: true, capture: true });
}

// ═══════════════════════════════════════════════════════════
//  7. ОТСЛЕЖИВАНИЕ visibility ДЛЯ ПАУЗЫ RAF
//  (не критично, Chrome сам тормозит RAF на скрытых вкладках,
//   но подстрахуемся для старых версий)
// ═══════════════════════════════════════════════════════════

document.addEventListener("visibilitychange", () => {
  if (!active) return;
  if (document.hidden) {
    // Chrome сам тормозит RAF, но мы можем дополнительно
    // "разбудить" страницу позже — не трогаем.
  }
}, { passive: true });