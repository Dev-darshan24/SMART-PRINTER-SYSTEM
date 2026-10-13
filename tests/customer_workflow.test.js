/**
 * Customer Multi-Material Upload, Mobile Camera Scanning & Intelligent Printer Failover Tests
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Customer QR Upload, Mobile Scan & Priority Failover Verification", () => {
  const customerHtmlPath = path.resolve(__dirname, "../public/customer/index.html");
  const customerJsPath = path.resolve(__dirname, "../public/assets/js/customer.js");
  const apiJsPath = path.resolve(__dirname, "../public/assets/js/api.js");
  const appJsPath = path.resolve(__dirname, "../public/assets/js/app.js");
  const trackJsPath = path.resolve(__dirname, "../public/assets/js/track.js");

  it("verifies customer/index.html includes multi-material dropzone and mobile camera scan triggers", () => {
    assert.strictEqual(fs.existsSync(customerHtmlPath), true, "customer/index.html must exist.");
    const html = fs.readFileSync(customerHtmlPath, "utf-8");

    assert.strictEqual(html.includes('id="file-dropzone"'), true, "Must have #file-dropzone.");
    assert.strictEqual(html.includes('id="file-input"'), true, "Must have #file-input.");
    assert.strictEqual(html.includes('multiple'), true, "File input must accept multiple files.");
    assert.strictEqual(html.includes('id="camera-input"'), true, "Must have #camera-input.");
    assert.strictEqual(html.includes('capture="environment"'), true, "Camera input must have capture=environment.");
    assert.strictEqual(html.includes('id="btn-mobile-scan"'), true, "Must have #btn-mobile-scan button.");
    assert.strictEqual(html.includes('id="btn-browse-trigger"'), true, "Must have #btn-browse-trigger button.");
    assert.strictEqual(html.includes('id="file-preview-container"'), true, "Must have #file-preview-container.");
  });

  it("verifies customer/index.html includes print options for copies, B&W/Color, and 1-Sided/2-Sided", () => {
    const html = fs.readFileSync(customerHtmlPath, "utf-8");

    assert.strictEqual(html.includes('id="btn-copies-minus"'), true, "Must have #btn-copies-minus.");
    assert.strictEqual(html.includes('id="copies-display"'), true, "Must have #copies-display.");
    assert.strictEqual(html.includes('id="btn-copies-plus"'), true, "Must have #btn-copies-plus.");
    assert.strictEqual(html.includes('data-color-mode="monochrome"'), true, "Must have B&W color mode option.");
    assert.strictEqual(html.includes('data-color-mode="color"'), true, "Must have Color color mode option.");
    assert.strictEqual(html.includes('data-duplex="false"'), true, "Must have 1-Sided option.");
    assert.strictEqual(html.includes('data-duplex="true"'), true, "Must have 2-Sided option.");
    assert.strictEqual(html.includes('id="paper-size-select"'), true, "Must have #paper-size-select.");
    assert.strictEqual(html.includes('id="estimated-cost-display"'), true, "Must have #estimated-cost-display.");
    assert.strictEqual(html.includes('id="btn-submit-job"'), true, "Must have #btn-submit-job.");
  });

  it("verifies customer.js supports multiple materials and mobile camera document scanning", () => {
    const js = fs.readFileSync(customerJsPath, "utf-8");

    assert.strictEqual(js.includes("selectedMaterials"), true, "customer.js must manage selectedMaterials array.");
    assert.strictEqual(js.includes("setupUploadAndScanner"), true, "customer.js must define setupUploadAndScanner.");
    assert.strictEqual(js.includes("handleCameraScanFile"), true, "customer.js must define handleCameraScanFile.");
    assert.strictEqual(js.includes("handleFilesAddition"), true, "customer.js must define handleFilesAddition.");
    assert.strictEqual(js.includes("renderMaterialsList"), true, "customer.js must define renderMaterialsList.");
    assert.strictEqual(js.includes("btn-remove-material"), true, "customer.js must handle removing individual materials.");
    assert.strictEqual(js.includes("btn-clear-all-materials"), true, "customer.js must handle clearing all materials.");
    assert.strictEqual(js.includes("getTotalPages"), true, "customer.js must calculate total pages across all materials.");
    assert.strictEqual(js.includes("isCameraScan"), true, "customer.js must identify mobile camera scans.");
  });

  it("verifies api.js handles multiple materials and mobile scan metadata in submitPrintJob", () => {
    const js = fs.readFileSync(apiJsPath, "utf-8");

    assert.strictEqual(js.includes("submitPrintJob"), true, "api.js must define submitPrintJob.");
    assert.strictEqual(js.includes("filesSummary"), true, "api.js must structure filesSummary.");
    assert.strictEqual(js.includes("fileCount"), true, "api.js must save fileCount on job.");
    assert.strictEqual(js.includes("isCameraScan"), true, "api.js must store isCameraScan flag.");
    assert.strictEqual(js.includes("totalEstimatedPages"), true, "api.js must calculate totalEstimatedPages.");
  });

  it("verifies app.js executes intelligent printer priority routing and automatic failover for B&W and Color", () => {
    const js = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(js.includes("action-print-btn"), true, "app.js must handle action-print-btn.");
    assert.strictEqual(js.includes("printerRouting"), true, "app.js must access printerRouting.");
    assert.strictEqual(js.includes("bwPriority"), true, "app.js must read bwPriority list.");
    assert.strictEqual(js.includes("colorPriority"), true, "app.js must read colorPriority list.");
    assert.strictEqual(js.includes("isPrinterAvailable"), true, "app.js must define isPrinterAvailable checker.");
    assert.strictEqual(js.includes("isFailover"), true, "app.js must track failover status.");
    assert.strictEqual(js.includes("autoFailover"), true, "app.js must honor autoFailover setting.");
    assert.strictEqual(js.includes("Routing to Priority 1 Printer:"), true, "app.js must route to Priority 1 printer.");
    assert.strictEqual(js.includes("Auto-failing over to Priority 2:"), true, "app.js must notify failover to Priority 2.");
    assert.strictEqual(js.includes("routedPrinter"), true, "app.js must store routedPrinter on job.");
    assert.strictEqual(js.includes("priorityLevel"), true, "app.js must store priorityLevel on job.");
  });

  it("verifies track.js displays multiple materials count and routed device with failover status", () => {
    const js = fs.readFileSync(trackJsPath, "utf-8");

    assert.strictEqual(js.includes("fileCount"), true, "track.js must show fileCount.");
    assert.strictEqual(js.includes("routedPrinter"), true, "track.js must show routedPrinter.");
    assert.strictEqual(js.includes("Failover"), true, "track.js must show Failover pill when applicable.");
  });
});
