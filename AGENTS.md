# AI Agent Instructions

## Product context

Build a multi-tenant Xerox Center Management System using HTML, CSS,
Vanilla JavaScript, Firebase Authentication, Cloud Firestore, private
Firebase Storage, Cloud Functions, and Razorpay subscriptions.

## Non-negotiable rules

-   Inspect the repository before editing; preserve useful existing
    work.
-   Implement in small stages and run tests after meaningful changes.
-   Do not claim tests passed unless they were run.
-   Never put private credentials or secrets in frontend code or Git.
-   Never trust client-submitted roles, center IDs, subscription status,
    payment success, MIME types, file sizes, or print-job status
    transitions.
-   Enforce tenant isolation in both Firestore/Storage rules and every
    privileged backend function.
-   Use deny-by-default rules.
-   Never make customer files public.
-   Do not permit arbitrary anonymous Firestore reads/writes.
-   Never let customers enumerate print jobs or download other
    customers' files.
-   Do not activate a subscription from a browser redirect; verify
    provider webhooks on the server.
-   Make webhook handlers idempotent.
-   Treat App Check as additional abuse prevention, not authorization.
-   Do not add fake functionality or unmarked fake production metrics.
-   Use accessible semantic HTML, keyboard navigation, responsive
    layouts, and reduced-motion support.
-   Keep cards to a minimum and maximize useful workspace width.
-   Use light lavender/white glassmorphism; do not switch to a dark
    cinematic design.
-   Do not add React, Vue, Angular, Tailwind, jQuery, paid UI kits, or
    unnecessary dependencies.

## Code organization

-   Keep page-specific code separate from shared utilities.
-   Centralize Firebase initialization.
-   Separate API calls from DOM/UI logic.
-   Keep business logic and privileged operations in Cloud Functions.
-   Add input validation and useful error states.
-   Avoid duplicating authorization logic inconsistently; create
    reusable trusted helpers.
-   Document schema and security changes.

## Workflow

1.  Read README and docs.
2.  Inspect current source and git status.
3.  State the next small milestone.
4.  Implement it.
5.  Run relevant lint/tests/build.
6.  Fix failures.
7.  Summarize changed files, actual test results, and remaining manual
    configuration.
8.  Do not proceed to live payment or real document upload until
    security-critical tests pass.

## Initial milestone

Create the folder structure, documentation, design tokens, responsive
shell, login page shell, and dashboard layout with clearly labeled demo
data. Do not connect live payments or real customer uploads in the
initial milestone.
