/**
 * Centralized Firebase Client Connection
 * Imports Firebase Modular SDK (v10) and attaches Auth, Firestore, and Storage
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  collectionGroup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getStorage, 
  connectStorageEmulator,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

import { clientEnv } from '../config/env.js';

export const firebaseConfig = {
  apiKey: clientEnv.FIREBASE_API_KEY,
  authDomain: clientEnv.FIREBASE_AUTH_DOMAIN,
  projectId: clientEnv.FIREBASE_PROJECT_ID,
  storageBucket: clientEnv.FIREBASE_STORAGE_BUCKET || `${clientEnv.FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: clientEnv.FIREBASE_MESSAGING_SENDER_ID,
  appId: clientEnv.FIREBASE_APP_ID
};

// Initialize or reuse app
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Connect to local emulators only when explicitly enabled
const shouldUseEmulators = clientEnv.USE_FIREBASE_EMULATORS === true || 
                           window.__USE_FIREBASE_EMULATORS__ === true ||
                           new URLSearchParams(window.location.search).get("emulator") === "true";

if (shouldUseEmulators && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
  try {
    if (!window.__FIREBASE_EMULATORS_CONNECTED__) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
      window.__FIREBASE_EMULATORS_CONNECTED__ = true;
      console.log("Firebase client attached to local emulator suite (Auth: 9099, Firestore: 8080, Storage: 9199)");
    }
  } catch (e) {
    console.info("Firebase emulator connection error, falling back to cloud credentials.");
  }
} else {
  console.log(`Firebase connected to Cloud project: ${firebaseConfig.projectId}`);
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  collectionGroup,
  ref,
  uploadBytes,
  getDownloadURL
};
