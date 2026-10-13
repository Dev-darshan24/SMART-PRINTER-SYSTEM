/**
 * Client Environment Variables Loader
 */

const rawEnv = window.__ENV__ || {};

export const clientEnv = {
  FIREBASE_API_KEY: rawEnv.FIREBASE_API_KEY || "",
  FIREBASE_AUTH_DOMAIN: rawEnv.FIREBASE_AUTH_DOMAIN || "smartprint-idea.firebaseapp.com",
  FIREBASE_PROJECT_ID: rawEnv.FIREBASE_PROJECT_ID || "smartprint-idea",
  FIREBASE_STORAGE_BUCKET: rawEnv.FIREBASE_STORAGE_BUCKET || "smartprint-idea.appspot.com",
  FIREBASE_MESSAGING_SENDER_ID: rawEnv.FIREBASE_MESSAGING_SENDER_ID || "",
  FIREBASE_APP_ID: rawEnv.FIREBASE_APP_ID || "",
  
  SUPERADMIN_EMAIL: rawEnv.SUPERADMIN_EMAIL || "admin@smartprint.io",
  USE_FIREBASE_EMULATORS: rawEnv.USE_FIREBASE_EMULATORS === true || rawEnv.USE_FIREBASE_EMULATORS === "true",

  NODE_ENV: rawEnv.NODE_ENV || "production"
};
