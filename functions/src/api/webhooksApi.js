const crypto = require("crypto");
const env = require("../config/env");
const { isEventProcessed, recordWebhookEvent, upsertSubscription } = require("../db/subscriptionsDb");
const { updateCenterRecord } = require("../db/centersDb");

async function handleRazorpayWebhook(req, res) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  if (!signature) {
    return res.status(400).send("Missing x-razorpay-signature header.");
  }

  // Exact raw request body HMAC verification
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    return res.status(400).send("Invalid webhook signature.");
  }

  const event = req.body;
  const eventId = event.event_id || event.id;

  if (!eventId) {
    return res.status(400).send("Event ID missing.");
  }

  // Idempotency check
  if (await isEventProcessed(eventId)) {
    return res.status(200).json({ status: "already_processed", eventId });
  }

  // Handle active subscription events
  if (event.event === "subscription.activated" || event.event === "subscription.charged") {
    const subEntity = event.payload?.subscription?.entity;
    const centerId = subEntity?.notes?.centerId;

    if (centerId && subEntity) {
      await upsertSubscription(subEntity.id, {
        centerId,
        provider: "razorpay",
        providerSubscriptionId: subEntity.id,
        planId: subEntity.plan_id,
        status: "active",
        currentPeriodStart: new Date(subEntity.current_start * 1000),
        currentPeriodEnd: new Date(subEntity.current_end * 1000)
      });

      await updateCenterRecord(centerId, {
        status: "active",
        subscriptionId: subEntity.id
      });
    }
  }

  // Persist handled event for idempotency
  await recordWebhookEvent(eventId, event.event, { receivedAt: new Date().toISOString() });

  return res.status(200).json({ status: "processed", eventId });
}

module.exports = {
  handleRazorpayWebhook
};
