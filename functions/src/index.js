const functions = require("firebase-functions");
const { provisionCenter, getCentersList } = require("./api/adminApi");
const { submitCustomerPrintJob, updateStatus } = require("./api/jobsApi");
const { handleRazorpayWebhook } = require("./api/webhooksApi");
const { runScheduledRetentionCleanup } = require("./api/cleanupApi");

// Callable APIs
exports.provisionCenter = functions.https.onCall(provisionCenter);
exports.listCenters = functions.https.onCall(getCentersList);
exports.submitJob = functions.https.onCall(submitCustomerPrintJob);
exports.updateJobStatus = functions.https.onCall(updateStatus);

// HTTPS Webhook for Razorpay payment events
exports.razorpayWebhook = functions.https.onRequest(handleRazorpayWebhook);

// Scheduled hourly retention cleanup
exports.scheduledRetentionCleanup = functions.pubsub
  .schedule("every 1 hours")
  .onRun(runScheduledRetentionCleanup);
