/**
 * Client Environment Variables Loader
 */

const rawEnv = window.__ENV__ || {};

export const clientEnv = {
  FIREBASE_API_KEY: rawEnv.FIREBASE_API_KEY || "AIzaSyDwwssW3Xz99xP551jla8iPEJ0DGXKTBqo",
  FIREBASE_AUTH_DOMAIN: rawEnv.FIREBASE_AUTH_DOMAIN || "smart-print-system-f3950.firebaseapp.com",
  FIREBASE_PROJECT_ID: rawEnv.FIREBASE_PROJECT_ID || "smart-print-system-f3950",
  FIREBASE_STORAGE_BUCKET: rawEnv.FIREBASE_STORAGE_BUCKET || "smart-print-system-f3950.firebasestorage.app",
  FIREBASE_MESSAGING_SENDER_ID: rawEnv.FIREBASE_MESSAGING_SENDER_ID || "735153543987",
  FIREBASE_APP_ID: rawEnv.FIREBASE_APP_ID || "1:735153543987:web:e8da0302c06e98bcbcbc46",
  
  SUPERADMIN_EMAIL: rawEnv.SUPERADMIN_EMAIL || "admin@smartprint.io",
  USE_FIREBASE_EMULATORS: rawEnv.USE_FIREBASE_EMULATORS === true || rawEnv.USE_FIREBASE_EMULATORS === "true",

  NODE_ENV: rawEnv.NODE_ENV || "production"
};
