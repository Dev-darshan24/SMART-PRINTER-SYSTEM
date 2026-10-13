const admin = require("firebase-admin");
const crypto = require("crypto");

/**
 * Handle incoming Razorpay Webhook
 * Verifies HMAC-SHA256 signature using the raw body buffer and prevents duplicate event processing.
 */
async function handleRazorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing RAZORPAY_WEBHOOK_SECRET configuration.");
    return res.status(500).send("Webhook secret unconfigured.");
  }

  const signature = req.headers["x-razorpay-signature"];
  if (!signature) {
    return res.status(400).send("Missing x-razorpay-signature header.");
  }

  // Raw body verification
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.warn("Invalid webhook signature attempt.");
    return res.status(400).send("Invalid signature.");
  }

  const event = req.body;
  const eventId = event.event_id || event.id;

  if (!eventId) {
    return res.status(400).send("Event ID missing.");
  }

  const db = admin.firestore();
  const eventRef = db.collection("webhookEvents").doc(eventId);

  // Enforce idempotency: check if event was already handled
  const eventSnap = await eventRef.get();
  if (eventSnap.exists) {
    return res.status(200).json({ status: "already_processed", eventId });
  }

  // Process supported subscription events
  const eventType = event.event;
  if (eventType === "subscription.activated" || eventType === "subscription.charged") {
    const subEntity = event.payload.subscription.entity;
    const centerId = subEntity.notes?.centerId;

    if (centerId) {
      await db.collection("subscriptions").doc(subEntity.id).set({
        centerId,
        provider: "razorpay",
        providerSubscriptionId: subEntity.id,
        planId: subEntity.plan_id,
        status: "active",
        currentPeriodStart: new Date(subEntity.current_start * 1000),
        currentPeriodEnd: new Date(subEntity.current_end * 1000),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // Update center status
      await db.collection("centers").doc(centerId).update({
        status: "active",
        subscriptionId: subEntity.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  // Record handled event
  await eventRef.set({
    eventId,
    eventType,
    processedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return res.status(200).json({ status: "processed", eventId });
}

module.exports = {
  handleRazorpayWebhook
};
