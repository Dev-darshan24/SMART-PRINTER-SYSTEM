const admin = require("firebase-admin");

/**
 * Scheduled cleanup function for expired customer uploads (24-hour default retention)
 */
async function performRetentionCleanup() {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const now = new Date();
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  console.log(`Starting retention cleanup at ${now.toISOString()} (1-year cutoff: ${oneYearAgo.toISOString()})`);

  try {
    const centersSnap = await db.collection("centers").get();
    let totalDeleted = 0;

    for (const centerDoc of centersSnap.docs) {
      // 1. Delete short-term expired uploads
      const expiredJobsSnap = await centerDoc.ref
        .collection("printJobs")
        .where("expiresAt", "<=", now)
        .limit(100)
        .get();

      for (const jobDoc of expiredJobsSnap.docs) {
        const job = jobDoc.data();
        
        // Delete file from Firebase Storage
        if (job.storagePath) {
          try {
            await bucket.file(job.storagePath).delete();
            console.log(`Deleted expired file: ${job.storagePath}`);
          } catch (fileErr) {
            console.warn(`File delete warning (${job.storagePath}): ${fileErr.message}`);
          }
        }

        // Delete job document from Firestore
        await jobDoc.ref.delete();
        totalDeleted++;
      }

      // 2. Automatically delete historical jobs older than 1 year (365 days)
      const oneYearOldJobsSnap = await centerDoc.ref
        .collection("printJobs")
        .where("createdAt", "<=", oneYearAgo.toISOString())
        .limit(100)
        .get();

      for (const jobDoc of oneYearOldJobsSnap.docs) {
        const job = jobDoc.data();
        if (job.storagePath) {
          try {
            await bucket.file(job.storagePath).delete();
          } catch (fileErr) {}
        }
        await jobDoc.ref.delete();
        totalDeleted++;
        console.log(`Deleted 1-year-old job document: ${jobDoc.id}`);
      }
    }

    console.log(`Cleanup complete. Total expired and 1-year-old jobs removed: ${totalDeleted}`);
    return { success: true, totalDeleted };
  } catch (err) {
    console.error("Error during scheduled retention cleanup:", err);
    throw err;
  }
}

module.exports = {
  performRetentionCleanup
};
