/**
 * Centralized Firebase Client Configuration & Service Attachment
 */

export { 
  app, 
  auth, 
  db, 
  storage, 
  firebaseConfig,
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
} from './firebase/connection.js';
