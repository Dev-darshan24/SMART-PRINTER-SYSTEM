# Implementation Plan

## Phase 1 --- Repository and design foundation

-   Inspect existing repository before editing.
-   Establish HTML/CSS/Vanilla JS module structure.
-   Define lavender/white design tokens and accessible components.
-   Build responsive navigation, login shell, and dashboard shell.
-   Use visibly labeled demo data only.
-   Acceptance: desktop and mobile layouts work; no fake control is
    presented as a working backend feature.

## Phase 2 --- Firebase setup and authentication

-   Configure Firebase project and local emulators.
-   Implement sign-in, sign-out, password reset, and session handling.
-   Provision roles only through trusted code.
-   Add Firestore/Storage deny-by-default rules.
-   Acceptance: role tampering fails; owner isolation tests pass.

## Phase 3 --- Center management

-   Implement center creation/editing and owner provisioning.
-   Generate public IDs and QR destination URLs.
-   Add status and audit trail.
-   Acceptance: duplicate provisioning is handled safely and public
    pages reveal only approved fields.

## Phase 4 --- Subscriptions

-   Implement plan management and Razorpay test-mode subscription
    creation.
-   Verify webhooks and process them idempotently.
-   Enforce active entitlements server-side.
-   Acceptance: frontend redirects alone never activate plans; duplicate
    webhooks are safe.

## Phase 5 --- QR upload and print queue

-   Build mobile public center page and upload form.
-   Add upload-session authorization, file validation, job creation,
    tracking token, and owner queue.
-   Add state-machine transitions and private document preview.
-   Acceptance: cross-center access, enumeration, unsupported uploads,
    and expired access are denied.

## Phase 6 --- History and analytics

-   Build search/filter history and three-month summaries.
-   Add date range and center timezone handling.
-   Acceptance: numbers reconcile to authorized job records and empty
    states are handled.

## Phase 7 --- Retention and operations

-   Add scheduled cleanup and logical expiry.
-   Add structured logging, error handling, usage monitoring, and budget
    alerts.
-   Acceptance: cleanup can be retried safely and expired documents are
    inaccessible immediately.

## Phase 8 --- Production readiness

-   Run unit, integration, rules, and end-to-end tests.
-   Test on actual mobile devices and slow connections.
-   Verify HTTPS, security headers, secrets, backups, indexes, and
    provider settings.
-   Deploy to staging, complete manual acceptance, then production.

## Development reporting

At the end of each phase, report: - Files created/changed. - Features
implemented. - Tests actually run and their results. - Firebase
configuration or credentials still required from the project owner. -
Known limitations and the next small milestone.

Never claim production readiness without completing security-critical
tests.
