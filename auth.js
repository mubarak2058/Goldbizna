
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

// LOGIN ELEMENTS
const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorBox = document.getElementById("loginError");

let processingLogin = false;
let authReady = false;

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

// CURRENT PAGE
function getCurrentPage() {
  return location.pathname.split("/").pop().toLowerCase();
}

// PAGE PERMISSIONS
function getRequiredPermission() {
  const permissions = {
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

  return permissions[getCurrentPage()] || "Dashboard";
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
    throw new Error(
      "Your user account has not been registered by the administrator."
    );
  }

  const profile = profileSnap.data();

  if (profile.active !== true) {
    throw new Error(
      "Your account is disabled. Contact your administrator."
    );
  }

  return profile;
}

// CHECK PAGE ACCESS
function hasPageAccess(profile) {
  if (isAdmin(profile)) return true;

  const required = getRequiredPermission();

  return profile.permissions?.[required] === true;
}

// DASHBOARD ACCESS
function hasDashboardAccess(profile) {
  if (isAdmin(profile)) return true;

  return profile.permissions?.Dashboard === true;
}

// LOGIN FORM
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (processingLogin) return;

    hideError();

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showError("Enter your email and password.");
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

      if (!hasDashboardAccess(profile)) {
        throw new Error(
          "Your account does not have Dashboard access. Contact your administrator."
        );
      }

      passwordInput.value = "";

      window.location.replace(HOME_PAGE);

    } catch (error) {
      console.error("Login error:", error);

      if (auth.currentUser) {
        await signOut(auth);
      }

      let message = error.message;

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password"
      ) {
        message = "Incorrect email address or password.";
      } else if (error.code === "auth/too-many-requests") {
        message = "Too many attempts. Please try again later.";
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

// PUBLIC PAGES
const currentPage = getCurrentPage();
const publicPages = ["login.html"];

// AUTHENTICATION STATE
onAuthStateChanged(auth, async (user) => {

  if (processingLogin) return;

  if (!user) {
    if (!publicPages.includes(currentPage)) {
      window.location.replace(LOGIN_PAGE);
    }

    authReady = true;
    return;
  }

  try {
    const profile = await checkAccount(user);

    if (publicPages.includes(currentPage)) {
      window.location.replace(HOME_PAGE);
      return;
    }

    if (!hasPageAccess(profile)) {
      alert("You do not have permission to access this page.");

      await signOut(auth);

      window.location.replace(LOGIN_PAGE);
      return;
    }

    authReady = true;

  } catch (error) {
    console.error("Account verification error:", error);

    await signOut(auth);

    if (!publicPages.includes(currentPage)) {
      window.location.replace(LOGIN_PAGE);
    } else {
      showError(error.message || "Account verification failed.");
    }
  }
});

// LOGOUT BUTTONS
document.querySelectorAll("[data-logout]").forEach((button) => {

  button.addEventListener("click", async (event) => {

    event.preventDefault();
    event.stopPropagation();

    if (button.disabled) return;

    button.disabled = true;

    try {
      await signOut(auth);

      window.location.replace(LOGIN_PAGE);

    } catch (error) {
      console.error("Logout error:", error);

      alert("Unable to log out. Please try again.");

      button.disabled = false;
    }

  });

});
