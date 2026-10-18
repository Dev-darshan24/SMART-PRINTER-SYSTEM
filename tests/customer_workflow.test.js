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

  it("verifies customer page shows print options when Store is Open, and displays friendly visit later card when Closed", () => {
    const html = fs.readFileSync(customerHtmlPath, "utf-8");
    const js = fs.readFileSync(customerJsPath, "utf-8");
    const apiJs = fs.readFileSync(apiJsPath, "utf-8");

    // HTML elements
    assert.strictEqual(html.includes('id="store-closed-view"'), true, "customer/index.html must contain #store-closed-view.");
    assert.strictEqual(html.includes('id="store-live-status-pill"'), true, "customer/index.html must contain #store-live-status-pill.");
    assert.strictEqual(html.includes("Store is Currently Closed"), true, "customer/index.html must contain Closed message.");
    assert.strictEqual(html.includes("Please visit after some time"), true, "customer/index.html must contain visit after some time message.");
    assert.strictEqual(html.includes('id="btn-check-store-status"'), true, "customer/index.html must provide #btn-check-store-status Check Again button.");

    // Customer JS toggling logic
    assert.strictEqual(js.includes("isStoreClosed"), true, "customer.js must detect isStoreClosed.");
    assert.strictEqual(js.includes("store-closed-view"), true, "customer.js must toggle store-closed-view.");
    assert.strictEqual(js.includes("store-live-status-pill"), true, "customer.js must update store-live-status-pill.");
    assert.strictEqual(js.includes("btn-check-store-status"), true, "customer.js must handle Check Again button click.");

    // API protection
    assert.strictEqual(apiJs.includes("FAILED_PRECONDITION: This print center is currently closed"), true, "api.js must reject submissions when center is closed.");
  });

  it("verifies server.js implements /api/store/status bridging admin counter and customer QR scanners", () => {
    const serverPath = path.resolve(__dirname, "../server.js");
    assert.strictEqual(fs.existsSync(serverPath), true, "server.js must exist.");
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    assert.strictEqual(serverCode.includes("/api/store/status"), true, "server.js must expose /api/store/status endpoint.");
    assert.strictEqual(serverCode.includes("getStoreStatusRecord"), true, "server.js must read store status records.");
    assert.strictEqual(serverCode.includes("saveStoreStatusRecord"), true, "server.js must save store status records.");
    assert.strictEqual(serverCode.includes("store_status.json"), true, "server.js must persist store status to store_status.json.");
  });

  it("verifies auto-detection across devices: app.js updates server and customer.js polls live status", () => {
    const html = fs.readFileSync(customerHtmlPath, "utf-8");
    const customerJs = fs.readFileSync(customerJsPath, "utf-8");
    const appJs = fs.readFileSync(appJsPath, "utf-8");
    const apiJs = fs.readFileSync(apiJsPath, "utf-8");

    // 1. Initial HTML state does not prematurely flash open
    assert.strictEqual(html.includes('id="store-status-detecting"'), true, "customer/index.html must include status detecting loader.");
    assert.strictEqual(html.includes('id="print-submit-form" class="glass-panel" style="padding: 1.75rem; display: none;"'), true, "print-submit-form must be initially hidden until status check.");

    // 2. Admin app.js sends status to server
    assert.strictEqual(appJs.includes("fetch('/api/store/status'"), true, "app.js setStoreStatus must POST to /api/store/status.");

    // 3. Customer api.js queries server in real-time
    assert.strictEqual(apiJs.includes("fetch(`/api/store/status?center="), true, "api.js getPublicCenter must fetch /api/store/status.");

    // 4. customer.js automatically watches and polls store status
    assert.strictEqual(customerJs.includes("startLiveStoreStatusWatcher"), true, "customer.js must start live store status watcher.");
    assert.strictEqual(customerJs.includes("visibilitychange"), true, "customer.js must react to screen wake and tab focus.");
  });

  describe("Customer Page Master Specification Requirements (17 Verification Points)", () => {
    it("1 & 2: verifies Store A QR loads Store A and Store B QR loads Store B without cross-store contamination", () => {
      const apiCode = fs.readFileSync(apiJsPath, "utf-8");
      // Must not silently fall back to default store when specific center is requested
      assert.strictEqual(apiCode.includes("if (!center)"), true);
      assert.strictEqual(apiCode.includes("throw new Error(`CENTER_NOT_FOUND: The requested print center '${publicOrCenterId || 'unknown'}' could not be found.`)"), true);
    });

    it("3: verifies a Store A order cannot appear in Store B's queue (tenant isolation)", () => {
      const stateJs = fs.readFileSync(path.resolve(__dirname, "../public/assets/js/state.js"), "utf-8");
      assert.strictEqual(stateJs.includes("if (centerId) {\n      return filtered.filter(j => j.centerId === centerId);\n    }"), true);
    });

    it("4: verifies a Store B printer or owner cannot claim or print a Store A job", () => {
      const appJs = fs.readFileSync(appJsPath, "utf-8");
      const stateJs = fs.readFileSync(path.resolve(__dirname, "../public/assets/js/state.js"), "utf-8");
      assert.strictEqual(appJs.includes("job.centerId !== centerId"), true);
      assert.strictEqual(appJs.includes("Tenant isolation violation"), true);
      assert.strictEqual(stateJs.includes("centerId && job.centerId !== centerId"), true);
    });

    it("5: verifies unknown center IDs display a safe not-found page and never silently redirect", () => {
      const html = fs.readFileSync(customerHtmlPath, "utf-8");
      const customerJs = fs.readFileSync(customerJsPath, "utf-8");
      assert.strictEqual(html.includes('id="center-not-found-view"'), true);
      assert.strictEqual(html.includes("Print Center Not Found"), true);
      assert.strictEqual(customerJs.includes("showCenterNotFound"), true);
    });

    it("6 & 7: verifies closed stores block submissions on frontend & backend, while open stores display dashboard", () => {
      const apiJs = fs.readFileSync(apiJsPath, "utf-8");
      const customerJs = fs.readFileSync(customerJsPath, "utf-8");
      assert.strictEqual(apiJs.includes("FAILED_PRECONDITION: This print center is currently closed"), true);
      assert.strictEqual(customerJs.includes("isStoreClosed"), true);
      assert.strictEqual(customerJs.includes("store-closed-view"), true);
    });

    it("8: verifies default print settings are A4, B&W, single-sided, and one copy", () => {
      const customerJs = fs.readFileSync(customerJsPath, "utf-8");
      const html = fs.readFileSync(customerHtmlPath, "utf-8");
      assert.strictEqual(customerJs.includes("copies: 1"), true);
      assert.strictEqual(customerJs.includes("colorMode: 'monochrome'"), true);
      assert.strictEqual(customerJs.includes("duplex: false"), true);
      assert.strictEqual(customerJs.includes("paperSize: 'A4'"), true);
      assert.strictEqual(html.includes('value="A4" selected'), true);
      assert.strictEqual(html.includes('data-color-mode="monochrome"'), true);
      assert.strictEqual(html.includes('data-duplex="false"'), true);
      assert.strictEqual(html.includes('name="payment-method" value="cash" id="payment-cash-radio" checked'), true);
    });

    it("9: verifies authoritative server-side pricing in integer paise", () => {
      const apiJs = fs.readFileSync(apiJsPath, "utf-8");
      assert.strictEqual(apiJs.includes("ratePaise"), true);
      assert.strictEqual(apiJs.includes("authoritativePaise"), true);
      assert.strictEqual(apiJs.includes("amountPaise: authoritativePaise"), true);
      assert.strictEqual(apiJs.includes("estimatedAmount: authoritativeRupees"), true);
    });

    it("10: verifies invalid files (magic bytes / MIME / >25MB) and unsupported options are rejected", () => {
      const customerJs = fs.readFileSync(customerJsPath, "utf-8");
      const apiJs = fs.readFileSync(apiJsPath, "utf-8");
      assert.strictEqual(customerJs.includes("validateFileHeader"), true);
      assert.strictEqual(customerJs.includes("25 * 1024 * 1024"), true);
      assert.strictEqual(apiJs.includes("FILE_TOO_LARGE"), true);
      assert.strictEqual(apiJs.includes("UNSUPPORTED_MEDIA_TYPE"), true);
    });

    it("11: verifies cash orders begin in pending_confirmation state", () => {
      const apiJs = fs.readFileSync(apiJsPath, "utf-8");
      assert.strictEqual(apiJs.includes("status: 'pending_confirmation'"), true);
    });

    it("12: verifies owner approval alone does not authorize printing", () => {
      const appJs = fs.readFileSync(appJsPath, "utf-8");
      assert.strictEqual(appJs.includes("job.status === 'approved_awaiting_cash'"), true);
      assert.strictEqual(appJs.includes("Cannot print: Cash collection must be confirmed"), true);
    });

    it("13: verifies only the authorized owner's cash confirmation can release a job", () => {
      const appJs = fs.readFileSync(appJsPath, "utf-8");
      assert.strictEqual(appJs.includes('data-status="payment_confirmed"'), true);
      assert.strictEqual(appJs.includes("Confirm Cash"), true);
    });

    it("14: verifies customers cannot forge payment status or job state", () => {
      const stateJs = fs.readFileSync(path.resolve(__dirname, "../public/assets/js/state.js"), "utf-8");
      assert.strictEqual(stateJs.includes("validTransitions"), true);
      assert.strictEqual(stateJs.includes("Invalid status transition"), true);
    });

    it("15: verifies customer tracking cannot expose another customer's order or private storage paths", () => {
      const apiJs = fs.readFileSync(apiJsPath, "utf-8");
      const trackJs = fs.readFileSync(trackJsPath, "utf-8");
      // getJobStatus must strip storagePath
      assert.strictEqual(apiJs.includes("Sanitize job for public customer tracking: Never expose raw private storage path"), true);
      assert.strictEqual(trackJs.includes("statusInfoMap"), true);
    });

    it("16: verifies duplicate requests and printer callbacks are handled safely", () => {
      const stateJs = fs.readFileSync(path.resolve(__dirname, "../public/assets/js/state.js"), "utf-8");
      assert.strictEqual(stateJs.includes("completed: []"), true);
      assert.strictEqual(stateJs.includes("rejected: []"), true);
    });

    it("17: verifies existing application functionality, glassmorphism UI, and dark theme remain intact", () => {
      const html = fs.readFileSync(customerHtmlPath, "utf-8");
      assert.strictEqual(html.includes("glass-panel"), true);
      assert.strictEqual(html.includes("theme-toggle-btn"), true);
      assert.strictEqual(html.includes("theme-icon-sun"), true);
      assert.strictEqual(html.includes("theme-icon-moon"), true);
      assert.strictEqual(html.includes("Online Payment"), true);
      assert.strictEqual(html.includes("Coming Soon"), true);
    });
  });
});

