const admin = require("firebase-admin");
const crypto = require("crypto");

const VALID_TRANSITIONS = {
  submitted: ["under_review", "cancelled", "rejected"],
  under_review: ["printing", "rejected", "cancelled"],
  printing: ["completed", "rejected"],
  completed: [],
  rejected: [],
  cancelled: []
};

/**
 * Submit print job by public customer
 */
async function submitPrintJob(data) {
  const { centerId, fileName, fileSizeBytes, mimeType, pageCount, copies, colorMode, duplex, paperSize, customerNote } = data;

  if (!centerId || !fileName || !fileSizeBytes) {
    throw new Error("INVALID_ARGUMENT: Missing required print job parameters.");
  }

  // Validate allowed mime types
  const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
  if (mimeType && !allowedTypes.includes(mimeType)) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE: Only PDF and image uploads are allowed.");
  }

  // Max 25MB
  if (fileSizeBytes > 25 * 1024 * 1024) {
    throw new Error("FILE_TOO_LARGE: Upload must not exceed 25 MB.");
  }

  const db = admin.firestore();

  // Verify center exists and is active
  const centerSnap = await db.collection("centers").where("publicId", "==", centerId).limit(1).get();
  if (centerSnap.empty) {
    throw new Error("NOT_FOUND: Center does not exist or is inactive.");
  }
  const centerDoc = centerSnap.docs[0];
  const centerData = centerDoc.data();
  if (centerData.status !== "active") {
    throw new Error("FAILED_PRECONDITION: Center is not currently accepting print jobs.");
  }

  // Generate high-entropy tracking token
  const randomPart1 = Math.floor(1000 + Math.random() * 9000);
  const randomPart2 = Math.floor(1000 + Math.random() * 9000);
  const rawToken = `XP-${randomPart1}-${randomPart2}`;
  
  // Store only the SHA-256 hash of the tracking token for security
  const trackingTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const jobRef = centerDoc.ref.collection("printJobs").doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const expiresAt = new Date(Date.now() + 24 * 3600000); // 24-hr expiry

  const sanitizedFileName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");

  await jobRef.set({
    jobId: jobRef.id,
    centerId: centerDoc.id,
    trackingTokenHash,
    originalFileName: sanitizedFileName,
    storagePath: `customer-uploads/${centerDoc.id}/${jobRef.id}/${sanitizedFileName}`,
    fileSizeBytes: Number(fileSizeBytes),
    mimeType: mimeType || "application/pdf",
    pageCount: Number(pageCount) || 1,
    copies: Number(copies) || 1,
    colorMode: colorMode === "color" ? "color" : "monochrome",
    duplex: Boolean(duplex),
    paperSize: ["A4", "A3", "Legal", "Letter"].includes(paperSize) ? paperSize : "A4",
    status: "submitted",
    customerNote: customerNote ? String(customerNote).substring(0, 200) : "",
    createdAt: now,
    updatedAt: now,
    expiresAt: expiresAt,
    completedAt: null
  });

  return {
    success: true,
    jobId: jobRef.id,
    trackingToken: rawToken // Returned once to customer
  };
}

/**
 * Update print job status by authorized Center Owner
 */
async function updatePrintJobStatus(data, context) {
  if (!context.auth) {
    throw new Error("UNAUTHENTICATED: Authentication required.");
  }

  const { centerId, jobId, nextStatus } = data;
  const userRole = context.auth.token.role;
  const userCenterId = context.auth.token.centerId;

  // Tenant isolation check
  if (userRole !== "superadmin" && (userRole !== "owner" || userCenterId !== centerId)) {
    throw new Error("PERMISSION_DENIED: Tenant isolation policy violation.");
  }

  const db = admin.firestore();
  const jobRef = db.collection("centers").doc(centerId).collection("printJobs").doc(jobId);
  const jobSnap = await jobRef.get();

  if (!jobSnap.exists) {
    throw new Error("NOT_FOUND: Print job does not exist.");
  }

  const job = jobSnap.data();
  const allowed = VALID_TRANSITIONS[job.status] || [];

  if (!allowed.includes(nextStatus)) {
    throw new Error(`INVALID_TRANSITION: Cannot transition from '${job.status}' to '${nextStatus}'.`);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const updateData = {
    status: nextStatus,
    updatedAt: now
  };

  if (nextStatus === "completed") {
    updateData.completedAt = now;
  }

  await jobRef.update(updateData);

  return { success: true, jobId, status: nextStatus };
}

module.exports = {
  submitPrintJob,
  updatePrintJobStatus
};
