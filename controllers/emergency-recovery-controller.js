const status = document.getElementById("status");
const say = (message, kind = "") => {
  status.textContent = message;
  status.className = kind;
};
const runButton = (id, action) => {
  const button = document.getElementById(id);
  if (!button) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await action(button); }
    catch (error) { say("Recovery action could not finish: " + (error?.message || "Unknown browser error."), "bad"); }
    finally { button.disabled = false; }
  });
};
runButton("normalReload", async () => {
  say("Reloading the recovery page…");
  location.reload();
});
runButton("repairCache", async button => {
  say("Checking website cache and service workers…");
  let removedCaches = 0;
  let removedWorkers = 0;
  if ("caches" in window) {
    const keys = await caches.keys();
    const results = await Promise.allSettled(keys.map(key => caches.delete(key)));
    removedCaches = results.filter(result => result.status === "fulfilled" && result.value).length;
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const results = await Promise.allSettled(registrations.map(registration => registration.unregister()));
    removedWorkers = results.filter(result => result.status === "fulfilled" && result.value).length;
  }
  say("Website cache repair finished. Cleared " + removedCaches + " cache entries and unregistered " + removedWorkers + " service worker(s). No local business records, local storage or IndexedDB were touched. Reloading the website now…", "good");
  button.textContent = "Repair complete";
  setTimeout(() => location.href = "index.html?recovery=" + Date.now(), 900);
});
runButton("checkConnection", async () => {
  if (!navigator.onLine) {
    say("This device reports that it is offline. Reconnect Wi-Fi or mobile data, then try again.", "bad");
    return;
  }
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("./?recovery_check=" + Date.now(), { cache: "no-store", signal: controller.signal });
    const elapsed = Math.round(performance.now() - started);
    say("Connection test passed. Website responded with HTTP " + response.status + " in " + elapsed + " ms. This confirms the website host is reachable; Firebase status is checked inside the app.", "good");
  } catch (error) {
    say("Device is online, but the website host did not respond in time. Check your connection or try again later.", "bad");
  } finally { clearTimeout(timeout); }
});
runButton("showRestartSteps", async () => {
  say("On your phone: open Recent Apps, swipe ChatGPT/browser? No—close the browser app containing the frozen POS tab, reopen Chrome, then visit https://mubarak2058.github.io/Goldbizna/emergency-recovery.html. On a computer: close the frozen tab, open a new tab and visit this recovery page. Do not clear site data.");
});
