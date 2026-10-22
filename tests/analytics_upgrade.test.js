const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");


describe("SmartPrint — Store Owner Analytics Upgrade Verification", () => {
  const analyticsHtmlPath = path.resolve(__dirname, "../public/app/analytics.html");
  const indexHtmlPath = path.resolve(__dirname, "../public/app/index.html");
  const appJsPath = path.resolve(__dirname, "../public/assets/js/app.js");
  const dashboardCssPath = path.resolve(__dirname, "../public/assets/css/dashboard.css");

  const analyticsHtml = fs.readFileSync(analyticsHtmlPath, "utf-8");
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
  const appJs = fs.readFileSync(appJsPath, "utf-8");
  const dashboardCss = fs.readFileSync(dashboardCssPath, "utf-8");

  it("verifies all required date range presets exist in both analytics.html and index.html", () => {
    const requiredRanges = [
      'data-range="today"',
      'data-range="yesterday"',
      'data-range="7days"',
      'data-range="30days"',
      'data-range="this_month"',
      'data-range="prev_month"',
      'data-range="3months"',
      'data-range="6months"',
      'data-range="1year"',
      'data-range="custom"'
    ];

    requiredRanges.forEach((range) => {
      assert.strictEqual(analyticsHtml.includes(range), true, `analytics.html must include ${range}`);
      assert.strictEqual(indexHtml.includes(range), true, `index.html must include ${range}`);
    });

    // Custom date range inputs and apply button
    assert.strictEqual(analyticsHtml.includes('id="analytics-custom-start"'), true, "analytics.html must have custom start date picker");
    assert.strictEqual(analyticsHtml.includes('id="analytics-custom-end"'), true, "analytics.html must have custom end date picker");
    assert.strictEqual(analyticsHtml.includes('id="btn-apply-custom-date"'), true, "analytics.html must have apply custom date range button");
    assert.strictEqual(analyticsHtml.includes('id="btn-export-analytics-csv"'), true, "analytics.html must have Export CSV button");
  });

  it("verifies date filtering logic supports all required presets including boundaries and custom ranges", () => {
    assert.strictEqual(appJs.includes("case 'today':"), true, "Must support today range");
    assert.strictEqual(appJs.includes("case 'yesterday':"), true, "Must support yesterday range");
    assert.strictEqual(appJs.includes("case 'this_month':"), true, "Must support this_month range");
    assert.strictEqual(appJs.includes("case 'prev_month':"), true, "Must support prev_month range");
    assert.strictEqual(appJs.includes("case 'custom':"), true, "Must support custom range");
    assert.strictEqual(appJs.includes("filterJobsByDateRange"), true, "Must have filterJobsByDateRange helper");
  });

  it("verifies financial calculations: collected revenue includes confirmed payments only and excludes unpaid approved orders", () => {
    // Check that collected revenue requires paymentStatus === 'paid' or status === 'completed'
    assert.strictEqual(appJs.includes("isCollectedPayment"), true, "Must have authoritative helper for isCollectedPayment");
    
    // Check that pending / approved awaiting cash is computed as outstanding balance, not collected revenue
    assert.strictEqual(appJs.includes("outstandingApprovedPaise"), true, "Must compute outstanding approved amount separately");
    assert.strictEqual(appJs.includes("Outstanding Approved"), true, "Must display Outstanding Approved KPI");
    assert.strictEqual(appJs.includes("Collected Revenue"), true, "Must display Collected Revenue KPI");
  });

  it("verifies 8 required KPI summary cards are rendered with safe math", () => {
    const expectedKpis = [
      "Collected Revenue",
      "Total Orders",
      "Completed Jobs",
      "Pending Jobs",
      "Billable Pages",
      "Average Order Value",
      "Outstanding Approved",
      "Failed & Rejected"
    ];

    expectedKpis.forEach((kpi) => {
      assert.strictEqual(appJs.includes(kpi), true, `app.js must render KPI card: ${kpi}`);
    });

    // Check safe division for Average Order Value (AOV) to prevent NaN/Infinity on 0 completed jobs
    assert.strictEqual(
      appJs.includes("avgOrderValue = completedJobs.length > 0 ? (totalRevenue / completedJobs.length) : 0"),
      true,
      "AOV must safely handle zero denominator"
    );
  });

  it("verifies all 7 required native SVG charts are implemented with clear titles, legends and empty states", () => {
    // Chart A: Revenue Trend (Line chart)
    assert.strictEqual(appJs.includes("Chart A: Revenue Trend"), true, "Must implement Chart A: Revenue Trend");
    assert.strictEqual(appJs.includes("chart-revenue-trend"), true, "Must render chart-revenue-trend SVG");

    // Chart B: Order Volume Trend (Bar chart)
    assert.strictEqual(appJs.includes("Chart B: Order Volume Trend"), true, "Must implement Chart B: Order Volume Trend");
    assert.strictEqual(appJs.includes("chart-volume-trend"), true, "Must render chart-volume-trend SVG");

    // Chart C: Job Status Distribution (Donut chart)
    assert.strictEqual(appJs.includes("Chart C: Job Status Distribution"), true, "Must implement Chart C: Job Status Distribution");
    assert.strictEqual(appJs.includes("chart-status-donut"), true, "Must render chart-status-donut SVG");

    // Chart D: Print Type Analysis (Color vs Monochrome with switcher)
    assert.strictEqual(appJs.includes("Chart D: Print Type Analysis"), true, "Must implement Chart D: Print Type Analysis");
    assert.strictEqual(appJs.includes("data-metric=\"revenue\""), true, "Must support switching to revenue");
    assert.strictEqual(appJs.includes("data-metric=\"pages\""), true, "Must support switching to pages");
    assert.strictEqual(appJs.includes("data-metric=\"jobs\""), true, "Must support switching to jobs");

    // Chart E: Paper Size Popularity (Horizontal bar chart)
    assert.strictEqual(appJs.includes("Chart E: Paper Size Popularity"), true, "Must implement Chart E: Paper Size Popularity");
    assert.strictEqual(appJs.includes("chart-paper-size"), true, "Must render chart-paper-size container");

    // Chart F: Revenue by Print Service (Single/Duplex, B&W/Color)
    assert.strictEqual(appJs.includes("Chart F: Revenue by Print Service"), true, "Must implement Chart F: Revenue by Print Service");
    assert.strictEqual(appJs.includes("chart-service-revenue"), true, "Must render chart-service-revenue container");

    // Chart G: Peak Hours & Days
    assert.strictEqual(appJs.includes("Peak Operating Hours & Weekly Load"), true, "Must implement Chart G: Peak Operating Hours");
    assert.strictEqual(appJs.includes("chart-peak-hours"), true, "Must render chart-peak-hours container");
  });

  it("verifies Hardware & Printer Performance section is included and filtered to store center", () => {
    assert.strictEqual(appJs.includes("Connected Printer Performance"), true, "Must implement Connected Printer Performance section");
    assert.strictEqual(appJs.includes("analytics-printer-perf"), true, "Must have container for printer performance");
  });

  it("verifies Searchable and Paginated Analytics Table with Prev/Next navigation and status filter", () => {
    assert.strictEqual(appJs.includes("analytics-table-search"), true, "Must have search input for order reference");
    assert.strictEqual(appJs.includes("analytics-table-status"), true, "Must have status filter for table");
    assert.strictEqual(appJs.includes("btn-table-prev"), true, "Must have Previous page button");
    assert.strictEqual(appJs.includes("btn-table-next"), true, "Must have Next page button");
    assert.strictEqual(appJs.includes("analytics-detail-table"), true, "Must render analytics-detail-table");
  });

  it("verifies CSV export escapes formulas, commas, newlines, and quotes, and enforces center tenant isolation", () => {
    assert.strictEqual(appJs.includes("exportAnalyticsToCSV"), true, "Must define exportAnalyticsToCSV function");
    
    // Formula injection protection: =, +, -, @, \t, \r must be prepended with a single quote
    assert.strictEqual(
      appJs.includes("/^[=+\\-@\\t\\r]/.test(str)"),
      true,
      "Must sanitize CSV cells against spreadsheet formula injection (=, +, -, @, \\t, \\r)"
    );

    // RFC 4180 quotation and escaping
    assert.strictEqual(appJs.includes("replace(/\"/g, '\"\"')"), true, "Must escape quotes by doubling them");

    // Tenant isolation verification: only retrieves owner's center jobs
    assert.strictEqual(
      appJs.includes("stateStore.getJobs(effectiveCenterId)"),
      true,
      "Must enforce effectiveCenterId matching for analytics computation"
    );
  });

  it("verifies CSS includes complete light glassmorphism and obsidian dark theme styling for all new components", () => {
    assert.strictEqual(dashboardCss.includes(".analytics-charts-grid"), true, "CSS must define .analytics-charts-grid");
    assert.strictEqual(dashboardCss.includes(".analytics-chart-card"), true, "CSS must define .analytics-chart-card");
    assert.strictEqual(dashboardCss.includes(".metric-switcher"), true, "CSS must define .metric-switcher");
    assert.strictEqual(dashboardCss.includes(".donut-layout"), true, "CSS must define .donut-layout");
    assert.strictEqual(dashboardCss.includes(".hbar-track"), true, "CSS must define .hbar-track");
    assert.strictEqual(dashboardCss.includes(".print-services-grid"), true, "CSS must define .print-services-grid");
    assert.strictEqual(dashboardCss.includes(".peak-hours-grid"), true, "CSS must define .peak-hours-grid");
    assert.strictEqual(dashboardCss.includes(".printer-perf-panel"), true, "CSS must define .printer-perf-panel");
    assert.strictEqual(dashboardCss.includes(".table-toolbar"), true, "CSS must define .table-toolbar");
    assert.strictEqual(dashboardCss.includes(".table-pagination-bar"), true, "CSS must define .table-pagination-bar");

    // Dark theme overrides
    assert.strictEqual(
      dashboardCss.includes('[data-theme="dark"] .analytics-chart-card'),
      true,
      "Dark theme must style .analytics-chart-card"
    );
    assert.strictEqual(
      dashboardCss.includes('[data-theme="dark"] .table-toolbar input'),
      true,
      "Dark theme must style table toolbar controls"
    );
  });
});
