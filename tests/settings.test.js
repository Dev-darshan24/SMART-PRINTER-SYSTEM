/**
 * Settings Section Verification Test Specification
 * 1. Per-Page Pricing Rates (₹) - Save, Edit, Update, Presets
 * 2. Connected Printers Status - Real Device Hardware Detection, Scan, Test Slip (NO Demo Printers)
 * 3. Printer Sequence Priority - Dynamic Connected Device Priority Sequence, Summary, Failover
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Settings & Hardware Configuration Verification", () => {
  const settingsHtmlPath = path.resolve(__dirname, "../public/app/settings.html");
  const indexHtmlPath = path.resolve(__dirname, "../public/app/index.html");
  const appJsPath = path.resolve(__dirname, "../public/assets/js/app.js");
  const serverJsPath = path.resolve(__dirname, "../server.js");
  const cssPath = path.resolve(__dirname, "../public/assets/css/dashboard.css");

  it("verifies Per-Page Pricing Rates HTML elements exist in settings.html and index.html", () => {
    assert.strictEqual(fs.existsSync(settingsHtmlPath), true, "settings.html must exist.");
    const settingsHtml = fs.readFileSync(settingsHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    [settingsHtml, indexHtml].forEach((html, idx) => {
      const fileLabel = idx === 0 ? "settings.html" : "index.html";
      assert.strictEqual(html.includes('id="card-pricing-rates"'), true, `${fileLabel} must contain #card-pricing-rates.`);
      assert.strictEqual(html.includes('id="rates-status-badge"'), true, `${fileLabel} must contain #rates-status-badge.`);
      assert.strictEqual(html.includes('id="settings-rates-form"'), true, `${fileLabel} must contain #settings-rates-form.`);
      assert.strictEqual(html.includes('id="rate-bw-single"'), true, `${fileLabel} must contain #rate-bw-single.`);
      assert.strictEqual(html.includes('id="rate-bw-double"'), true, `${fileLabel} must contain #rate-bw-double.`);
      assert.strictEqual(html.includes('id="rate-color-single"'), true, `${fileLabel} must contain #rate-color-single.`);
      assert.strictEqual(html.includes('id="rate-color-double"'), true, `${fileLabel} must contain #rate-color-double.`);
      assert.strictEqual(html.includes('id="btn-edit-rates"'), true, `${fileLabel} must contain #btn-edit-rates.`);
      assert.strictEqual(html.includes('id="btn-save-rates"'), true, `${fileLabel} must contain #btn-save-rates.`);
      assert.strictEqual(html.includes('id="btn-reset-rates"'), true, `${fileLabel} must contain #btn-reset-rates.`);
      assert.strictEqual(html.includes('data-preset="standard"'), true, `${fileLabel} must have standard preset.`);
      assert.strictEqual(html.includes('data-preset="budget"'), true, `${fileLabel} must have budget preset.`);
      assert.strictEqual(html.includes('data-preset="premium"'), true, `${fileLabel} must have premium preset.`);
    });
  });

  it("verifies demo printers are removed and Connected Printers Status container is dynamic", () => {
    const settingsHtml = fs.readFileSync(settingsHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    [settingsHtml, indexHtml].forEach((html, idx) => {
      const fileLabel = idx === 0 ? "settings.html" : "index.html";
      assert.strictEqual(html.includes('id="card-connected-printers"'), true, `${fileLabel} must contain #card-connected-printers.`);
      assert.strictEqual(html.includes('id="printer-count-badge"'), true, `${fileLabel} must contain #printer-count-badge.`);
      assert.strictEqual(html.includes('id="btn-refresh-printers"'), true, `${fileLabel} must contain #btn-refresh-printers.`);
      assert.strictEqual(html.includes('id="printer-scan-time"'), true, `${fileLabel} must contain #printer-scan-time.`);
      assert.strictEqual(html.includes('id="printers-status-list"'), true, `${fileLabel} must contain #printers-status-list.`);

      // Verify NO demo/fake printers are hardcoded into HTML!
      assert.strictEqual(html.includes("HP LaserJet Pro M404dn"), false, `${fileLabel} must NOT contain hardcoded HP demo printer.`);
      assert.strictEqual(html.includes("Epson EcoTank L3250 Series"), false, `${fileLabel} must NOT contain hardcoded Epson demo printer.`);
      assert.strictEqual(html.includes("Canon imageRUNNER 2525"), false, `${fileLabel} must NOT contain hardcoded Canon demo printer.`);
      assert.strictEqual(html.includes("Brother MFC-L8690CDW"), false, `${fileLabel} must NOT contain hardcoded Brother demo printer.`);
    });
  });

  it("verifies server.js implements /api/system/printers endpoint to query real OS devices", () => {
    assert.strictEqual(fs.existsSync(serverJsPath), true, "server.js must exist.");
    const serverCode = fs.readFileSync(serverJsPath, "utf-8");

    assert.strictEqual(serverCode.includes("/api/system/printers"), true, "server.js must define /api/system/printers endpoint.");
    assert.strictEqual(serverCode.includes("getSystemPrinters"), true, "server.js must define getSystemPrinters helper.");
    assert.strictEqual(serverCode.includes("Win32_Printer"), true, "server.js must query Win32_Printer on Windows.");
  });

  it("verifies Printer Sequence Priority HTML elements exist without hardcoded demo options", () => {
    const settingsHtml = fs.readFileSync(settingsHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    [settingsHtml, indexHtml].forEach((html, idx) => {
      const fileLabel = idx === 0 ? "settings.html" : "index.html";
      assert.strictEqual(html.includes('id="card-printer-sequence"'), true, `${fileLabel} must contain #card-printer-sequence.`);
      assert.strictEqual(html.includes('id="priority-rule-summary"'), true, `${fileLabel} must contain #priority-rule-summary.`);
      assert.strictEqual(html.includes('id="printer-priority-form"'), true, `${fileLabel} must contain #printer-priority-form.`);
      assert.strictEqual(html.includes('id="seq-bw-p1"'), true, `${fileLabel} must contain #seq-bw-p1.`);
      assert.strictEqual(html.includes('id="seq-bw-p2"'), true, `${fileLabel} must contain #seq-bw-p2.`);
      assert.strictEqual(html.includes('id="seq-bw-p3"'), true, `${fileLabel} must contain #seq-bw-p3.`);
      assert.strictEqual(html.includes('id="seq-color-p1"'), true, `${fileLabel} must contain #seq-color-p1.`);
      assert.strictEqual(html.includes('id="seq-color-p2"'), true, `${fileLabel} must contain #seq-color-p2.`);
      assert.strictEqual(html.includes('id="seq-color-p3"'), true, `${fileLabel} must contain #seq-color-p3.`);
      assert.strictEqual(html.includes('id="seq-auto-failover"'), true, `${fileLabel} must contain #seq-auto-failover.`);
      assert.strictEqual(html.includes('id="seq-auto-duplex-match"'), true, `${fileLabel} must contain #seq-auto-duplex-match.`);
      assert.strictEqual(html.includes('id="btn-save-printer-priority"'), true, `${fileLabel} must contain #btn-save-printer-priority.`);
    });
  });

  it("verifies app.js implements rates save, edit, presets, reset, and Firestore synchronization", () => {
    assert.strictEqual(fs.existsSync(appJsPath), true, "app.js must exist.");
    const js = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(js.includes("btnEditRates"), true, "app.js must handle btnEditRates.");
    assert.strictEqual(js.includes("rates-preset-btn"), true, "app.js must handle rates-preset-btn.");
    assert.strictEqual(js.includes("btnResetRates"), true, "app.js must handle btnResetRates.");
    assert.strictEqual(js.includes("ratesStatusBadge"), true, "app.js must update ratesStatusBadge.");
    assert.strictEqual(js.includes("Editing Rates..."), true, "app.js must show 'Editing Rates...'.");
    assert.strictEqual(js.includes("Live Rates"), true, "app.js must show 'Live Rates'.");
    assert.strictEqual(js.includes("Unsaved Changes"), true, "app.js must track unsaved changes.");
    assert.strictEqual(js.includes("stateStore.saveCenter"), true, "app.js must save rates to stateStore.");
    assert.strictEqual(js.includes("rates: newRates"), true, "app.js must save newRates object.");
  });

  it("verifies app.js queries real devices via /api/system/printers, handles empty device state, and generates test slips", () => {
    const js = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(js.includes("/api/system/printers"), true, "app.js must fetch /api/system/printers.");
    assert.strictEqual(js.includes("fetchAndRenderConnectedPrinters"), true, "app.js must define fetchAndRenderConnectedPrinters.");
    assert.strictEqual(js.includes("renderConnectedPrinters"), true, "app.js must define renderConnectedPrinters.");
    assert.strictEqual(js.includes("No Printers Connected to this Device"), true, "app.js must display clean empty state when no printers connected.");
    assert.strictEqual(js.includes("triggerPrinterTestSlip"), true, "app.js must define triggerPrinterTestSlip.");
    assert.strictEqual(js.includes("SMARTPRINT WORKSTATION TEST SLIP"), true, "Test slip must include workstation header.");
  });

  it("verifies app.js dynamically populates sequence priority dropdowns with real connected devices", () => {
    const js = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(js.includes("populatePrinterSequenceDropdowns"), true, "app.js must define populatePrinterSequenceDropdowns.");
    assert.strictEqual(js.includes("updatePrioritySummaryBadge"), true, "app.js must define updatePrioritySummaryBadge.");
    assert.strictEqual(js.includes("printerPriorityForm"), true, "app.js must handle printerPriorityForm submission.");
    assert.strictEqual(js.includes("printerRouting"), true, "app.js must structure printerRouting configuration.");
    assert.strictEqual(js.includes("bwPriority"), true, "app.js must store bwPriority list.");
    assert.strictEqual(js.includes("colorPriority"), true, "app.js must store colorPriority list.");
    assert.strictEqual(js.includes("Routing to Priority 1 Printer:"), true, "Print jobs must route to owner's Priority 1 printer.");

    // Strict hardware-only connection assertions:
    assert.strictEqual(js.includes("(Saved Device)"), false, "app.js must NOT inject phantom (Saved Device) options when hardware is disconnected.");
    assert.strictEqual(js.includes("isSelectedConnected"), true, "buildPrinterOptionsHtml must verify device is connected.");
    assert.strictEqual(js.includes("No printer connected to device"), true, "Dropdown must display 'No printer connected to device' when disconnected.");
  });

  it("verifies dashboard.css defines styling for printer cards, status dots, and sequence grid", () => {
    assert.strictEqual(fs.existsSync(cssPath), true, "dashboard.css must exist.");
    const css = fs.readFileSync(cssPath, "utf-8");

    assert.strictEqual(css.includes(".printer-devices-grid"), true, "Must style .printer-devices-grid.");
    assert.strictEqual(css.includes(".printer-device-card"), true, "Must style .printer-device-card.");
    assert.strictEqual(css.includes(".printer-status-pill"), true, "Must style .printer-status-pill.");
    assert.strictEqual(css.includes(".status-dot-pulse"), true, "Must style .status-dot-pulse.");
    assert.strictEqual(css.includes(".priority-sequence-grid"), true, "Must style .priority-sequence-grid.");
    assert.strictEqual(css.includes(".priority-column-card"), true, "Must style .priority-column-card.");
    assert.strictEqual(css.includes(".rates-preset-btn"), true, "Must style .rates-preset-btn.");
    assert.strictEqual(css.includes(".spin-icon"), true, "Must define .spin-icon animation.");
  });

  it("verifies Store QR Standee, Queue Preferences, and Subscription cards are REMOVED from settings views", () => {
    const settingsHtml = fs.readFileSync(settingsHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    // The settings view in index.html is between id="view-settings" and id="view-profile"
    const settingsSectionIndex = indexHtml.split('id="view-settings"')[1].split('id="view-profile"')[0];

    [settingsHtml, settingsSectionIndex].forEach((html, idx) => {
      const fileLabel = idx === 0 ? "settings.html" : "index.html (#view-settings)";
      assert.strictEqual(html.includes("Store QR Standee & Submission Link"), false, `${fileLabel} must NOT contain Store QR Standee card.`);
      assert.strictEqual(html.includes("Queue & Printer Preferences"), false, `${fileLabel} must NOT contain Queue & Printer Preferences card.`);
      assert.strictEqual(html.includes("Center Subscription"), false, `${fileLabel} must NOT contain Center Subscription card.`);
    });
  });

  it("verifies settings auto-save and update on change as well as form submit", () => {
    const js = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(js.includes("saveRatesSettings"), true, "app.js must define saveRatesSettings.");
    assert.strictEqual(js.includes("savePrinterPrioritySettings"), true, "app.js must define savePrinterPrioritySettings.");
    assert.strictEqual(js.includes("input.addEventListener('change'"), true, "app.js must auto-save rates on input change.");
    assert.strictEqual(js.includes("el.addEventListener('change'"), true, "app.js must auto-save printer sequence priority on dropdown change.");
  });

  it("verifies server.js and app.js filter out virtual software spoolers and classify external Xerox/store hardware devices", () => {
    const serverCode = fs.readFileSync(serverJsPath, "utf-8");
    const js = fs.readFileSync(appJsPath, "utf-8");

    // Verify virtual printer filtering in server.js
    assert.strictEqual(serverCode.includes("isVirtualPrinterDevice"), true, "server.js must define isVirtualPrinterDevice.");
    assert.strictEqual(serverCode.includes("classifyPrinterDevice"), true, "server.js must define classifyPrinterDevice.");
    assert.strictEqual(serverCode.includes("detectConnectionInterface"), true, "server.js must define detectConnectionInterface.");
    assert.strictEqual(serverCode.includes("external_hardware_only"), true, "server.js /api/system/printers must mark external_hardware_only.");

    // Verify app.js filters out virtual printers and handles hardware categories
    assert.strictEqual(js.includes("getPrinterSvgForType"), true, "app.js must define getPrinterSvgForType.");
    assert.strictEqual(js.includes("!p.isVirtual"), true, "app.js must exclude virtual printers.");
  });

  it("verifies multi-printer priority sequence configuration, dynamic add buttons, priority reordering, and failover beyond 3 printers", () => {
    const settingsHtml = fs.readFileSync(settingsHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
    const js = fs.readFileSync(appJsPath, "utf-8");
    const css = fs.readFileSync(cssPath, "utf-8");

    [settingsHtml, indexHtml].forEach((html, idx) => {
      const fileLabel = idx === 0 ? "settings.html" : "index.html";
      assert.strictEqual(html.includes('id="bw-priority-steps-list"'), true, `${fileLabel} must contain #bw-priority-steps-list.`);
      assert.strictEqual(html.includes('id="color-priority-steps-list"'), true, `${fileLabel} must contain #color-priority-steps-list.`);
      assert.strictEqual(html.includes('id="btn-add-bw-printer"'), true, `${fileLabel} must contain #btn-add-bw-printer.`);
      assert.strictEqual(html.includes('id="btn-add-color-printer"'), true, `${fileLabel} must contain #btn-add-color-printer.`);
      assert.strictEqual(html.includes("btn-move-up"), true, `${fileLabel} must contain .btn-move-up buttons.`);
      assert.strictEqual(html.includes("btn-move-down"), true, `${fileLabel} must contain .btn-move-down buttons.`);
      assert.strictEqual(html.includes("btn-remove-step"), true, `${fileLabel} must contain .btn-remove-step buttons.`);
    });

    // Check CSS
    assert.strictEqual(css.includes(".priority-steps-list"), true, "dashboard.css must style .priority-steps-list.");
    assert.strictEqual(css.includes(".btn-priority-nav"), true, "dashboard.css must style .btn-priority-nav.");
    assert.strictEqual(css.includes(".btn-add-printer-seq"), true, "dashboard.css must style .btn-add-printer-seq.");

    // Check JS functions for multi-printer and re-ordering
    assert.strictEqual(js.includes("addPriorityStep"), true, "app.js must define addPriorityStep.");
    assert.strictEqual(js.includes("movePriorityStep"), true, "app.js must define movePriorityStep.");
    assert.strictEqual(js.includes("removePriorityStep"), true, "app.js must define removePriorityStep.");
    assert.strictEqual(js.includes("reindexPrioritySteps"), true, "app.js must define reindexPrioritySteps.");
    assert.strictEqual(js.includes("btn-add-bw-printer"), true, "app.js must wire up btn-add-bw-printer.");
    assert.strictEqual(js.includes("btn-add-color-printer"), true, "app.js must wire up btn-add-color-printer.");
  });

  it("verifies settings persist per-user across page refreshes and options are preserved without defaulting", () => {
    const js = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(js.includes("restoreUserSettings"), true, "app.js must define restoreUserSettings.");
    assert.strictEqual(js.includes("buildPrinterOptionsHtml"), true, "app.js must define buildPrinterOptionsHtml.");
    assert.strictEqual(js.includes("smartprint_rates_"), true, "app.js must isolate rates in localStorage per user/center.");
    assert.strictEqual(js.includes("smartprint_routing_"), true, "app.js must isolate routing in localStorage per user/center.");
    assert.strictEqual(js.includes("STORE_HARDWARE_PRESETS"), true, "app.js must include store hardware presets for printer selection.");
  });

  it("verifies all demo data is removed from printer sequence and filtered from state, storage, and UI", () => {
    const js = fs.readFileSync(appJsPath, "utf-8");
    const stateJs = fs.readFileSync(path.resolve(__dirname, "../public/assets/js/state.js"), "utf-8");
    const settingsHtml = fs.readFileSync(settingsHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    // 1. Both app.js and state.js define demo printer filter and clean routing utilities
    assert.strictEqual(js.includes("DEMO_PRINTER_NAMES"), true, "app.js must define DEMO_PRINTER_NAMES.");
    assert.strictEqual(js.includes("isDemoPrinterName"), true, "app.js must define isDemoPrinterName helper.");
    assert.strictEqual(js.includes("cleanPrinterRouting"), true, "app.js must define cleanPrinterRouting helper.");
    assert.strictEqual(stateJs.includes("DEMO_PRINTER_NAMES"), true, "state.js must define DEMO_PRINTER_NAMES.");
    assert.strictEqual(stateJs.includes("cleanPrinterRouting"), true, "state.js must define cleanPrinterRouting helper.");

    // 2. Demo printers must not be injected in printer options HTML
    assert.strictEqual(js.includes("!isDemoPrinterName(selectedPrinterName)"), true, "buildPrinterOptionsHtml must reject demo printer names.");

    // 3. Neither settings.html nor index.html contains any demo printer options in printer sequence card
    const demoPrinters = [
      "HP LaserJet Pro M404dn",
      "Epson EcoTank L3250 Series",
      "Canon imageRUNNER 2525",
      "Brother MFC-L8690CDW",
      "Ricoh Aficio MP 2014",
      "Konica Minolta bizhub 225i",
      "TVS MSP 240 Star"
    ];

    [settingsHtml, indexHtml].forEach((html, idx) => {
      const fileLabel = idx === 0 ? "settings.html" : "index.html";
      const seqSection = html.split('id="card-printer-sequence"')[1]?.split('</form>')[0] || "";
      demoPrinters.forEach(dp => {
        assert.strictEqual(seqSection.includes(dp), false, `${fileLabel} sequence priority card must NOT contain demo printer ${dp}.`);
      });
    });

    // 4. In app.js, priority sequences filter out demo names on save and restore
    assert.strictEqual(js.includes("!isDemoPrinterName(p)"), true, "savePrinterPrioritySettings must filter out demo printer names.");
  });
});



