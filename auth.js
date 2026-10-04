import {
  initializeApp,
  getApps
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA8XB6aY45-yHT0uZ6NU5gYqgwqOs",
  authDomain: "goldbizna.firebaseapp.com",
  projectId: "goldbizna",
  storageBucket: "goldbizna.firebasestorage.app",
  messagingSenderId: "559981054862",
  appId: "1:559981054862:web:0635c689607d3baa3272df",
  measurementId: "G-95XL3BNQJF"
};

const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

const auth = getAuth(app);

/* Keep the page hidden only while Firebase checks the session */
document.documentElement.style.visibility = "hidden";

onAuthStateChanged(auth, (user) => {

  if (user) {
    /* Door unlocked.
       Do absolutely nothing else. */
    document.documentElement.style.visibility = "visible";
    return;
  }

  /* Door locked */
  location.replace("login.html");
});
