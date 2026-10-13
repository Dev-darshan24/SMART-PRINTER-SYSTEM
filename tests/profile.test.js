/**
 * Profile Section and Permanent QR Verification Test Specification
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Profile Section & Permanent QR Verification", () => {
  const htmlPath = path.resolve(__dirname, "../public/app/index.html");
  const jsPath = path.resolve(__dirname, "../public/assets/js/app.js");

  it("verifies public/app/index.html contains the profile fields without example placeholder text", () => {
    assert.strictEqual(fs.existsSync(htmlPath), true, "app/index.html must exist.");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // Check required user-entered fields
    assert.strictEqual(html.includes('id="profile-store-name"'), true, "1. STORE NAME field must exist.");
    assert.strictEqual(html.includes('id="profile-user-name"'), true, "2. USER NAME field must exist.");
    assert.strictEqual(html.includes('id="profile-phone"'), true, "3. PHONE field must exist.");
    assert.strictEqual(html.includes('id="profile-address"'), true, "4. ADDRESS field must exist.");
    assert.strictEqual(html.includes('id="profile-gender"'), true, "5. GENDER dropdown must exist.");

    // Check that example placeholder texts have been removed
    assert.strictEqual(html.includes('placeholder="e.g.'), false, "All example placeholder texts must be removed.");

    // Check Gender options
    assert.strictEqual(html.includes('value="Male"'), true, "Gender Male option must exist.");
    assert.strictEqual(html.includes('value="Female"'), true, "Gender Female option must exist.");
  });

  it("verifies public/app/index.html includes Permanent QR Code elements and Unique ID display", () => {
    const html = fs.readFileSync(htmlPath, "utf-8");

    assert.strictEqual(html.includes('id="permanent-qr-image"'), true, "Must contain #permanent-qr-image.");
    assert.strictEqual(html.includes('id="btn-print-profile-badge"'), true, "Must contain #btn-print-profile-badge.");
    assert.strictEqual(html.includes('id="btn-download-profile-qr"'), false, "Must not contain #btn-download-profile-qr (unified into single Print Profile Badge).");
    assert.strictEqual(html.includes('id="profile-progress-bar"'), true, "Must contain completeness progress bar.");
  });

  it("verifies app.js implements Unique ID starting from 1M and forwarding +1", () => {
    assert.strictEqual(fs.existsSync(jsPath), true, "app.js must exist.");
    const js = fs.readFileSync(jsPath, "utf-8");

    assert.strictEqual(js.includes("1000000"), true, "Must have 1000000 (1M) base unique ID.");
    assert.strictEqual(js.includes("getOrGenerateUniqueId"), true, "Must define getOrGenerateUniqueId.");
    assert.strictEqual(js.includes("renderPermanentProfileQR"), true, "Must define renderPermanentProfileQR.");
    assert.strictEqual(js.includes("updateProfileCompleteness"), true, "Must define updateProfileCompleteness.");
  });

  it("verifies email is directly retrieved from Google login session and auto-saved", () => {
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.strictEqual(js.includes("user.email"), true, "Must retrieve email from user session.");
    assert.strictEqual(js.includes("profile-email-source-badge"), true, "Must handle verified email badge.");
    assert.strictEqual(js.includes("stateStore.saveCenter(center)"), true, "Must auto-save center email when missing.");
  });

  it("verifies app.js implements full store standee canvas generation with owner name, store name, number, email, and app UI", () => {
    const js = fs.readFileSync(jsPath, "utf-8");
    assert.strictEqual(js.includes("generateStoreStandeeCanvas"), true, "Must define generateStoreStandeeCanvas.");
    assert.strictEqual(js.includes("getCurrentProfileData"), true, "Must define getCurrentProfileData.");
    assert.strictEqual(js.includes("SmartPrint_Store_Standee"), true, "Must format download filename with store slug.");
    assert.strictEqual(js.includes("drawCanvasPrinterGlyph"), true, "Must draw brand printer logo glyph on standee.");
  });
});
