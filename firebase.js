import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==========================================================================
// 1. INLINE FIREBASE CONFIGURATION
// Paste the credentials you copied from the Firebase Console here:
// ==========================================================================
const inlineConfig = {
  apiKey: "AIzaSyDQQUkjrXygqG2oE_OlNZZ68eoLBbOohp0",
  authDomain: "genfocus-35d2e.firebaseapp.com",
  projectId: "genfocus-35d2e",
  storageBucket: "genfocus-35d2e.firebasestorage.app",
  messagingSenderId: "263069806851",
  appId: "1:263069806851:web:168a63a52de617d51cf936"
};

// ==========================================================================
// 2. RUNTIME CONFIGURATION (.env Loader fallback)
// ==========================================================================
let envConfig = {};
try {
  const response = await fetch('.env');
  if (response.ok) {
    const text = await response.text();
    text.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          const cleanVal = val.replace(/^["']|["']$/g, '');
          
          if (key.startsWith('VITE_FIREBASE_')) {
            const configKey = key.replace('VITE_FIREBASE_', '')
              .toLowerCase()
              .replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            envConfig[configKey] = cleanVal;
          }
        }
      }
    });
  }
} catch (e) {
  // Silent fallback to inlineConfig or placeholders
}

const finalConfig = {
  apiKey: inlineConfig.apiKey || envConfig.apiKey || "your_api_key_here",
  authDomain: inlineConfig.authDomain || envConfig.authDomain || "your_auth_domain_here",
  projectId: inlineConfig.projectId || envConfig.projectId || "your_project_id_here",
  storageBucket: inlineConfig.storageBucket || envConfig.storageBucket || "your_storage_bucket_here",
  messagingSenderId: inlineConfig.messagingSenderId || envConfig.messagingSenderId || "your_messaging_sender_id_here",
  appId: inlineConfig.appId || envConfig.appId || "your_app_id_here"
};

const app = initializeApp(finalConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const isGuest = () => auth.currentUser === null;

export {
  auth,
  db,
  isGuest,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  deleteDoc,
  onSnapshot,
  writeBatch
};
