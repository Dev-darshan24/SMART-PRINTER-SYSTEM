/**
 * Profile Persistence & Firebase Database Refresh Test Specification
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Profile Firebase Database Persistence & Refresh Verification", () => {
  const rulesPath = path.resolve(__dirname, "../firestore.rules");
  const authManagerPath = path.resolve(__dirname, "../public/assets/js/auth/authManager.js");
  const appJsPath = path.resolve(__dirname, "../public/assets/js/app.js");

  it("verifies firestore.rules permits owners to create and update their center and user profiles", () => {
    assert.strictEqual(fs.existsSync(rulesPath), true, "firestore.rules must exist.");
    const rules = fs.readFileSync(rulesPath, "utf-8");

    // Owner center write permissions
    assert.strictEqual(rules.includes("request.resource.data.ownerUid == request.auth.uid"), true, "Must allow owner to create center doc.");
    assert.strictEqual(rules.includes("resource.data.ownerUid == request.auth.uid"), true, "Must allow owner to update center doc.");
    assert.strictEqual(rules.includes("!request.resource.data.diff(resource.data).affectedKeys().hasAny(['ownerUid', 'id', 'subscriptionId'])"), true, "Must guard sensitive center fields.");

    // User profile permissions
    assert.strictEqual(rules.includes("request.auth.uid == userId"), true, "Must verify user identity for user doc.");
    assert.strictEqual(rules.includes("hasAny(['role', 'createdAt'])"), true, "Must forbid client tampering with user role.");
  });

  it("verifies authManager.js ensures owner center link and auto-provisions centerId", () => {
    assert.strictEqual(fs.existsSync(authManagerPath), true, "authManager.js must exist.");
    const code = fs.readFileSync(authManagerPath, "utf-8");

    assert.strictEqual(code.includes("ensureOwnerCenter"), true, "Must define ensureOwnerCenter helper.");
    assert.strictEqual(code.includes("where(\"ownerUid\", \"==\", fbUser.uid)"), true, "Must check for existing owner center by UID.");
    assert.strictEqual(code.includes("centerId = await this.ensureOwnerCenter"), true, "Must call ensureOwnerCenter on auth state change and login.");
  });

  it("verifies app.js imports Firestore modular SDK functions", () => {
    assert.strictEqual(fs.existsSync(appJsPath), true, "app.js must exist.");
    const code = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(code.includes("import {") && code.includes("setDoc") && code.includes("getDoc"), true, "Must import setDoc and getDoc in app.js.");
    assert.strictEqual(code.includes("serverTimestamp"), true, "Must import serverTimestamp.");
  });

  it("verifies app.js persists profile fields to Firebase Firestore on form submission", () => {
    const code = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(code.includes("doc(db, \"centers\", resolvedCenterId)"), true, "Must target center document in Firestore.");
    assert.strictEqual(code.includes("setDoc(centerRef"), true, "Must persist center profile to Firestore via setDoc.");
    assert.strictEqual(code.includes("doc(db, \"users\", user.uid)"), true, "Must update user document in Firestore.");
    assert.strictEqual(code.includes("Saving.."), true, "Must display 'Saving..' during submission.");
  });

  it("verifies app.js restores profile from Firebase Firestore on refresh (syncProfileFromFirestore)", () => {
    const code = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(code.includes("syncProfileFromFirestore"), true, "Must define syncProfileFromFirestore on app launch.");
    assert.strictEqual(code.includes("where(\"ownerUid\", \"==\", user.uid)"), true, "Must query centers for current user on reload.");
    assert.strictEqual(code.includes("populateProfileForm(remoteCenter"), true, "Must re-populate profile form with fetched Firestore data.");
  });

  it("verifies populateProfileForm gracefully handles nullable center on initial load without blanking out", () => {
    const code = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(code.includes("function populateProfileForm(center, maybeUser = null)"), true, "Must accept center and optional user.");
    assert.strictEqual(code.includes("const c = center || {};"), true, "Must fallback to empty object if center is not yet loaded.");
  });
});
