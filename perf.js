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
  blockHoverVideos: true
};

let cfg = { ...DEFAULTS };
let active = false;      
let wasTimersPatched = false;


(function earlyAttrs() {
  const r = document.documentElement;
  if (!r) return;

  r.setAttribute("data-lite-anim", "1");
  r.setAttribute("data-lite-fx", "1");
})();



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



const realSetInterval = window.setInterval;

function patchTimers() {
  if (wasTimersPatched) return;
  wasTimersPatched = true;

  window.setInterval = function(fn, delay, ...args) {
    if (typeof fn !== "function") {
      return realSetInterval(fn, delay, ...args);
    }

    let lastRun = 0;
    return realSetInterval(function() {
      if (active && cfg.throttleTimers && document.hidden) {
        const now = Date.now();
        if (now - lastRun < 5000) return;
        lastRun = now;
      }
      fn.apply(this, args);
    }, delay, ...args);
  };

}


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

  };


  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAll();
    }

  }, { passive: true });


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



let hoverBlockerStarted = false;

function startHoverVideoBlocker() {
  if (hoverBlockerStarted) return;
  hoverBlockerStarted = true;


  document.addEventListener("mouseover", (e) => {
    if (!active || !cfg.blockHoverVideos) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const video = target.closest("video") || target.querySelector?.("video");
    if (!video) return;

    if (!(video.autoplay || video.hasAttribute("autoplay")) || !video.muted) return;

    // Это preview/hover-видео — ставим preload=none и пауза
    try {
      if (!video.paused) video.pause();
      video.preload = "none";
      video.removeAttribute("autoplay");
    } catch {}
  }, { passive: true, capture: true });
}



document.addEventListener("visibilitychange", () => {
  if (!active) return;
  if (document.hidden) {

  }
}, { passive: true });