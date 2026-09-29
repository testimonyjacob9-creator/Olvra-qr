// Olvra QR — the one place Firebase is configured.
// Paste your new project's web config below (Firebase console → Project settings → Your apps → Web app).
// This config is public by design; security comes from firestore.rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBB_eiITP7nLRnmDz6C1Dqh6iweAv_JopA",
  authDomain: "olvraqr.firebaseapp.com",
  projectId: "olvraqr",
  storageBucket: "olvraqr.firebasestorage.app",
  messagingSenderId: "250771727226",
  appId: "1:250771727226:web:0c6a096c326115be2fecc3",
  measurementId: "G-0MJ5TTEQH4"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
