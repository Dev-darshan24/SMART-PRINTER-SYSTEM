/**
 * Slide Bar, Claude/ChatGPT Toggle Icon & Dark/Light Theme Test Specification
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Slide Bar & Navigation Layout Verification", () => {
  const htmlPath = path.resolve(__dirname, "../public/app/index.html");
  const cssPath = path.resolve(__dirname, "../public/assets/css/dashboard.css");
  const tokensPath = path.resolve(__dirname, "../public/assets/css/tokens.css");
  const jsPath = path.resolve(__dirname, "../public/assets/js/app.js");

  it("verifies public/app/index.html contains slide bar with 4 required items", () => {
    assert.strictEqual(fs.existsSync(htmlPath), true, "app/index.html must exist.");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // Check slide bar container
    assert.strictEqual(html.includes('id="app-sidebar"'), true, "Must have #app-sidebar.");
    assert.strictEqual(html.includes('id="sidebar-hide-btn"'), true, "Must have #sidebar-hide-btn.");
    assert.strictEqual(html.includes('id="sidebar-toggle-btn"'), true, "Must have #sidebar-toggle-btn.");
    assert.strictEqual(html.includes('id="sidebar-backdrop"'), true, "Must have #sidebar-backdrop.");

    // Check the 4 items in slide bar
    assert.strictEqual(html.includes('data-view="dashboard"'), true, "Item 1: Must have dashboard tab.");
    assert.strictEqual(html.includes('data-view="history"'), true, "Item 2: Must have history tab.");
    assert.strictEqual(html.includes('data-view="settings"'), true, "Item 3: Must have settings tab.");
    assert.strictEqual(html.includes('data-view="profile"'), true, "Item 4: Must have profile tab.");

    // Check corresponding views
    assert.strictEqual(html.includes('id="view-dashboard"'), true, "Must contain #view-dashboard.");
    assert.strictEqual(html.includes('id="view-history"'), true, "Must contain #view-history.");
    assert.strictEqual(html.includes('id="view-settings"'), true, "Must contain #view-settings.");
    assert.strictEqual(html.includes('id="view-profile"'), true, "Must contain #view-profile.");
  });

  it("verifies sidebar toggle buttons use the Claude/ChatGPT panel-left icon for single click hide/expose", () => {
    const html = fs.readFileSync(htmlPath, "utf-8");
    // Verify panel-left icon with split sidebar vertical line M9 3v18
    assert.strictEqual(html.includes('d="M9 3v18"'), true, "Must use Claude/ChatGPT style panel-left SVG icon.");
  });

  it("verifies small dark/light theme button on top right side and theme switching logic", () => {
    const html = fs.readFileSync(htmlPath, "utf-8");
    const js = fs.readFileSync(jsPath, "utf-8");
    const tokens = fs.readFileSync(tokensPath, "utf-8");
    const css = fs.readFileSync(cssPath, "utf-8");

    // HTML elements
    assert.strictEqual(html.includes('id="theme-toggle-btn"'), true, "Must have #theme-toggle-btn on top right.");
    assert.strictEqual(html.includes('id="theme-icon-sun"'), true, "Must have Sun icon.");
    assert.strictEqual(html.includes('id="theme-icon-moon"'), true, "Must have Moon icon.");

    // JS theme switching
    assert.strictEqual(js.includes("applyTheme"), true, "Must define applyTheme.");
    assert.strictEqual(js.includes("smartprint_theme"), true, "Must persist theme to smartprint_theme.");
    assert.strictEqual(js.includes('data-theme'), true, "Must toggle data-theme attribute.");

    // CSS Dark Mode tokens & styles
    assert.strictEqual(tokens.includes('[data-theme="dark"]'), true, "tokens.css must define [data-theme='dark'].");
    assert.strictEqual(css.includes(".theme-toggle-btn"), true, "dashboard.css must style .theme-toggle-btn.");
    assert.strictEqual(css.includes('[data-theme="dark"]'), true, "dashboard.css must contain dark theme overrides.");
  });

  it("verifies dashboard.css defines left side slide hide and expose transition rules", () => {
    assert.strictEqual(fs.existsSync(cssPath), true, "dashboard.css must exist.");
    const css = fs.readFileSync(cssPath, "utf-8");

    assert.strictEqual(css.includes(".app-sidebar.sidebar-hidden"), true, "Must style .sidebar-hidden.");
    assert.strictEqual(css.includes(".btn-sidebar-toggle"), true, "Must style .btn-sidebar-toggle.");
    assert.strictEqual(css.includes(".sidebar-hide-btn"), true, "Must style .sidebar-hide-btn.");
    assert.strictEqual(css.includes(".sidebar-backdrop"), true, "Must style .sidebar-backdrop.");
    assert.strictEqual(css.includes(".app-sidebar:not(.sidebar-hidden) ~ .app-main .btn-sidebar-toggle"), true, "Must hide topbar toggle button when sidebar is open so it is only used 1 time.");
    assert.strictEqual(css.includes(".app-layout"), true, "Must style .app-layout.");
    assert.strictEqual(css.includes("overflow: hidden;"), true, "Must lock .app-layout to prevent sidebar from scrolling.");
  });

  it("verifies app.js handles slide bar toggling and tab navigation", () => {
    assert.strictEqual(fs.existsSync(jsPath), true, "app.js must exist.");
    const js = fs.readFileSync(jsPath, "utf-8");

    assert.strictEqual(js.includes("sidebarToggleBtn"), true, "Must bind sidebar toggle button.");
    assert.strictEqual(js.includes("exposeSidebar"), true, "Must have exposeSidebar function.");
    assert.strictEqual(js.includes("hideSidebar"), true, "Must have hideSidebar function.");
    assert.strictEqual(js.includes("switchView"), true, "Must implement switchView.");
  });

  it("verifies Analytics section in sidebar, timeframe filters, graphs, comparisons and detail table", () => {
    const html = fs.readFileSync(htmlPath, "utf-8");
    const js = fs.readFileSync(jsPath, "utf-8");
    const css = fs.readFileSync(cssPath, "utf-8");

    // Sidebar navigation & View container
    assert.strictEqual(html.includes('id="nav-btn-analytics"'), true, "Must have #nav-btn-analytics in sidebar.");
    assert.strictEqual(html.includes('data-view="analytics"'), true, "Must have data-view='analytics'.");
    assert.strictEqual(html.includes('id="view-analytics"'), true, "Must have #view-analytics container.");
    assert.strictEqual(html.includes('id="analytics-content-view"'), true, "Must have #analytics-content-view.");

    // Timeframe filter tabs in Analytics section
    assert.strictEqual(html.includes('class="filter-tab analytics-filter-btn'), true, "Must have analytics filter buttons.");
    assert.strictEqual(html.includes('data-range="today"'), true, "Must include Today filter.");
    assert.strictEqual(html.includes('data-range="7days"'), true, "Must include 7 Days filter.");
    assert.strictEqual(html.includes('data-range="30days"'), true, "Must include 30 Days filter.");
    assert.strictEqual(html.includes('data-range="3months"'), true, "Must include 3 Months filter.");
    assert.strictEqual(html.includes('data-range="6months"'), true, "Must include 6 Months filter.");
    assert.strictEqual(html.includes('data-range="1year"'), true, "Must include Year Cycle filter.");

    // JavaScript logic
    assert.strictEqual(js.includes("currentAnalyticsRange"), true, "Must track currentAnalyticsRange state.");
    assert.strictEqual(js.includes("renderAnalyticsSection"), true, "Must implement renderAnalyticsSection.");
    assert.strictEqual(js.includes("analytics-kpi-grid"), true, "Must render KPI grid.");
    assert.strictEqual(js.includes("Total Revenue"), true, "Must calculate and display Total Revenue.");
    assert.strictEqual(js.includes("Color vs Monochrome"), true, "Must compare Color vs Monochrome.");
    assert.strictEqual(js.includes("1-Sided vs Duplex"), true, "Must compare 1-Sided vs Duplex.");
    assert.strictEqual(js.includes("analytics-detail-table"), true, "Must render full detail analytics table.");

    // CSS styling
    assert.strictEqual(css.includes(".analytics-kpi-grid"), true, "Must define .analytics-kpi-grid in CSS.");
    assert.strictEqual(css.includes(".analytics-comparisons-grid"), true, "Must define .analytics-comparisons-grid in CSS.");
    assert.strictEqual(css.includes(".comparison-meter-track"), true, "Must define .comparison-meter-track in CSS.");
  });

  it("verifies separate HTML files exist for each section on the slide bar with proper navigation links", () => {
    const pages = [
      { file: "history.html", view: "history", viewId: "view-history" },
      { file: "analytics.html", view: "analytics", viewId: "view-analytics" },
      { file: "settings.html", view: "settings", viewId: "view-settings" },
      { file: "profile.html", view: "profile", viewId: "view-profile" },
      { file: "dashboard.html", view: "dashboard", viewId: "view-dashboard" }
    ];

    pages.forEach(({ file, view, viewId }) => {
      const pagePath = path.resolve(__dirname, `../public/app/${file}`);
      assert.strictEqual(fs.existsSync(pagePath), true, `Dedicated file public/app/${file} must exist.`);
      const content = fs.readFileSync(pagePath, "utf-8");

      // Verify sidebar presence & navigation links
      assert.strictEqual(content.includes('id="app-sidebar"'), true, `${file} must contain #app-sidebar.`);
      assert.strictEqual(content.includes('href="/app/index.html"'), true, `${file} must link to Dashboard.`);
      assert.strictEqual(content.includes('href="/app/history.html"'), true, `${file} must link to History.`);
      assert.strictEqual(content.includes('href="/app/analytics.html"'), true, `${file} must link to Analytics.`);
      assert.strictEqual(content.includes('href="/app/settings.html"'), true, `${file} must link to Settings.`);
      assert.strictEqual(content.includes('href="/app/profile.html"'), true, `${file} must link to Profile.`);

      // Verify active tab & view container
      assert.strictEqual(content.includes(`id="${viewId}"`), true, `${file} must contain #${viewId}.`);
      assert.strictEqual(content.includes('id="logout-btn"'), true, `${file} must contain #logout-btn in sidebar footer.`);
      assert.strictEqual(content.includes('id="theme-toggle-btn"'), true, `${file} must contain #theme-toggle-btn in topbar.`);
      assert.strictEqual(content.includes('id="store-status-btn"'), true, `${file} must contain #store-status-btn on navbar.`);
      assert.strictEqual(content.includes('id="store-status-text"'), true, `${file} must contain #store-status-text on navbar.`);
    });
  });

  it("verifies store open/closed status button exists on navbar and handles store status toggling", () => {
    const js = fs.readFileSync(jsPath, "utf-8");
    const css = fs.readFileSync(cssPath, "utf-8");

    // CSS styles
    assert.strictEqual(css.includes(".store-status-btn"), true, "dashboard.css must style .store-status-btn.");
    assert.strictEqual(css.includes(".store-status-dot"), true, "dashboard.css must style .store-status-dot.");
    assert.strictEqual(css.includes(".store-status-btn.open"), true, "dashboard.css must style .store-status-btn.open.");
    assert.strictEqual(css.includes(".store-status-btn.closed"), true, "dashboard.css must style .store-status-btn.closed.");
    assert.strictEqual(css.includes("storeDotPulse"), true, "dashboard.css must define storeDotPulse animation for open status.");

    // JS functions
    assert.strictEqual(js.includes("updateStoreStatusUI"), true, "app.js must define updateStoreStatusUI.");
    assert.strictEqual(js.includes("getStoreStatus"), true, "app.js must define getStoreStatus.");
    assert.strictEqual(js.includes("setStoreStatus"), true, "app.js must define setStoreStatus.");
    assert.strictEqual(js.includes("initStoreStatusToggle"), true, "app.js must define initStoreStatusToggle.");
    assert.strictEqual(js.includes("smartprint_store_status"), true, "app.js must persist status to localStorage.");
  });
});


