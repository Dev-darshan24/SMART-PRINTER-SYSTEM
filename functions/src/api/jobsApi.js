const crypto = require("crypto");
const { getCenterByPublicId } = require("../db/centersDb");
const { createJobRecord, getJobById, updateJobRecord } = require("../db/jobsDb");
const { requireCenterOwner } = require("../auth/middleware");

const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const VALID_TRANSITIONS = {
  submitted: ["under_review", "cancelled", "rejected"],
  under_review: ["printing", "rejected", "cancelled"],
  printing: ["completed", "rejected"],
  completed: [],
  rejected: [],
  cancelled: []
};

async function submitCustomerPrintJob(data) {
  const { centerId, fileName, fileSizeBytes, mimeType, pageCount, copies, colorMode, duplex, paperSize, customerNote } = data;

  if (!centerId || !fileName || !fileSizeBytes) {
    throw new Error("INVALID_ARGUMENT: Missing required print job fields.");
  }

  if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE: Only PDF and image uploads allowed.");
  }

  if (fileSizeBytes > 25 * 1024 * 1024) {
    throw new Error("FILE_TOO_LARGE: Upload limit is 25 MB.");
  }

  const center = await getCenterByPublicId(centerId);
  if (!center || center.status !== "active") {
    throw new Error("FAILED_PRECONDITION: Center is not currently active.");
  }

  // Generate high-entropy tracking code
  const p1 = Math.floor(1000 + Math.random() * 9000);
  const p2 = Math.floor(1000 + Math.random() * 9000);
  const rawToken = `XP-${p1}-${p2}`;
  const trackingTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const sanitizedFileName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const expiresAt = new Date(Date.now() + 24 * 3600000); // 24 hours

  const job = await createJobRecord(center.id, {
    trackingTokenHash,
    originalFileName: sanitizedFileName,
    storagePath: `customer-uploads/${center.id}/${Date.now()}_${sanitizedFileName}`,
    fileSizeBytes: Number(fileSizeBytes),
    mimeType: mimeType || "application/pdf",
    pageCount: Number(pageCount) || 1,
    copies: Number(copies) || 1,
    colorMode: colorMode === "color" ? "color" : "monochrome",
    duplex: Boolean(duplex),
    paperSize: ["A4", "A3", "Legal", "Letter"].includes(paperSize) ? paperSize : "A4",
    status: "submitted",
    customerNote: customerNote ? String(customerNote).substring(0, 200) : "",
    expiresAt,
    completedAt: null
  });

  return {
    success: true,
    jobId: job.jobId,
    trackingToken: rawToken
  };
}

async function updateStatus(data, context) {
  const { centerId, jobId, nextStatus } = data;
  requireCenterOwner(context, centerId);

  const currentJob = await getJobById(centerId, jobId);
  if (!currentJob) {
    throw new Error("NOT_FOUND: Print job not found.");
  }

  const allowed = VALID_TRANSITIONS[currentJob.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`INVALID_TRANSITION: Cannot transition from '${currentJob.status}' to '${nextStatus}'.`);
  }

  const updates = { status: nextStatus };
  if (nextStatus === "completed") {
    updates.completedAt = new Date();
  }

  return updateJobRecord(centerId, jobId, updates);
}

module.exports = {
  submitCustomerPrintJob,
  updateStatus
};
