export function initSettingsNavigation() {
  const tabs = [...document.querySelectorAll(".tab[data-tab]")];
  const sections = [...document.querySelectorAll(".section")];
  function openTab(id) {
    const target = document.getElementById(id);
    if (!target) return false;
    tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === id));
    sections.forEach(section => section.classList.toggle("active", section.id === id));
    return true;
  }
  tabs.forEach(tab => tab.addEventListener("click", () => openTab(tab.dataset.tab)));
  document.querySelectorAll("[data-jump]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      openTab(link.dataset.jump);
    });
  });
  return { openTab };
}
