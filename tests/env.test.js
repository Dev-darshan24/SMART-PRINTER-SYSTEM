/**
 * Environment & Configuration Test Specification
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Environment & Configuration Verification", () => {
  it("verifies .env file exists and contains essential keys", () => {
    const envPath = path.resolve(__dirname, "../.env");
    assert.strictEqual(fs.existsSync(envPath), true, ".env file must exist in project root.");

    const envContent = fs.readFileSync(envPath, "utf-8");
    assert.strictEqual(envContent.includes("SUPERADMIN_EMAIL="), true, "Must define SUPERADMIN_EMAIL.");
    assert.strictEqual(envContent.includes("SUPERADMIN_PASSWORD="), true, "Must define SUPERADMIN_PASSWORD.");
    assert.strictEqual(envContent.includes("FIREBASE_PROJECT_ID="), true, "Must define FIREBASE_PROJECT_ID.");
    assert.strictEqual(envContent.includes("RAZORPAY_KEY_ID="), true, "Must define RAZORPAY_KEY_ID.");
  });

  it("verifies .env.example and .firebaserc.example have been removed", () => {
    const envExamplePath = path.resolve(__dirname, "../.env.example");
    const firebaseRcExamplePath = path.resolve(__dirname, "../.firebaserc.example");
    assert.strictEqual(fs.existsSync(envExamplePath), false, ".env.example must not exist.");
    assert.strictEqual(fs.existsSync(firebaseRcExamplePath), false, ".firebaserc.example must not exist.");
  });

  it("verifies .firebaserc is attached and points to active project", () => {
    const firebasercPath = path.resolve(__dirname, "../.firebaserc");
    assert.strictEqual(fs.existsSync(firebasercPath), true, ".firebaserc must exist.");
    const content = JSON.parse(fs.readFileSync(firebasercPath, "utf-8"));
    assert.strictEqual(content.projects.default, "smart-print-system-f3950", "Default project must be smart-print-system-f3950.");
  });

  it("verifies backend env config loads correctly", () => {
    const env = require("../functions/src/config/env");
    assert.strictEqual(typeof env.SUPERADMIN_EMAIL, "string");
    assert.strictEqual(typeof env.SUPERADMIN_PASSWORD, "string");
    assert.strictEqual(typeof env.PORT, "number");
    assert.strictEqual(typeof env.FIREBASE_PROJECT_ID, "string");
    assert.strictEqual(env.FIREBASE_PROJECT_ID, "smart-print-system-f3950");
  });

  it("verifies .gitignore contains .env to prevent secret leakage", () => {
    const gitignorePath = path.resolve(__dirname, "../.gitignore");
    const content = fs.readFileSync(gitignorePath, "utf-8");
    assert.strictEqual(content.includes(".env"), true, ".gitignore must exclude .env.");
  });
});
