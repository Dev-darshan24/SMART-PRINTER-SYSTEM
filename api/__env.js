/**
 * Vercel Serverless Function: Dynamic Environment Variables
 * Delivers client-safe Firebase configuration populated from Vercel Project Environment Variables
 */
module.exports = (req, res) => {
  const clientEnv = {
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "AIzaSyDwwssW3Xz99xP551jla8iPEJ0DGXKTBqo",
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || "smart-print-system-f3950.firebaseapp.com",
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "smart-print-system-f3950",
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || "smart-print-system-f3950.firebasestorage.app",
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || "735153543987",
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || "1:735153543987:web:e8da0302c06e98bcbcbc46",
    SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL || "admin@smartprint.io",
    NODE_ENV: process.env.NODE_ENV || "production"
  };

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  res.status(200).send(`window.__ENV__ = ${JSON.stringify(clientEnv, null, 2)};`);
};
