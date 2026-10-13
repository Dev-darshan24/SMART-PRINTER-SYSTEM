const path = require("path");
const fs = require("fs");

// Load .env from root or current directory
const rootEnvPath = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(rootEnvPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(rootEnvPath);
  } catch (e) {
    console.warn("Could not load root .env via process.loadEnvFile:", e.message);
  }
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT, 10) || 3000,
  APP_URL: process.env.APP_URL || "http://localhost:3000",
  
  // Superadmin credentials
  SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL || "admin@smartprint.io",
  SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD || "SuperAdmin@2026Secret",

  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "smart-print-system-f3950",
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || "smart-print-system-f3950.firebasestorage.app",

  // Razorpay
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "rzp_live_SmartPrint9910",
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || "rzp_secret_SmartPrintSecret2026",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "whsec_SmartPrintWebhookSecret2026"
};

module.exports = env;
