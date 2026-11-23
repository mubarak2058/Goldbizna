// MABROUK TRADER'S - Firebase Configuration
// Firebase SDK version 12.1.0

import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app-check.js";

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyA8XB6aY45-yHT0uZ6NUhptMoNkYqgwqOs",
  authDomain: "goldbizna.firebaseapp.com",
  projectId: "goldbizna",
  storageBucket: "goldbizna.firebasestorage.app",
  messagingSenderId: "559981054862",
  appId: "1:559981054862:web:0635c689607d3baa3272df",
  measurementId: "G-95XL3BNQJF"
};

// Initialize Firebase only once
const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

// App Check configuration
// Add your PUBLIC reCAPTCHA v3 site key here to activate App Check.
const APP_CHECK_SITE_KEY = "6Ldn4iOuAAAAALZI8nAnLZskDGBbjTmRjDCgDhTW";

let appCheck = null;

if (
  APP_CHECK_SITE_KEY &&
  APP_CHECK_SITE_KEY !== "PASTE_YOUR_PUBLIC_SITE_KEY_HERE"
) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });

  console.log("Firebase App Check initialized.");
} else {
  console.warn(
    "Firebase App Check is not active: add your reCAPTCHA v3 public site key."
  );
}

// Export Firebase services
export {
  app,
  auth,
  db,
  firebaseConfig,
  appCheck
};
