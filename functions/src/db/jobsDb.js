const { db, admin } = require("../config/firebase");

function getJobsCollection(centerId) {
  return db.collection("centers").doc(centerId).collection("printJobs");
}

async function createJobRecord(centerId, jobData) {
  const collection = getJobsCollection(centerId);
  const docRef = collection.doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  
  await docRef.set({
    jobId: docRef.id,
    centerId,
    ...jobData,
    createdAt: now,
    updatedAt: now
  });

  return { jobId: docRef.id, ...jobData };
}

async function getJobById(centerId, jobId) {
  const doc = await getJobsCollection(centerId).doc(jobId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getJobByHash(trackingTokenHash) {
  const query = db.collectionGroup("printJobs").where("trackingTokenHash", "==", trackingTokenHash).limit(1);
  const snap = await query.get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function updateJobRecord(centerId, jobId, updates) {
  const ref = getJobsCollection(centerId).doc(jobId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.update({
    ...updates,
    updatedAt: now
  });
  return getJobById(centerId, jobId);
}

async function listCenterJobs(centerId, status = null) {
  let query = getJobsCollection(centerId).orderBy("createdAt", "desc");
  if (status) {
    query = query.where("status", "==", status);
  }
  const snap = await query.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

module.exports = {
  createJobRecord,
  getJobById,
  getJobByHash,
  updateJobRecord,
  listCenterJobs
};
