/**
 * Production Initial Schema Fixtures conforming strictly to docs/DATABASE_SCHEMA.md
 */

export const INITIAL_PLANS = [
  {
    planId: "plan_starter",
    name: "Starter Center",
    pricePaise: 49900, // ₹499
    currency: "INR",
    billingInterval: "monthly",
    features: ["Up to 500 print jobs/mo", "Single printer dispatch", "30-day retention", "Basic analytics"],
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z"
  },
  {
    planId: "plan_growth",
    name: "Growth Pro",
    pricePaise: 99900, // ₹999
    currency: "INR",
    billingInterval: "monthly",
    features: ["Unlimited print jobs", "Multi-printer dispatch", "90-day analytics", "Custom QR counter branding", "Priority webhook queue"],
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z"
  },
  {
    planId: "plan_enterprise",
    name: "Campus Hub",
    pricePaise: 249900, // ₹2,499
    currency: "INR",
    billingInterval: "monthly",
    features: ["Multi-branch management", "Hardware bridge integration", "Audit logs archive", "Dedicated SLA"],
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z"
  }
];

export const INITIAL_CENTERS = [];

export const INITIAL_JOBS = [];

export const INITIAL_AUDIT_LOGS = [];

