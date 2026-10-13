# Security Plan

## Roles

-   Superadmin: platform administration, with sensitive access logged.
-   Owner: access limited to the assigned center.
-   Customer: no account; access only through narrowly scoped public
    endpoints and a high-entropy job tracking credential.

## Core controls

1.  Deny by default in Firestore and Storage.
2.  Use trusted custom claims for role and center assignment.
3.  Keep privileged mutations in Cloud Functions.
4.  Validate role, center ownership, record state, subscription
    entitlement, and inputs inside every privileged function.
5.  Apply tenant isolation to every read, write, query, file path,
    analytics request, and tracking request.
6.  Use Firebase App Check as an extra protection layer.
7.  Apply server-side rate limits to public endpoints.
8.  Keep secrets in secure server-side configuration/secret management.
9.  Use a Content Security Policy and safe DOM APIs; avoid injecting
    user-provided HTML.
10. Audit sensitive administrative actions.

## Document upload

-   Permit only necessary file types; begin with PDF and explicitly
    selected image formats if supported.
-   Enforce maximum byte size and per-center/per-IP rate limits.
-   Validate file signatures/content, not only extension or browser MIME
    type.
-   Generate randomized object names.
-   Restrict uploads to one job and one center.
-   Keep files private.
-   Do not expose durable public download URLs.
-   Scan or safely process uploaded content where appropriate before
    making it available.
-   Ensure temporary access expires and can be revoked.
-   Prevent tracking-token enumeration by using high entropy and rate
    limits.

## Retention

Proposed defaults: - Delete completed/rejected document originals 24
hours after the terminal status. - Expire abandoned jobs after at most
seven days. - Enforce logical expiry before cleanup deletion. - Make
cleanup idempotent and monitor failures. Confirm legal, privacy, and
operational requirements before production.

## Subscription security

-   Create subscriptions server-side.
-   Verify webhook signatures using the raw request body.
-   Record event IDs and process events idempotently.
-   Validate provider state and entitlement period.
-   Do not trust the frontend redirect, query string, or
    client-submitted status.
-   Do not store secret keys in frontend assets or source control.

## Testing

Use Firebase Emulator Suite tests to prove: - Anonymous management
reads/writes are denied. - Owner A cannot access Center B. - Users
cannot modify roles or center assignments. - Public users cannot
enumerate jobs or retrieve files. - Oversized and unsupported uploads
are rejected. - Invalid status transitions fail. - Duplicate webhooks do
not duplicate effects. - Expired documents are inaccessible before
physical deletion. - Disabled owners and suspended centers cannot
perform protected actions.

## Incident readiness

Define a process for disabling compromised accounts, rotating secrets,
revoking sessions, reviewing audit logs, restoring from backups, and
communicating a security incident. Never log passwords, secrets, raw
tracking tokens, or document contents.
