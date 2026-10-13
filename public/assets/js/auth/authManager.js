/**
 * Authentication & Authorization Manager
 * Integrated directly with Firebase Authentication & Cloud Firestore
 */

import { clientEnv } from '../config/env.js';
import { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp 
} from '../firebase-config.js';
import { showToast } from '../ui.js';

export const ROLES = {
  SUPERADMIN: "superadmin",
  OWNER: "owner",
  CUSTOMER: "customer"
};

class AuthManager {
  constructor() {
    this.user = this.getStoredUser();
    this.initFirebaseListener();
  }

  getStoredUser() {
    const raw = localStorage.getItem("smartprint_auth_session");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async ensureOwnerCenter(fbUser, displayName, cleanEmail, existingCenterId = null) {
    let centerId = existingCenterId;
    if (!centerId && fbUser?.uid) {
      centerId = "center_" + fbUser.uid.substring(0, 8);
    }
    if (!db || !fbUser) return centerId;

    try {
      // 1. Check if owner already has an associated center in Firestore
      const q = query(collection(db, "centers"), where("ownerUid", "==", fbUser.uid));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        centerId = querySnap.docs[0].id;
      } else {
        // 2. Provision default center record in Firestore
        const publicId = "CTR-" + fbUser.uid.substring(0, 6).toUpperCase();
        await setDoc(doc(db, "centers", centerId), {
          id: centerId,
          centerId,
          publicId,
          name: displayName ? `${displayName}'s Print Hub` : "SmartPrint Hub",
          storeName: displayName ? `${displayName}'s Print Hub` : "SmartPrint Hub",
          slug: centerId,
          ownerUid: fbUser.uid,
          ownerEmail: cleanEmail,
          email: cleanEmail,
          status: "active",
          rates: { bwSingle: 2, bwDouble: 3.5, colorSingle: 10, colorDouble: 18 },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 3. Update users/{uid} with centerId
      await setDoc(doc(db, "users", fbUser.uid), {
        email: cleanEmail,
        name: displayName,
        role: ROLES.OWNER,
        centerId,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn("Center provisioning / linking notice:", err.message);
    }

    return centerId;
  }

  initFirebaseListener() {
    if (!auth) return;
    try {
      onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          // If we have an active Firebase session, refresh local state
          const email = fbUser.email.toLowerCase();
          const isSuperadmin = email === clientEnv.SUPERADMIN_EMAIL.toLowerCase();

          let role = isSuperadmin ? ROLES.SUPERADMIN : ROLES.OWNER;
          let centerId = null;
          let displayName = fbUser.displayName || email.split("@")[0];

          try {
            const userSnap = await getDoc(doc(db, "users", fbUser.uid));
            if (userSnap.exists()) {
              const uData = userSnap.data();
              role = uData.role || role;
              centerId = uData.centerId || null;
              displayName = uData.name || displayName;
            }
          } catch (e) {
            // Firestore profile fetch is non-blocking
          }

          if (role === ROLES.OWNER && !centerId) {
            centerId = await this.ensureOwnerCenter(fbUser, displayName, email, this.user?.centerId);
          }

          const isGoogle = fbUser.providerData?.some(p => p.providerId === 'google.com');
          this.user = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName,
            role,
            centerId,
            authProvider: isGoogle ? "google" : (this.user?.authProvider || "email")
          };
          this.saveSession();
        }
      });
    } catch (e) {
      console.warn("Firebase Auth listener initialization notice:", e.message);
    }
  }

  getCurrentUser() {
    return this.user;
  }

  async login(email, password) {
    const cleanEmail = email.trim().toLowerCase();

    // 1. Direct Superadmin Bootstrap Check
    if (cleanEmail === clientEnv.SUPERADMIN_EMAIL.toLowerCase()) {
      const superPass = window.__ENV__?.SUPERADMIN_PASSWORD;
      if (superPass && password === superPass) {
        this.user = {
          uid: "superadmin_root",
          email: clientEnv.SUPERADMIN_EMAIL,
          displayName: "Super Administrator",
          role: ROLES.SUPERADMIN
        };
        this.saveSession();
        return this.user;
      }
    }

    // 2. Real Firebase Authentication
    try {
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = userCredential.user;

      let role = (cleanEmail === clientEnv.SUPERADMIN_EMAIL.toLowerCase()) ? ROLES.SUPERADMIN : ROLES.OWNER;
      let centerId = null;
      let displayName = fbUser.displayName || cleanEmail.split("@")[0];

      // Retrieve role and center assignments from Firestore
      try {
        const userSnap = await getDoc(doc(db, "users", fbUser.uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          role = uData.role || role;
          centerId = uData.centerId || null;
          displayName = uData.name || displayName;
        }
      } catch (err) {
        console.warn("Could not load user profile from Firestore:", err.message);
      }

      if (role === ROLES.OWNER && !centerId) {
        centerId = await this.ensureOwnerCenter(fbUser, displayName, cleanEmail);
      }

      this.user = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName,
        role,
        centerId
      };
      this.saveSession();
      return this.user;
    } catch (firebaseError) {
      // Clean up common Firebase error messages for display
      let msg = firebaseError.message;
      if (firebaseError.code === "auth/invalid-credential" || firebaseError.code === "auth/wrong-password" || firebaseError.code === "auth/user-not-found") {
        msg = "Invalid email or password. Please verify your credentials.";
      } else if (firebaseError.code === "auth/too-many-requests") {
        msg = "Access temporarily blocked due to multiple failed login attempts. Try again later.";
      }
      throw new Error(msg);
    }
  }

  async loginWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      // Configure custom parameters if needed
      provider.setCustomParameters({ prompt: 'select_account' });
      
      const userCredential = await signInWithPopup(auth, provider);
      const fbUser = userCredential.user;
      const cleanEmail = (fbUser.email || "").toLowerCase();

      const isSuperadmin = cleanEmail === clientEnv.SUPERADMIN_EMAIL.toLowerCase();
      let role = isSuperadmin ? ROLES.SUPERADMIN : ROLES.OWNER;
      let centerId = null;
      let displayName = fbUser.displayName || cleanEmail.split("@")[0];

      // Retrieve or provision role & center assignment from Firestore
      try {
        const userRef = doc(db, "users", fbUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.data();
          role = uData.role || role;
          centerId = uData.centerId || null;
          displayName = uData.name || displayName;
        }

        if (role === ROLES.OWNER && !centerId) {
          centerId = await this.ensureOwnerCenter(fbUser, displayName, cleanEmail);
        }
      } catch (err) {
        console.warn("Firestore user profile sync notice:", err.message);
      }

      this.user = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName,
        role,
        centerId,
        authProvider: "google"
      };
      this.saveSession();
      return this.user;
    } catch (firebaseError) {
      if (firebaseError.code === "auth/popup-closed-by-user") {
        throw new Error("Google sign-in popup was closed before completing.");
      }
      throw new Error(firebaseError.message || "Google authentication failed.");
    }
  }

  async register({ centerName, fullName, email, password }) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCenterName = (centerName || "My Xerox Center").trim();
    const cleanFullName = (fullName || cleanEmail.split("@")[0]).trim();

    try {
      // 1. Create account in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const fbUser = userCredential.user;

      // 2. Update display name in Firebase profile
      try {
        await updateProfile(fbUser, { displayName: cleanFullName });
      } catch (e) {
        console.warn("Could not set displayName in Firebase profile:", e.message);
      }

      // 3. Generate center ID
      const centerId = "center_" + fbUser.uid.substring(0, 8);

      // 4. Provision Firestore user record
      try {
        await setDoc(doc(db, "users", fbUser.uid), {
          email: cleanEmail,
          name: cleanFullName,
          role: ROLES.OWNER,
          centerId: centerId,
          createdAt: serverTimestamp()
        });

        // 5. Provision Firestore center record
        await setDoc(doc(db, "centers", centerId), {
          id: centerId,
          name: cleanCenterName,
          slug: centerId,
          ownerUid: fbUser.uid,
          ownerEmail: cleanEmail,
          rates: {
            bwSingle: 2,
            bwDouble: 3,
            colorSingle: 10,
            colorDouble: 15
          },
          status: "active",
          createdAt: serverTimestamp()
        });
      } catch (firestoreErr) {
        console.warn("Firestore collection provisioning notice:", firestoreErr.message);
      }

      // 6. Establish local session
      this.user = {
        uid: fbUser.uid,
        email: cleanEmail,
        displayName: cleanFullName,
        role: ROLES.OWNER,
        centerId: centerId
      };
      this.saveSession();
      return this.user;
    } catch (firebaseError) {
      let msg = firebaseError.message;
      if (firebaseError.code === "auth/email-already-in-use") {
        msg = "An account with this email address already exists. Please sign in instead.";
      } else if (firebaseError.code === "auth/weak-password") {
        msg = "Password is too weak. Please use at least 6 characters.";
      } else if (firebaseError.code === "auth/invalid-email") {
        msg = "Please provide a valid email address.";
      }
      throw new Error(msg);
    }
  }

  isLoggedIn() {
    return !!(this.user && this.user.uid);
  }

  async logout() {
    this.user = null;
    localStorage.removeItem("smartprint_auth_session");
    try {
      if (auth) await fbSignOut(auth);
    } catch (e) {
      // ignore
    }
    showToast("Signed out successfully", "info");
    setTimeout(() => {
      window.location.href = "/login.html";
    }, 400);
  }

  saveSession() {
    if (this.user) {
      localStorage.setItem("smartprint_auth_session", JSON.stringify(this.user));
    } else {
      localStorage.removeItem("smartprint_auth_session");
    }
  }
}

export const authManager = new AuthManager();
