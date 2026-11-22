// TEMPORARY DEVELOPMENT MODE
// Login is paused while MABROUK TRADER'S multi-user features are being built.
// This file deliberately does not enforce Firebase Authentication.
// IMPORTANT: Do not use with real customer/business data until Firestore rules
// and individual staff accounts are secured.

const DEVELOPMENT_MODE = true;

if (DEVELOPMENT_MODE) {
  document.documentElement.dataset.authMode = "development";

  // Show a clear development-mode indicator where the page has a user label.
  const userLabel = document.getElementById("userName");
  if (userLabel) userLabel.textContent = "Development Mode";

  // Logout has no meaning while login is paused.
  document.querySelectorAll("[data-logout]").forEach((el) => {
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  });

  // Keep legacy inline logout calls harmless during this temporary phase.
  window.logout = function (event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    alert("Login is temporarily paused while the multi-user system is being built.");
  };
}
