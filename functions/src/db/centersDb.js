const { db, admin } = require("../config/firebase");

const centersCollection = db.collection("centers");

async function createCenterRecord(centerId, centerData) {
  const ref = centersCollection.doc(centerId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    ...centerData,
    createdAt: now,
    updatedAt: now
  });
  return { centerId, ...centerData };
}

async function getCenterById(centerId) {
  const doc = await centersCollection.doc(centerId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getCenterByPublicId(publicId) {
  const snap = await centersCollection.where("publicId", "==", publicId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function updateCenterRecord(centerId, updateData) {
  const ref = centersCollection.doc(centerId);
  await ref.update({
    ...updateData,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return getCenterById(centerId);
}

async function listAllCenters() {
  const snap = await centersCollection.orderBy("createdAt", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

module.exports = {
  createCenterRecord,
  getCenterById,
  getCenterByPublicId,
  updateCenterRecord,
  listAllCenters
};
