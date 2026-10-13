const { db, admin } = require("../config/firebase");

async function recordWebhookEvent(eventId, eventType, payload) {
  const ref = db.collection("webhookEvents").doc(eventId);
  await ref.set({
    eventId,
    eventType,
    payload,
    processedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function isEventProcessed(eventId) {
  const doc = await db.collection("webhookEvents").doc(eventId).get();
  return doc.exists;
}

async function upsertSubscription(subscriptionId, subData) {
  const ref = db.collection("subscriptions").doc(subscriptionId);
  await ref.set({
    ...subData,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function listPlans() {
  const snap = await db.collection("plans").where("isActive", "==", true).get();
  return snap.docs.map(d => ({ planId: d.id, ...d.data() }));
}

module.exports = {
  recordWebhookEvent,
  isEventProcessed,
  upsertSubscription,
  listPlans
};
