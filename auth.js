
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

const currentPage = window.location.pathname
  .split("/")
  .pop()
  .toLowerCase();

const isLoginPage = currentPage === LOGIN_PAGE;

let loginInProgress = false;

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorBox = document.getElementById("loginError");
const loginButton = loginForm?.querySelector(
  'button[type="submit"]'
);

function showError(message) {
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  } else {
    alert(message);
  }
}

async function getValidProfile(user) {
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    throw new Error("Your user profile was not found.");
  }

  const profile = profileSnap.data();

  if (profile.active !== true) {
    throw new Error("Your account has been disabled.");
  }

  return profile;
}

// EMAIL LOGIN
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (errorBox) {
      errorBox.style.display = "none";
    }

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showError("Enter your email and password.");
      return;
    }

    loginInProgress = true;

    if (loginButton) {
      loginButton.disabled = true;
      loginButton.textContent = "SIGNING IN...";
    }

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      await getValidProfile(credential.user);

      passwordInput.value = "";
      window.location.replace(HOME_PAGE);

    } catch (error) {
      console.error("Login error:", error);

      if (auth.currentUser) {
        await signOut(auth);
      }

      showError(
        error.message.includes("disabled") ||
        error.message.includes("profile was not found")
          ? error.message
          : "Login failed. Check your email and password."
      );

      if (loginButton) {
        loginButton.disabled = false;
        loginButton.textContent = "LOGIN";
      }

    } finally {
      loginInProgress = false;
    }
  });
}

// PROTECT BUSINESS PAGES
onAuthStateChanged(auth, async (user) => {
  if (loginInProgress) return;

  if (!user) {
    if (!isLoginPage) {
      window.location.replace(LOGIN_PAGE);
    }
    return;
  }

  try {
    await getValidProfile(user);

    if (isLoginPage) {
      window.location.replace(HOME_PAGE);
    }

  } catch (error) {
    console.error("Account access denied:", error);

    await signOut(auth);

    if (!isLoginPage) {
      window.location.replace(LOGIN_PAGE);
    } else {
      showError("Your account is inactive or not properly configured.");
    }
  }
});

// LOGOUT
document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.replace(LOGIN_PAGE);
    } catch (error) {
      console.error("Logout error:", error);
      alert("Unable to log out. Please try again.");
    }
  });
});
