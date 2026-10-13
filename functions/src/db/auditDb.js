const { db, admin } = require("../config/firebase");

async function recordAuditLog(actorUid, action, targetType, targetId, centerId, metadata = {}) {
  const ref = db.collection("auditLogs").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  
  await ref.set({
    logId: ref.id,
    actorUid,
    action,
    targetType,
    targetId,
    centerId: centerId || null,
    metadata,
    createdAt: now
  });

  return ref.id;
}

module.exports = {
  recordAuditLog
};
