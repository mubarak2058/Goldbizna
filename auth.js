import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyA8XB6aY45-yHT0uZ6NUhptMoNkYqgwqOs",
  authDomain: "goldbizna.firebaseapp.com",
  projectId: "goldbizna",
  storageBucket: "goldbizna.firebasestorage.app",
  messagingSenderId: "559981054862",
  appId: "1:559981054862:web:0635c689607d3baa3272df"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export async function login(email, password) {
  return signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(
    auth,
    email.trim()
  );
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  return signOut(auth);
}

export { auth };
