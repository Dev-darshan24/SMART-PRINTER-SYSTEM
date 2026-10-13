const admin = require("firebase-admin");
const env = require("./env");

// Avoid duplicate initialization
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET
  });
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = {
  admin,
  db,
  auth,
  storage
};
