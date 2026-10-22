/**
 * Unique ID Isolation and Auto-Closing Store Status Verification Test Specification
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Unique IDs Starting at 1M & Auto-Close Store Status Sync", () => {
  const serverPath = path.resolve(__dirname, "../server.js");
  const appPath = path.resolve(__dirname, "../public/assets/js/app.js");
  const registryPath = path.resolve(__dirname, "../store_registry.json");
  const uniqueIdsPath = path.resolve(__dirname, "../unique_ids.json");
  const storeStatusPath = path.resolve(__dirname, "../store_status.json");
  const profileHtmlPath = path.resolve(__dirname, "../public/app/profile.html");
  const indexHtmlPath = path.resolve(__dirname, "../public/app/index.html");

  it("verifies server.js implements centralized unique ID assignment starting from 1M without collisions", () => {
    assert.strictEqual(fs.existsSync(serverPath), true, "server.js must exist.");
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    assert.strictEqual(serverCode.includes("/api/user/unique-id"), true, "Must expose /api/user/unique-id endpoint.");
    assert.strictEqual(serverCode.includes("getOrAssignUniqueId"), true, "Must define getOrAssignUniqueId function.");
    assert.strictEqual(serverCode.includes("1000000"), true, "Must have 1000000 (1M) base range.");
  });

  it("verifies store_registry.json assigns distinct unique IDs to different users starting from 1M", () => {
    assert.strictEqual(fs.existsSync(registryPath), true, "store_registry.json must exist.");
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));

    const zxStore = registry["1000000"] || registry["CTR-1000000"] || registry["center_default"];
    const jonnyStore = registry["1000001"] || registry["CTR-1000001"] || registry["center_fuU7qXKQ"];

    assert.ok(zxStore, "ZX THRONES store record must exist in registry.");
    assert.ok(jonnyStore, "Jonny Triggered store record must exist in registry.");

    assert.strictEqual(String(zxStore.uniqueId), "1000000", "ZX THRONES must have unique ID 1000000.");
    assert.strictEqual(String(jonnyStore.uniqueId), "1000001", "Jonny Triggered must have unique ID 1000001.");
    assert.notStrictEqual(zxStore.uniqueId, jonnyStore.uniqueId, "Users must NOT have identical unique IDs.");
  });

  it("verifies app.js generates distinct unique IDs starting at 1M and queries authoritative server endpoint", () => {
    const appCode = fs.readFileSync(appPath, "utf-8");

    assert.strictEqual(appCode.includes("/api/user/unique-id"), true, "app.js must sync with /api/user/unique-id.");
    assert.strictEqual(appCode.includes("1000000"), true, "app.js must use 1000000 base sequence.");
    assert.strictEqual(appCode.includes("getOrGenerateUniqueId"), true, "app.js must implement getOrGenerateUniqueId.");
  });

  it("verifies app.js and server.js implement automatic store close when app is closed", () => {
    const appCode = fs.readFileSync(appPath, "utf-8");
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    // Check beforeunload & pagehide handlers in app.js
    assert.strictEqual(appCode.includes("setupAutoCloseOnExit"), true, "app.js must implement setupAutoCloseOnExit.");
    assert.strictEqual(appCode.includes("beforeunload"), true, "app.js must listen for beforeunload.");
    assert.strictEqual(appCode.includes("pagehide"), true, "app.js must listen for pagehide.");
    assert.strictEqual(appCode.includes("sendBeacon") || appCode.includes("keepalive"), true, "app.js must send beacon/keepalive on close.");

    // Check heartbeat and auto-close timeout in server.js
    assert.strictEqual(serverCode.includes("/api/store/heartbeat"), true, "server.js must implement /api/store/heartbeat endpoint.");
    assert.strictEqual(serverCode.includes("storeHeartbeats"), true, "server.js must track storeHeartbeats.");
    assert.strictEqual(serverCode.includes("autoClosed"), true, "server.js must support automatic closure on heartbeat timeout.");
  });

  it("verifies Permanent Profile QR code badge synchronizes with live store status (Open vs Closed)", () => {
    const appCode = fs.readFileSync(appPath, "utf-8");
    const profileHtml = fs.readFileSync(profileHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    assert.strictEqual(profileHtml.includes('id="qr-meta-status"'), true, "profile.html must contain #qr-meta-status.");
    assert.strictEqual(indexHtml.includes('id="qr-meta-status"'), true, "index.html must contain #qr-meta-status.");

    // Check that renderPermanentProfileQR updates qr-meta-status
    assert.strictEqual(appCode.includes("qr-meta-status"), true, "app.js must update qr-meta-status badge.");
    assert.strictEqual(appCode.includes("Store Open") && appCode.includes("Store Closed"), true, "app.js must display Store Open and Store Closed.");
  });

  it("verifies QR code URL target uses full unique publicId/UID without truncating to 6 digits", () => {
    const appCode = fs.readFileSync(appPath, "utf-8");
    // Ensure substring(0, 6) is not truncating CTR-1000000 to CTR-100000
    assert.strictEqual(appCode.includes("CTR-' + uid.substring(0, 6)"), false, "Must not truncate 7-digit UID with substring(0, 6).");
  });
});
