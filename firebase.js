
// MABROUK TRADER'S - Firebase Configuration

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

const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
