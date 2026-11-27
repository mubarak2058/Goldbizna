/* MABROUK TRADER'S lightweight health watchdog.
   Observes responsiveness and supported JS heap metrics; never auto-resets or deletes data. */
(() => {
  if (window.__mabroukWatchdogStarted) return;
  window.__mabroukWatchdogStarted = true;
  const RECOVERY = "emergency-recovery.html";
  let errorCount = 0, longTaskMs = 0, lastBeat = performance.now(), lagStrikes = 0;
  let lastSignal = 0, panel, liteStyle;
  const makePanel = () => {
    if (panel || !document.body) return;
    panel = document.createElement("aside");
    panel.id = "mabrouk-health-watchdog";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = '<div class="mhw-head"><b>System health alert</b><button type="button" aria-label="Dismiss alert">×</button></div><p></p><div class="mhw-actions"><button type="button" data-mhw-lite>Enable Lite Mode</button><button type="button" data-mhw-normal style="display:none">Normal Mode</button><a href="emergency-recovery.html">Recovery Centre</a><button type="button" data-mhw-reload>Safe reload</button></div>';
    const style = document.createElement("style");
    style.textContent = '#mabrouk-health-watchdog{position:fixed;z-index:2147483000;left:12px;right:12px;bottom:12px;max-width:520px;margin:auto;padding:15px;background:#fff8e8;color:#321e0c;border:2px solid #c58a22;border-radius:14px;box-shadow:0 8px 35px #0005;font:14px system-ui;display:none}#mabrouk-health-watchdog p{margin:8px 0 12px;line-height:1.5}#mabrouk-health-watchdog .mhw-head,#mabrouk-health-watchdog .mhw-actions{display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap}#mabrouk-health-watchdog button,#mabrouk-health-watchdog a{border:0;border-radius:8px;padding:10px 13px;background:#a90025;color:white;font-weight:800;text-decoration:none;cursor:pointer}#mabrouk-health-watchdog .mhw-head>button{padding:2px 9px;background:#eee;color:#321e0c;font-size:20px}';
    document.head.append(style);
    document.body.append(panel);
    panel.querySelector(".mhw-head button").addEventListener("click", () => { panel.style.display = "none"; });
    panel.querySelector("[data-mhw-reload]").addEventListener("click", () => {
      panel.querySelector("[data-mhw-reload]").disabled = true;
      panel.querySelector("p").textContent = "Reloading this page. Your cloud records are not being reset.";
      location.reload();
    });
  };
  const setLiteMode = enabled => {
    if (!document.documentElement) return;
    document.documentElement.classList.toggle("mabrouk-lite-mode", enabled);
    try { sessionStorage.setItem("mabrouk_lite_mode", enabled ? "on" : "off"); } catch (_) {}
    if (!liteStyle) {
      liteStyle = document.createElement("style");
      liteStyle.id = "mabrouk-lite-mode-style";
      liteStyle.textContent = 'html.mabrouk-lite-mode *,html.mabrouk-lite-mode *::before,html.mabrouk-lite-mode *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;backdrop-filter:none!important;filter:none!important;box-shadow:none!important}html.mabrouk-lite-mode{content-visibility:auto}';
      document.head.append(liteStyle);
    }
    if (panel) {
      panel.querySelector("[data-mhw-lite]").style.display = enabled ? "none" : "inline-block";
      panel.querySelector("[data-mhw-normal]").style.display = enabled ? "inline-block" : "none";
      panel.querySelector("p").textContent = enabled
        ? "Lite Mode is on. Visual effects are reduced; sales, inventory, Firebase sync and payment features are left enabled."
        : "Lite Mode is off. Normal visual effects are restored.";
      panel.style.display = "block";
    }
  };
  const alertUser = message => {
    if (Date.now() - lastSignal < 20000) return;
    lastSignal = Date.now();
    makePanel();
    if (!panel) return;
    panel.querySelector("p").textContent = message;
    panel.style.display = "block";
  };
  const onReady = () => makePanel();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady, {once:true});
  else onReady();

  window.addEventListener("error", () => {
    errorCount++;
    if (errorCount >= 3) alertUser("Several page errors were detected. Save any unfinished work if possible, then open the Recovery Centre. Your stored Firebase records are not changed by this alert.");
  });
  window.addEventListener("unhandledrejection", () => {
    errorCount++;
    if (errorCount >= 3) alertUser("Repeated background errors were detected. Check the connection and use the Recovery Centre if the page is not responding.");
  });

  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) longTaskMs += entry.duration || 0;
        if (longTaskMs > 5000) { setLiteMode(true); alertUser("Heavy scripts are slowing this page. Lite Mode has reduced visual effects; close other heavy tabs/apps if it remains slow."); }
      });
      observer.observe({type:"longtask", buffered:true});
    } catch (_) {}
  }

  setInterval(() => {
    const now = performance.now();
    const drift = now - lastBeat - 5000;
    lastBeat = now;
    if (drift > 3000) lagStrikes++; else lagStrikes = Math.max(0, lagStrikes - 1);
    if (lagStrikes >= 2) {
      alertUser("The page stopped responding briefly more than once. Your device may be overloaded. Close unused tabs/apps, then try Recovery Centre or a safe reload.");
      lagStrikes = 0;
    }
    const memory = performance.memory;
    if (memory && memory.jsHeapSizeLimit > 0 && memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.88) {
      alertUser("The browser reports high JavaScript memory use. Close unused tabs, then reopen this page if it remains slow. No business data has been cleared.");
    }
  }, 5000);

  window.addEventListener("online", () => {
    makePanel();
    if (panel && panel.style.display !== "none") panel.querySelector("p").textContent = "Internet connection restored. Refresh the page if cloud data does not resume.";
  });
  window.addEventListener("offline", () => alertUser("This device is offline. POS cloud sync may pause. Reconnect before retrying cloud operations."));
})();