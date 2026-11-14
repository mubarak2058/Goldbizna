
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const LOGIN_PAGE = "login.html";
const HOME_PAGE = "index.html";

let processingLogin = false;
let processingLogout = false;
let redirecting = false;

// PAGE PERMISSIONS
const PAGE_PERMISSIONS = {
  "index.html": "Dashboard",
  "dashboard.html": "Dashboard",
  "pos.html": "POS",
  "inventory.html": "Inventory",
  "customers.html": "Customers",
  "sales.html": "Sales History",
  "sales-history.html": "Sales History",
  "reports.html": "Reports",
  "savings.html": "Savings",
  "payments.html": "Payments",
  "settings.html": "Settings",
  "users.html": "User Management"
};

function getCurrentPage() {
  return location.pathname.split("/").pop().toLowerCase() || HOME_PAGE;
}

const currentPage = getCurrentPage();
const isLoginPage = currentPage === LOGIN_PAGE;

// LOGIN ELEMENTS
const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorBox = document.getElementById("loginError");

// ERROR DISPLAY
function showError(message) {
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  }
}

function hideError() {
  if (errorBox) {
    errorBox.textContent = "";
    errorBox.style.display = "none";
  }
}

// ADMIN CHECK
function isAdmin(profile) {
  return ["Owner/Admin", "Owner", "Admin"].includes(profile.role);
}

// VERIFY FIREBASE ACCOUNT
async function checkAccount(user) {
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    throw new Error("Your account has not been registered.");
  }

  const profile = profileSnap.data();

  if (profile.active !== true) {
    throw new Error("Your account is disabled. Contact the owner.");
  }

  return profile;
}

// PAGE ACCESS
function hasPageAccess(profile, page = currentPage) {
  if (isAdmin(profile)) return true;

  const requiredPermission = PAGE_PERMISSIONS[page];

  if (!requiredPermission) return false;

  return profile.permissions?.[requiredPermission] === true;
}

// FIND FIRST PAGE STAFF CAN ACCESS
function getFirstAllowedPage(profile) {
  if (isAdmin(profile)) return HOME_PAGE;

  if (hasPageAccess(profile, HOME_PAGE)) {
    return HOME_PAGE;
  }

  for (const [page, permission] of Object.entries(PAGE_PERMISSIONS)) {
    if (profile.permissions?.[permission] === true) {
      return page;
    }
  }

  return null;
}

// REDIRECT
function redirectTo(page) {
  if (redirecting) return;

  redirecting = true;
  window.location.replace(page);
}

// LOGIN
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (processingLogin || processingLogout) return;

    hideError();

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showError("Enter your username/email and password.");
      return;
    }

    processingLogin = true;

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = "VERIFYING...";
    }

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const profile = await checkAccount(credential.user);

      const destination = getFirstAllowedPage(profile);

      if (!destination) {
        throw new Error(
          "Your account has no page permissions. Contact the owner."
        );
      }

      if (passwordInput) passwordInput.value = "";

      redirectTo(destination);

    } catch (error) {
      console.error("Login error:", error);

      if (auth.currentUser) {
        await signOut(auth);
      }

      let message = error.message;

      if (error.code === "auth/invalid-credential") {
        message = "Incorrect username/email or password.";
      }

      if (error.code === "auth/too-many-requests") {
        message = "Too many attempts. Try again later.";
      }

      showError(message || "Unable to sign in.");

      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = "LOGIN";
      }

    } finally {
      processingLogin = false;
    }
  });
}

// LOGOUT
async function logout(event, button) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (processingLogout) return;

  processingLogout = true;

  if (button) {
    button.disabled = true;
    button.textContent = "LOGGING OUT...";
  }

  try {
    await signOut(auth);

    redirectTo(LOGIN_PAGE);

  } catch (error) {
    console.error("Logout error:", error);

    alert("Unable to log out. Please try again.");

    processingLogout = false;

    if (button) {
      button.disabled = false;
      button.textContent = "LOGOUT";
    }
  }
}

// MAKE LOGOUT AVAILABLE TO ALL PAGES
window.logout = logout;

document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", (event) => {
    logout(event, button);
  });
});

// AUTHENTICATION STATE
onAuthStateChanged(auth, async (user) => {
  if (processingLogout || redirecting || processingLogin) return;

  // NOT LOGGED IN
  if (!user) {
    if (!isLoginPage) {
      redirectTo(LOGIN_PAGE);
    }
    return;
  }

  try {
    const profile = await checkAccount(user);

    // ALREADY LOGGED IN: LEAVE LOGIN PAGE
    if (isLoginPage) {
      const destination = getFirstAllowedPage(profile);

      if (destination) {
        redirectTo(destination);
      } else {
        await signOut(auth);
        showError("Your account has no assigned permissions.");
      }

      return;
    }

    // ALLOW OR DENY CURRENT PAGE
    if (!hasPageAccess(profile)) {
      alert("You are not allowed to access this section.");

      const destination = getFirstAllowedPage(profile);

      if (destination) {
        redirectTo(destination);
      } else {
        await signOut(auth);
        redirectTo(LOGIN_PAGE);
      }

      return;
    }

    // USER IS AUTHENTICATED AND AUTHORIZED.
    // NO EXTRA LOGIN REQUIRED WHEN CHANGING PAGES.

  } catch (error) {
    console.error("Authentication error:", error);

    await signOut(auth);

    if (!isLoginPage) {
      redirectTo(LOGIN_PAGE);
    } else {
      showError(error.message || "Account verification failed.");
    }
  }
});
