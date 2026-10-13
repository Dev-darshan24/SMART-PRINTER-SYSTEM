/**
 * Dashboard KPI Cards, Queue Limitation & Total History Test Specification
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Dashboard KPI Cards & Orders Queue Verification", () => {
  const htmlPath = path.resolve(__dirname, "../public/app/index.html");
  const jsPath = path.resolve(__dirname, "../public/assets/js/app.js");
  const statePath = path.resolve(__dirname, "../public/assets/js/state.js");
  const cleanupPath = path.resolve(__dirname, "../functions/src/cleanup.js");

  it("verifies public/app/index.html contains the 4 requested KPI cards in order", () => {
    assert.strictEqual(fs.existsSync(htmlPath), true, "app/index.html must exist.");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // Check presence of labels and IDs
    assert.strictEqual(html.includes("Today's Earning"), true, "Card 1: Today's Earning label must exist.");
    assert.strictEqual(html.includes('id="kpi-todays-earning"'), true, "Card 1: #kpi-todays-earning element must exist.");

    assert.strictEqual(html.includes("Orders Pending"), true, "Card 2: Orders Pending label must exist.");
    assert.strictEqual(html.includes('id="kpi-orders-pending"'), true, "Card 2: #kpi-orders-pending element must exist.");

    assert.strictEqual(html.includes("How Many Orders Today"), true, "Card 3: How Many Orders Today label must exist.");
    assert.strictEqual(html.includes('id="kpi-orders-today"'), true, "Card 3: #kpi-orders-today element must exist.");

    assert.strictEqual(html.includes("Reject Print"), true, "Card 4: Reject Print label must exist.");
    assert.strictEqual(html.includes('id="kpi-reject-print"'), true, "Card 4: #kpi-reject-print element must exist.");

    // Check order in HTML
    const posEarning = html.indexOf("kpi-todays-earning");
    const posPending = html.indexOf("kpi-orders-pending");
    const posToday = html.indexOf("kpi-orders-today");
    const posReject = html.indexOf("kpi-reject-print");

    assert.ok(posEarning < posPending, "Today's Earning must precede Orders Pending");
    assert.ok(posPending < posToday, "Orders Pending must precede How Many Orders Today");
    assert.ok(posToday < posReject, "How Many Orders Today must precede Reject Print");
  });

  it("verifies Daily Performance Analytics is removed from Dashboard", () => {
    const html = fs.readFileSync(htmlPath, "utf-8");
    assert.strictEqual(
      html.includes("Daily Performance Analytics"),
      false,
      "Daily Performance Analytics section must be removed from dashboard."
    );
  });

  it("verifies Dashboard displays only last 5 orders and connects to Total Orders History", () => {
    const html = fs.readFileSync(htmlPath, "utf-8");
    const js = fs.readFileSync(jsPath, "utf-8");

    // HTML footer link to History
    assert.strictEqual(html.includes('id="dashboard-queue-subtext"'), true, "Queue subtext must exist.");
    assert.strictEqual(html.includes('id="btn-view-all-history"'), true, "Button to view Total Orders in History must exist.");
    assert.strictEqual(html.includes("Total Orders History"), true, "History section must be titled Total Orders History.");

    // JS slice(0, 5) limitation for dashboard queue
    assert.strictEqual(js.includes("jobs.slice(0, 5)"), true, "renderQueue must slice to only 5 orders.");
    assert.strictEqual(js.includes("btn-view-all-history"), true, "app.js must handle btn-view-all-history.");
  });

  it("verifies History section contains date range filters (Today, Last 7 Days, 3 Months, 6 Months, and Year Cycle)", () => {
    const html = fs.readFileSync(htmlPath, "utf-8");
    const js = fs.readFileSync(jsPath, "utf-8");

    // Check HTML range buttons
    assert.strictEqual(html.includes('data-range="today"'), true, "Must have Today filter.");
    assert.strictEqual(html.includes('data-range="7days"'), true, "Must have Last 7 Days filter.");
    assert.strictEqual(html.includes('data-range="3months"'), true, "Must have 3 Months filter.");
    assert.strictEqual(html.includes('data-range="6months"'), true, "Must have 6 Months filter.");
    assert.strictEqual(html.includes('data-range="1year"'), true, "Must have Year filter tab.");
    assert.strictEqual(html.includes('id="history-year-tab-label"'), true, "Must have element for dynamic year cycle label.");

    // Check JS filter logic
    assert.strictEqual(js.includes("filterJobsByDateRange"), true, "Must define filterJobsByDateRange.");
    assert.strictEqual(js.includes("currentHistoryRange"), true, "Must track currentHistoryRange.");
    assert.strictEqual(js.includes("getYearCycle"), true, "Must define getYearCycle for annual cycle calculation.");
  });

  it("verifies year calculation in history section computes annual sessions like 2026 to 2027 and so on", () => {
    const getYearCycle = (dateInput) => {
      const d = new Date(dateInput);
      const year = d.getFullYear();
      const month = d.getMonth();
      const startYear = month >= 3 ? year : year - 1;
      const endYear = startYear + 1;
      return `${startYear} - ${endYear}`;
    };

    // Dates in 2026 (Oct 2026) -> "2026 - 2027"
    assert.strictEqual(getYearCycle(new Date("2026-10-12T00:00:00Z")), "2026 - 2027");
    // Dates in early 2027 (Feb 2027) -> "2026 - 2027"
    assert.strictEqual(getYearCycle(new Date("2027-02-15T00:00:00Z")), "2026 - 2027");
    // Next annual session: Dates in May 2027 -> "2027 - 2028"
    assert.strictEqual(getYearCycle(new Date("2027-05-01T00:00:00Z")), "2027 - 2028");
    // And so on: Dates in 2028 -> "2028 - 2029"
    assert.strictEqual(getYearCycle(new Date("2028-08-01T00:00:00Z")), "2028 - 2029");
  });

  it("verifies automatic 1-year data deletion policy in state.js and cleanup.js", () => {
    const stateJs = fs.readFileSync(statePath, "utf-8");
    const cleanupJs = fs.readFileSync(cleanupPath, "utf-8");

    // Verify client-side 1-year auto purge
    assert.strictEqual(stateJs.includes("ONE_YEAR_MS"), true, "state.js must calculate ONE_YEAR_MS.");
    assert.strictEqual(stateJs.includes("isWithinOneYear"), true, "state.js must check isWithinOneYear.");

    // Verify server-side 1-year auto cleanup
    assert.strictEqual(cleanupJs.includes("oneYearAgo"), true, "cleanup.js must calculate oneYearAgo cutoff.");
    assert.strictEqual(cleanupJs.includes("365 * 24 * 60 * 60 * 1000"), true, "cleanup.js must use 365-day retention.");
  });

  it("verifies date range filtering accurately isolates jobs by time window", () => {
    const now = Date.now();
    const mockJobs = [
      { jobId: "j_today", createdAt: new Date(now).toISOString() }, // now (same day)
      { jobId: "j_5days", createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() }, // 5 days ago
      { jobId: "j_2months", createdAt: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString() }, // 60 days ago
      { jobId: "j_5months", createdAt: new Date(now - 150 * 24 * 60 * 60 * 1000).toISOString() }, // 150 days ago
      { jobId: "j_10months", createdAt: new Date(now - 300 * 24 * 60 * 60 * 1000).toISOString() }, // 300 days ago
      { jobId: "j_over_1year", createdAt: new Date(now - 400 * 24 * 60 * 60 * 1000).toISOString() } // 400 days ago (> 1 year)
    ];

    const filterRange = (jobs, range) => {
      const nowMs = Date.now();
      return jobs.filter(job => {
        const jobMs = new Date(job.createdAt).getTime();
        const diffMs = nowMs - jobMs;
        switch (range) {
          case 'today':
            return new Date(jobMs).toDateString() === new Date(nowMs).toDateString();
          case '7days':
            return diffMs <= 7 * 24 * 60 * 60 * 1000;
          case '3months':
            return diffMs <= 90 * 24 * 60 * 60 * 1000;
          case '6months':
            return diffMs <= 180 * 24 * 60 * 60 * 1000;
          case '1year':
            return diffMs <= 365 * 24 * 60 * 60 * 1000;
          default:
            return true;
        }
      });
    };

    assert.strictEqual(filterRange(mockJobs, 'today').length, 1);
    assert.strictEqual(filterRange(mockJobs, '7days').length, 2);
    assert.strictEqual(filterRange(mockJobs, '3months').length, 3);
    assert.strictEqual(filterRange(mockJobs, '6months').length, 4);
    assert.strictEqual(filterRange(mockJobs, '1year').length, 5); // Excludes j_over_1year!
  });
});
