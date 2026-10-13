# Database Schema

All timestamps should be Firestore timestamps written by trusted server
code where possible. Use generated IDs and validate every field.

## `users/{uid}`

-   `role`: `superadmin` or `owner`
-   `centerId`: center ID for owner; absent for Superadmin where
    appropriate
-   `displayName`
-   `email`
-   `isActive`
-   `createdAt`
-   `lastLoginAt`

Role and center assignment must not be writable by the client.

## `centers/{centerId}`

-   `name`
-   `ownerUid`
-   `slug`
-   `publicId`
-   `address`
-   `phone`
-   `status`: e.g. `active`, `suspended`, `pending`
-   `subscriptionId`
-   `createdAt`
-   `updatedAt`

The public center page must expose only approved fields, not this
document wholesale.

## `plans/{planId}`

-   `name`
-   `pricePaise`: integer
-   `currency`: `INR`
-   `billingInterval`: supported provider interval
-   `features`: validated object/array
-   `isActive`
-   `createdAt`
-   `updatedAt`

## `subscriptions/{subscriptionId}`

-   `centerId`
-   `planId`
-   `provider`: `razorpay`
-   `providerSubscriptionId`
-   `status`
-   `currentPeriodStart`
-   `currentPeriodEnd`
-   `updatedAt`

Maintain provider event IDs in a restricted webhook event collection for
idempotency. Never store provider secrets in Firestore.

## `centers/{centerId}/printJobs/{jobId}`

-   `trackingTokenHash`
-   `originalFileName`: sanitized display name
-   `storagePath`: private object path, not a public URL
-   `fileSizeBytes`
-   `mimeType`
-   `pageCount`: nullable until reliably determined
-   `copies`
-   `colorMode`: e.g. `color` or `monochrome`
-   `duplex`: boolean
-   `paperSize`: allowlisted value such as `A4`, `A3`, `Letter`
-   `status`: validated state-machine value
-   `createdAt`
-   `updatedAt`
-   `expiresAt`
-   `completedAt`: nullable

Avoid collecting unnecessary customer personal information. Tracking
credentials should be random, high entropy, shown to the customer once,
and stored only as a cryptographic hash where practical.

## `centers/{centerId}/analytics/{periodId}`

-   `periodStart`
-   `jobsReceived`
-   `jobsCompleted`
-   `pagesPrinted`
-   `updatedAt`

Analytics are derived from authorized records or trusted aggregate
functions. Define whether date grouping uses the center's local
timezone.

## `auditLogs/{logId}`

-   `actorUid`
-   `action`
-   `targetType`
-   `targetId`
-   `centerId`
-   `createdAt`
-   `metadata`: allowlisted, non-sensitive values only

Restrict read access and prevent clients from creating or editing audit
entries.

## `uploadSessions/{sessionId}`

-   `centerId`
-   `jobId`
-   `expiresAt`
-   `status`
-   `maxBytes`
-   `createdAt`

A session ID is not sufficient authorization by itself. Use short
expiry, specific object paths, single-use or idempotent semantics, and
server validation.

## Suggested indexes

Add composite indexes based on actual queries, especially: - print jobs
by `status` and `createdAt` - print jobs by `createdAt` - print jobs by
`expiresAt` for cleanup, where query design supports it - subscriptions
by `centerId` and `status` - centers by `status` and `createdAt`

Use the indexes required by Firestore's query errors and commit the
generated index definitions. Do not create speculative indexes without
need.
