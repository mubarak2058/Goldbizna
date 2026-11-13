
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

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorBox = document.getElementById("loginError");

let processingLogin = false;

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

function getRequiredPermission() {
  const page = location.pathname.split("/").pop().toLowerCase();

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

  return permissions[page] || "Dashboard";
}

function isAdmin(profile) {
  return ["Owner/Admin", "Owner", "Admin"].includes(profile.role);
}

async function checkAccount(user) {
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    throw new Error("Your user account has not been registered by the administrator.");
  }

  const profile = profileSnap.data();

  if (profile.active !== true) {
    throw new Error("Your account is disabled. Contact your administrator.");
  }

  return profile;
}

function hasPageAccess(profile) {
  if (isAdmin(profile)) return true;

  const required = getRequiredPermission();

  return profile.permissions?.[required] === true;
}

// LOGIN FORM
if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError("Enter your email and password.");
      return;
    }

    processingLogin = true;
    loginBtn.disabled = true;
    loginBtn.textContent = "VERIFYING...";

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const profile = await checkAccount(credential.user);

      if (!hasPageAccessForDashboard(profile)) {
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

      loginBtn.disabled = false;
      loginBtn.textContent = "LOGIN";

    } finally {
      processingLogin = false;
    }
  });
}

function hasPageAccessForDashboard(profile) {
  if (isAdmin(profile)) return true;
  return profile.permissions?.Dashboard === true;
}

// PROTECT ALL BUSINESS PAGES
const currentPage = location.pathname.split("/").pop().toLowerCase();

const publicPages = ["login.html"];

onAuthStateChanged(auth, async (user) => {
  if (processingLogin) return;

  if (!user) {
    if (!publicPages.includes(currentPage)) {
      location.replace(LOGIN_PAGE);
    }
    return;
  }

  try {
    const profile = await checkAccount(user);

    if (publicPages.includes(currentPage)) {
      location.replace(HOME_PAGE);
      return;
    }

    if (!hasPageAccess(profile)) {
      await signOut(auth);
      alert("You do not have permission to access this page.");
      location.replace(LOGIN_PAGE);
    }

  } catch (error) {
    console.error("Account verification:", error);

    await signOut(auth);

    if (!publicPages.includes(currentPage)) {
      location.replace(LOGIN_PAGE);
    } else {
      showError(error.message || "Account verification failed.");
    }
  }
});

// LOGOUT BUTTONS
document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await signOut(auth);
      location.replace(LOGIN_PAGE);
    } catch (error) {
      console.error(error);
      alert("Unable to log out.");
    }
  });
});
        
