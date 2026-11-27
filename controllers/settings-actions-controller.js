export function initSettingsActions({ settings, notify }) {
  const bind = (id, action) => {
    const button = document.getElementById(id);
    if (!button) {
      console.warn("Settings control missing:", id);
      return;
    }
    button.addEventListener("click", async event => {
      event.preventDefault();
      await action(button);
    });
  };
  bind("saveBusiness", settings.saveBusiness);
  bind("savePos", settings.savePos);
  bind("saveSystem", settings.saveSystem);
  bind("reloadSettings", async button => {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Loading…";
    try { await settings.loadAll(); }
    catch (error) { notify("Could not refresh settings: " + (error?.message || "Unknown error"), "bad"); }
    finally { button.disabled = false; button.textContent = old; }
  });
}
