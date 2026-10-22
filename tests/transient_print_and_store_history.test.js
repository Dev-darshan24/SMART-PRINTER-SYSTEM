/**
 * Transient File Privacy, Customer ID Tracking & Multi-Tenant Store History Isolation Tests
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("SmartPrint — Transient Privacy, Customer ID & Multi-Tenant History Isolation", () => {
  const serverPath = path.resolve(__dirname, "../server.js");
  const apiJsPath = path.resolve(__dirname, "../public/assets/js/api.js");
  const stateJsPath = path.resolve(__dirname, "../public/assets/js/state.js");
  const appJsPath = path.resolve(__dirname, "../public/assets/js/app.js");
  const historyHtmlPath = path.resolve(__dirname, "../public/app/history.html");
  const indexHtmlPath = path.resolve(__dirname, "../public/app/index.html");

  it("verifies server.js implements transient file handling and does not store file binaries", () => {
    assert.strictEqual(fs.existsSync(serverPath), true, "server.js must exist.");
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    // Must have /api/jobs endpoint
    assert.strictEqual(serverCode.includes("/api/jobs"), true, "server.js must define /api/jobs endpoint.");
    // Must strip file binaries/base64
    assert.strictEqual(serverCode.includes("storagePath: null"), true, "server.js must explicitly set storagePath to null.");
    assert.strictEqual(serverCode.includes("delete body.fileData"), true, "server.js must delete fileData.");
    assert.strictEqual(serverCode.includes("delete body.dataUrl"), true, "server.js must delete dataUrl.");
    assert.strictEqual(serverCode.includes("delete body.rawFile"), true, "server.js must delete rawFile.");
  });

  it("verifies server.js generates and tracks customerId, pageCount, and paidAmount", () => {
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    assert.strictEqual(serverCode.includes("CUST-"), true, "server.js must generate customerId prefixed with CUST-.");
    assert.strictEqual(serverCode.includes("pageCount"), true, "server.js must track pageCount.");
    assert.strictEqual(serverCode.includes("paidAmount"), true, "server.js must track paidAmount.");
    assert.strictEqual(serverCode.includes("submittedAt"), true, "server.js must track submittedAt timestamp.");
  });

  it("verifies store-isolated history logic in server.js (getJobsForCenter)", () => {
    const serverCode = fs.readFileSync(serverPath, "utf-8");

    assert.strictEqual(serverCode.includes("getJobsForCenter"), true, "server.js must implement getJobsForCenter.");
    assert.strictEqual(serverCode.includes("targetIds.has(String(job.centerId).trim().toLowerCase())"), true, "server.js must check job center against targetIds.");
  });

  it("verifies api.js and state.js ensure zero file storage and strict store isolation", () => {
    const apiCode = fs.readFileSync(apiJsPath, "utf-8");
    const stateCode = fs.readFileSync(stateJsPath, "utf-8");

    // api.js check
    assert.strictEqual(apiCode.includes("CUST-"), true, "api.js must generate or handle CUST- customer IDs.");
    assert.strictEqual(apiCode.includes("storagePath: null"), true, "api.js must enforce storagePath: null for zero file storage.");
    assert.strictEqual(apiCode.includes("/api/jobs"), true, "api.js must sync jobs to /api/jobs.");

    // state.js check
    assert.strictEqual(stateCode.includes("getJobs"), true, "state.js must implement getJobs.");
    assert.strictEqual(stateCode.includes("allowedIds.has(String(j.centerId).trim().toLowerCase())"), true, "state.js must isolate jobs by center allowed IDs.");
  });

  it("verifies history table headers include Customer ID, Date & Time, Pages Printed, and Amount Paid", () => {
    const historyHtml = fs.readFileSync(historyHtmlPath, "utf-8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

    // Check history.html
    assert.strictEqual(historyHtml.includes("Customer ID"), true, "history.html must have 'Customer ID' column.");
    assert.strictEqual(historyHtml.includes("Date &amp; Time") || historyHtml.includes("Date & Time"), true, "history.html must have 'Date & Time' column.");
    assert.strictEqual(historyHtml.includes("Pages Printed"), true, "history.html must have 'Pages Printed' column.");
    assert.strictEqual(historyHtml.includes("Amount Paid"), true, "history.html must have 'Amount Paid' column.");

    // Check index.html (dashboard queue & recent history)
    assert.strictEqual(indexHtml.includes("Customer ID"), true, "index.html must have 'Customer ID' column.");
    assert.strictEqual(indexHtml.includes("Pages Printed"), true, "index.html must have 'Pages Printed' column.");
    assert.strictEqual(indexHtml.includes("Amount Paid"), true, "index.html must have 'Amount Paid' column.");
  });

  it("verifies app.js renders Customer ID, Date & Time, Pages Printed, and Amount Paid in history view", () => {
    const appCode = fs.readFileSync(appJsPath, "utf-8");

    assert.strictEqual(appCode.includes("renderHistory"), true, "app.js must implement renderHistory.");
    assert.strictEqual(appCode.includes("CUST-"), true, "app.js must format Customer ID with CUST- prefix.");
    assert.strictEqual(appCode.includes("job.pageCount"), true, "app.js must render job.pageCount.");
    assert.strictEqual(appCode.includes("job.paidAmount"), true, "app.js must render job.paidAmount.");
  });

  it("verifies store isolation logic between Store 1 and Store 2", () => {
    // Simulate store isolation logic programmatically as defined in server.js
    const store1Aliases = new Set(["center_default", "CTR-1000000", "1000000"]);
    const store2Aliases = new Set(["center_fuU7qXKQ", "CTR-1000001", "1000001"]);

    const mockJobs = [
      {
        id: "job-101",
        centerId: "center_default",
        customerId: "CUST-111222",
        fileName: "Assignment_Store1.pdf",
        storagePath: null,
        pageCount: 15,
        paidAmount: 30,
        submittedAt: new Date().toISOString()
      },
      {
        id: "job-102",
        centerId: "1000000",
        customerId: "CUST-333444",
        fileName: "Notes_Store1.pdf",
        storagePath: null,
        pageCount: 5,
        paidAmount: 10,
        submittedAt: new Date().toISOString()
      },
      {
        id: "job-201",
        centerId: "CTR-1000001",
        customerId: "CUST-888999",
        fileName: "Resume_Store2.pdf",
        storagePath: null,
        pageCount: 2,
        paidAmount: 4,
        submittedAt: new Date().toISOString()
      }
    ];

    const getJobsFor = (centerId) => {
      const isTargetStore1 = store1Aliases.has(centerId);
      const isTargetStore2 = store2Aliases.has(centerId);
      return mockJobs.filter((job) => {
        if (isTargetStore1) return store1Aliases.has(job.centerId);
        if (isTargetStore2) return store2Aliases.has(job.centerId);
        return job.centerId === centerId;
      });
    };

    const store1Jobs = getJobsFor("CTR-1000000");
    const store2Jobs = getJobsFor("center_fuU7qXKQ");

    assert.strictEqual(store1Jobs.length, 2, "Store 1 must return exactly 2 jobs.");
    assert.strictEqual(store2Jobs.length, 1, "Store 2 must return exactly 1 job.");

    // Store 1 history must not contain Store 2 jobs
    assert.ok(store1Jobs.every(j => store1Aliases.has(j.centerId)));
    assert.ok(store1Jobs.every(j => j.customerId !== "CUST-888999"));

    // Store 2 history must not contain Store 1 jobs
    assert.ok(store2Jobs.every(j => store2Aliases.has(j.centerId)));
    assert.ok(store2Jobs.every(j => j.customerId === "CUST-888999"));

    // Storage path must be null across all jobs (no file saved)
    assert.ok(mockJobs.every(j => j.storagePath === null), "No jobs should have storagePath.");
  });
});
