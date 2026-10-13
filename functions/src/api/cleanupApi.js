const { db, storage } = require("../config/firebase");

async function runScheduledRetentionCleanup() {
  const now = new Date();
  const bucket = storage.bucket();
  let totalRemoved = 0;

  console.log(`[RETENTION] Starting scheduled cleanup check at ${now.toISOString()}`);

  const centersSnap = await db.collection("centers").get();
  for (const centerDoc of centersSnap.docs) {
    const expiredSnap = await centerDoc.ref
      .collection("printJobs")
      .where("expiresAt", "<=", now)
      .limit(50)
      .get();

    for (const jobDoc of expiredSnap.docs) {
      const job = jobDoc.data();
      if (job.storagePath) {
        try {
          await bucket.file(job.storagePath).delete();
          console.log(`[RETENTION] Deleted cloud storage file: ${job.storagePath}`);
        } catch (e) {
          // File may have already been cleaned up
        }
      }
      await jobDoc.ref.delete();
      totalRemoved++;
    }
  }

  console.log(`[RETENTION] Cleanup finished. Expired jobs pruned: ${totalRemoved}`);
  return { success: true, totalRemoved };
}

module.exports = {
  runScheduledRetentionCleanup
};
