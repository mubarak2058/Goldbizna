
import { auth } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// Page settings
const LOGIN_PAGE = "login.html";
const HOME_PAGE = "index.html";

// Detect login form
const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorBox = document.getElementById("loginError");

// Login form
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showError("Enter your email and password.");
      return;
    }

    const button = loginForm.querySelector(
      'button[type="submit"]'
    );

    if (button) {
      button.disabled = true;
      button.textContent = "Signing in...";
    }

    try {
      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      passwordInput.value = "";

      window.location.replace(HOME_PAGE);

    } catch (error) {
      console.error("Login error:", error);

      showError(
        "Login failed. Check your email and password."
      );

      if (button) {
        button.disabled = false;
        button.textContent = "LOGIN";
      }
    }
  });
}

// Display login errors
function showError(message) {
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.style.display = "block";
  } else {
    alert(message);
  }
}

// Protect business pages
const currentPage = window.location.pathname
  .split("/")
  .pop()
  .toLowerCase();

const publicPages = [
  "login.html"
];

onAuthStateChanged(auth, (user) => {
  if (!user && !publicPages.includes(currentPage)) {
    window.location.replace(LOGIN_PAGE);
    return;
  }

  if (user && publicPages.includes(currentPage)) {
    window.location.replace(HOME_PAGE);
  }
});

// Logout buttons
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
                   
