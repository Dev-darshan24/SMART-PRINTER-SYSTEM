/**
 * Abstracted API Client
 * Seamlessly interfaces with local reactive state or Firebase Cloud Functions.
 */

import { stateStore } from './state.js';

export const api = {
  // Public customer APIs
  async getPublicCenter(publicOrCenterId) {
    const center = stateStore.getCenter(publicOrCenterId);
    if (!center) {
      throw new Error("Center not found or inactive.");
    }
    // Return only public non-sensitive fields as per security docs
    return {
      publicId: center.publicId || center.centerId,
      name: center.storeName || center.name || "Xerox Center",
      address: center.address || "Counter Pickup",
      phone: center.phone || "",
      rates: center.rates,
      printerRouting: center.printerRouting,
      status: center.status || "active"
    };
  },

  async submitPrintJob(payload) {
    if (!payload.centerId) throw new Error("Center ID is required");

    // Support multiple materials or single file fallback
    const rawFiles = payload.files && payload.files.length > 0 
      ? payload.files 
      : (payload.file ? [payload.file] : []);

    if (rawFiles.length === 0) throw new Error("At least one document or scan is required");

    const filesSummary = rawFiles.map(f => ({
      name: f.name || 'Document',
      size: f.size || 0,
      type: f.type || 'image/jpeg',
      estimatedPages: f.estimatedPages || 1,
      isCameraScan: !!f.isCameraScan
    }));

    const firstFileName = rawFiles[0].name || 'Document';
    const originalFileName = rawFiles.length > 1 
      ? `${firstFileName} + ${rawFiles.length - 1} more material${rawFiles.length > 2 ? 's' : ''}`
      : firstFileName;

    // Generate high-entropy tracking code (e.g. XP-4821-9923)
    const part1 = Math.floor(1000 + Math.random() * 9000);
    const part2 = Math.floor(1000 + Math.random() * 9000);
    const trackingToken = `XP-${part1}-${part2}`;

    const totalEstimatedPages = rawFiles.reduce((acc, f) => acc + (f.estimatedPages || 1), 0);

    const newJob = {
      jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      centerId: payload.centerId,
      trackingToken,
      originalFileName,
      files: filesSummary,
      fileCount: rawFiles.length,
      storagePath: `customer-uploads/${payload.centerId}/${Date.now()}_${firstFileName}`,
      fileSizeBytes: rawFiles.reduce((acc, f) => acc + (f.size || 0), 0),
      mimeType: rawFiles[0].type || 'application/pdf',
      pageCount: totalEstimatedPages,
      copies: payload.copies || 1,
      colorMode: payload.colorMode || 'monochrome',
      duplex: !!payload.duplex,
      paperSize: payload.paperSize || 'A4',
      estimatedAmount: payload.estimatedAmount || 2.0,
      customerNote: payload.customerNote || '',
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600000).toISOString() // 24-hr retention
    };

    return stateStore.saveJob(newJob);
  },

  async getJobStatus(trackingToken) {
    const job = stateStore.getJobByToken(trackingToken);
    if (!job) {
      throw new Error("Invalid tracking code or job expired.");
    }
    // Return restricted status data without raw storage paths or internal PII
    return {
      jobId: job.jobId,
      trackingToken: job.trackingToken,
      originalFileName: job.originalFileName,
      status: job.status,
      copies: job.copies,
      paperSize: job.paperSize,
      colorMode: job.colorMode,
      duplex: job.duplex,
      pageCount: job.pageCount,
      estimatedAmount: job.estimatedAmount,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt
    };
  },

  // Owner management APIs
  async getQueue(centerId) {
    return stateStore.getJobs(centerId);
  },

  async updateJobStatus(jobId, status) {
    return stateStore.updateJobStatus(jobId, status);
  },

  async updateCenterProfile(centerId, profile) {
    return stateStore.saveCenter({ centerId, ...profile });
  },

  // Superadmin APIs
  async getCenters() {
    return stateStore.getCenters();
  },

  async createCenter(centerData) {
    const publicId = `CTR-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCenter = {
      centerId: `center_${Date.now()}`,
      publicId,
      name: centerData.name,
      ownerUid: `owner_${Date.now()}`,
      ownerEmail: centerData.ownerEmail,
      slug: centerData.slug || centerData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      address: centerData.address,
      phone: centerData.phone,
      status: "active",
      subscriptionId: null,
      rates: {
        bwSingle: 2.0,
        bwDouble: 3.5,
        colorSingle: 10.0,
        colorDouble: 18.0
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    stateStore.saveCenter(newCenter);
    stateStore.addAuditLog({
      actorUid: "superadmin",
      action: "center.create",
      targetType: "center",
      targetId: newCenter.centerId,
      centerId: newCenter.centerId,
      metadata: { name: newCenter.name, owner: newCenter.ownerEmail }
    });
    return newCenter;
  },

  async getPlans() {
    return stateStore.getPlans();
  },

  async getAuditLogs() {
    return stateStore.getAuditLogs();
  }
};
