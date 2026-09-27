// ============================================================
// MABROUK TRADER'S
// Firebase Authentication
// ============================================================
//
// This file handles AUTHENTICATION ONLY.
//
// It does NOT:
// - Load products
// - Search products
// - Modify inventory
// - Handle the POS cart
// - Read/write product data
//
// Firestore/product logic remains in your existing files.
// ============================================================

import {
  initializeApp,
  getApps
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";


// ============================================================
// FIREBASE CONFIGURATION
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyA8XB6aY45-yHT0uZ6NUhptMoNkYqgwqOs",
  authDomain: "goldbizna.firebaseapp.com",
  projectId: "goldbizna",
  storageBucket: "goldbizna.firebasestorage.app",
  messagingSenderId: "559981054862",
  appId: "1:559981054862:web:0635c689607d3baa3272df"
};


// ============================================================
// INITIALIZE FIREBASE
// ============================================================
//
// If another Firebase file has already initialized the app,
// reuse that existing app instead of creating another one.
//

const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);


// ============================================================
// FIREBASE AUTH
// ============================================================

const auth = getAuth(app);


// ============================================================
// LOGIN
// ============================================================

export async function login(email, password) {

  email = String(email || "").trim();
  password = String(password || "");

  if (!email) {
    throw new Error("Please enter your email.");
  }

  if (!password) {
    throw new Error("Please enter your password.");
  }

  try {

    const result = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    return result.user;

  } catch (error) {

    console.error("Login error:", error);

    throw error;
  }
}


// ============================================================
// PASSWORD RESET
// ============================================================

export async function resetPassword(email) {

  email = String(email || "").trim();

  if (!email) {
    throw new Error("Please enter your email.");
  }

  try {

    await sendPasswordResetEmail(
      auth,
      email
    );

    return true;

  } catch (error) {

    console.error("Password reset error:", error);

    throw error;
  }
}


// ============================================================
// LOGOUT
// ============================================================

export async function logout() {

  try {

    await signOut(auth);

    return true;

  } catch (error) {

    console.error("Logout error:", error);

    throw error;
  }
}


// ============================================================
// CURRENT USER
// ============================================================

export function getCurrentUser() {

  return auth.currentUser;

}


// ============================================================
// AUTH STATE LISTENER
// ============================================================
//
// Example:
//
// watchAuth((user) => {
//   if (user) {
//     console.log("Logged in:", user.email);
//   } else {
//     console.log("Logged out");
//   }
// });
//

export function watchAuth(callback) {

  if (typeof callback !== "function") {
    throw new Error("watchAuth requires a callback function.");
  }

  return onAuthStateChanged(
    auth,
    callback
  );
}


// ============================================================
// AUTH OBJECT
// ============================================================
//
// Exported for pages that need direct access to Firebase Auth.
//

export { auth };


// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  auth,
  login,
  logout,
  resetPassword,
  getCurrentUser,
  watchAuth
};
