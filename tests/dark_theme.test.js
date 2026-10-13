/**
 * Professional Dark Theme Test Specification
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Professional Dark Theme Verification", () => {
  const rootDir = path.resolve(__dirname, "..");
  const tokensCss = fs.readFileSync(path.join(rootDir, "public/assets/css/tokens.css"), "utf8");
  const baseCss = fs.readFileSync(path.join(rootDir, "public/assets/css/base.css"), "utf8");
  const componentsCss = fs.readFileSync(path.join(rootDir, "public/assets/css/components.css"), "utf8");
  const dashboardCss = fs.readFileSync(path.join(rootDir, "public/assets/css/dashboard.css"), "utf8");
  const customerCss = fs.readFileSync(path.join(rootDir, "public/assets/css/customer.css"), "utf8");

  it("verifies tokens.css defines complete dark theme palette with readable primary and semantic tokens", () => {
    assert.strictEqual(tokensCss.includes('[data-theme="dark"]'), true);
    assert.strictEqual(tokensCss.includes("--bg-canvas: #0b0914"), true, "Should use deep obsidian background");
    assert.strictEqual(tokensCss.includes("--primary-700: #c4b5fd"), true, "Primary 700 must be readable light lavender in dark theme");
    assert.strictEqual(tokensCss.includes("--primary-800: #ddd6fe"), true, "Primary 800 must be readable pastel lavender in dark theme");
    assert.strictEqual(tokensCss.includes("--status-submitted"), true);
    assert.strictEqual(tokensCss.includes("--shadow-glass"), true);
  });

  it("verifies base.css applies color-scheme: dark and obsidian ambient radial glow without washed-out light gradients", () => {
    assert.strictEqual(baseCss.includes('html[data-theme="dark"]'), true);
    assert.strictEqual(baseCss.includes("color-scheme: dark"), true);
    assert.strictEqual(baseCss.includes('[data-theme="dark"] body'), true);
    assert.strictEqual(baseCss.includes('[data-theme="dark"] a'), true);
    assert.strictEqual(baseCss.includes('[data-theme="dark"] ::-webkit-scrollbar-thumb'), true);
  });

  it("verifies components.css covers glass panels, buttons, badges, tables, modals, and toasts in dark theme", () => {
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .glass-panel'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .btn-secondary'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .btn-ghost'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .badge-submitted'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .badge-completed'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .form-input'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .table-container'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .modal-card'), true);
    assert.strictEqual(componentsCss.includes('[data-theme="dark"] .toast'), true);
  });

  it("verifies dashboard.css styles sidebar, topbar, active nav items, filter tabs, profile, and analytics in dark theme", () => {
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .app-sidebar'), true);
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .app-topbar'), true);
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .nav-item.active'), true);
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .filter-tabs'), true);
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .theme-toggle-btn'), true);
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .profile-card-main'), true);
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .profile-qr-wrapper'), true);
    assert.strictEqual(dashboardCss.includes('[data-theme="dark"] .analytics-chart-panel'), true);
  });

  it("verifies customer.css styles counter upload shell, dropzone, option cards, counter, and tracking in dark theme", () => {
    assert.strictEqual(customerCss.includes('[data-theme="dark"] .customer-shell'), true);
    assert.strictEqual(customerCss.includes('[data-theme="dark"] .customer-header'), true);
    assert.strictEqual(customerCss.includes('[data-theme="dark"] .dropzone'), true);
    assert.strictEqual(customerCss.includes('[data-theme="dark"] .option-card.selected'), true);
    assert.strictEqual(customerCss.includes('[data-theme="dark"] .tracking-card'), true);
    assert.strictEqual(customerCss.includes('[data-theme="dark"] .step-circle'), true);
  });
});
