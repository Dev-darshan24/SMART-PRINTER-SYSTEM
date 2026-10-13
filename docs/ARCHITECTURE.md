# Architecture

## Overview

The application has three interfaces: 1. Superadmin management. 2. Xerox
center owner management. 3. Public customer upload and job tracking.

The management frontend uses Firebase Authentication for identity.
Privileged mutations are performed by Cloud Functions. Firestore stores
business metadata and job records. Firebase Storage stores private
uploaded files. Razorpay handles subscriptions; server-side webhook
verification controls subscription entitlements.

## Trust boundaries

-   Browser code is untrusted.
-   Firebase Authentication establishes identity, not authorization by
    itself.
-   Firestore and Storage rules protect direct client requests.
-   Cloud Functions using the Admin SDK bypass Firestore rules, so every
    function must independently validate identity, role, center
    ownership, input, subscription status, and requested action.
-   Razorpay webhook payloads must be verified against the exact raw
    request body and handled idempotently.
-   Public customers use narrowly scoped backend endpoints rather than
    direct access to private collections.

## Main workflows

### Provisioning

Superadmin creates a center. Trusted backend code creates/provisions its
owner, assigns custom claims, writes the user and center records, and
records an audit event. Prevent duplicate owner or center provisioning.

### Subscription

Owner selects a plan. Backend creates the provider subscription. The
backend verifies signed webhook events and updates the subscription and
center entitlement. A browser redirect is never sufficient proof of
payment.

### QR submission

The public QR contains a non-secret public center identifier. A public
endpoint resolves only approved center information. Submission requires
an active center and subscription. Backend creates a short-lived upload
session and a specific job ID. The file is uploaded to a restricted path
and validated before the job becomes visible in the owner queue.

### Print processing

The owner views only their center's jobs. A trusted endpoint validates
status transitions and writes timestamps. Document access is authorized
and temporary. Customer tracking returns only limited status data after
validating an unguessable tracking credential.

### Cleanup

A scheduled function finds expired jobs, revokes tracking access, and
deletes objects. The system must deny access based on expiry even if the
physical delete operation fails or is delayed. Cleanup is idempotent and
logs safe operational metadata.

## Suggested hosting routes

-   `/` landing page
-   `/login`, `/forgot-password`
-   `/c/{publicId}` public center page
-   `/track` tracking page
-   `/admin/*` Superadmin pages
-   `/app/*` owner pages

Frontend route guards improve UX but do not replace server-side
authorization.

## Observability

Use structured logs without secrets, document contents, raw tracking
tokens, or long-lived file URLs. Log authorization failures, payment
event IDs, cleanup failures, and privileged actions. Define alerts for
function failures, unexpected upload volume, and billing usage.

## Availability and cost

Check Firebase plan requirements, regional availability, current
pricing, and Razorpay account capabilities before deployment. Use
staging before production. Set budget alerts where available.
