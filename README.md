# Xerox Center Management System

A multi-tenant web application for local Xerox/photocopy centers.
Superadmins manage centers and subscriptions; each center owner manages
its print queue and history. Customers scan a center-specific QR code to
submit documents from a mobile browser.

## Product scope

-   One Superadmin role and one owner account per center in the first
    release.
-   Firebase Authentication, Cloud Firestore, private Firebase Storage,
    and Cloud Functions.
-   Razorpay subscriptions for center owners.
-   Customer upload and print-job submission through a QR-linked public
    page.
-   Center-specific queue, history, analytics, and retention controls.
-   Light lavender/white glassmorphism UI with minimal cards and a wide
    workspace.

Customers do not pay online per print job in this version.

## Documentation

-   `AGENTS.md` --- instructions for AI coding agents.
-   `docs/ARCHITECTURE.md` --- system components and workflows.
-   `docs/DATABASE_SCHEMA.md` --- Firestore collections and fields.
-   `docs/SECURITY.md` --- roles, rules, uploads, payments, and
    retention.
-   `docs/IMPLEMENTATION_PLAN.md` --- staged development and acceptance
    checks.

## Prerequisites

-   Node.js LTS and npm.
-   Firebase CLI.
-   A Firebase project.
-   Firebase Authentication, Firestore, Storage, Hosting, and Cloud
    Functions configured as needed.
-   Razorpay account for subscription integration; use test mode first.
-   Git.

Some Firebase services or configurations may require a billing-enabled
Firebase plan. Confirm current pricing and regional availability before
deployment.

## Local setup

1.  Clone or open this repository.

2.  Install frontend dependencies, if any, from the root `package.json`.

3.  Install backend dependencies in `functions/`:

    ``` bash
    cd functions
    npm install
    cd ..
    ```

4.  Copy `.firebaserc.example` to `.firebaserc` and set your own
    Firebase project ID.

5.  Create local configuration from `.env.example`. Do not commit real
    credentials.

6.  Configure Firebase Authentication and authorized owner/Superadmin
    provisioning.

7.  Start the Firebase Emulator Suite after configuring the local
    project:

    ``` bash
    firebase emulators:start
    ```

8.  Run the project's tests and build checks before deploying.

Exact commands should be adjusted to the scripts that exist in
`package.json`. Never invent a successful test result; report what was
actually run.

## Security requirements

-   All data access must be denied by default unless explicitly
    authorized.
-   Do not use client-controlled role fields for authorization.
-   Never expose Firebase Admin credentials or Razorpay secrets to
    frontend code.
-   Never make customer documents public.
-   Verify Razorpay webhooks on the server and process events
    idempotently.
-   Test Firestore and Storage rules in the Emulator Suite.
-   Keep test/demo data separate from production records.

## Deployment outline

1.  Run linting, tests, and build checks.
2.  Review Firestore and Storage rules.
3.  Confirm server-side secrets are configured securely.
4.  Deploy to a staging Firebase project first.
5.  Test owner isolation, QR upload, subscription webhooks, and file
    cleanup.
6.  Review logs, usage, retention, and billing alerts.
7.  Deploy to production only after the security checklist passes.

## Initial retention policy

Default proposal: delete originals 24 hours after completion or
rejection, with abandoned jobs expiring after at most seven days.
Expired documents must become inaccessible immediately, even if deletion
is delayed. Confirm this policy against operational and legal needs
before launch.
