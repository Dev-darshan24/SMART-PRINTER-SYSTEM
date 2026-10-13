/**
 * Backend API Client Layer
 */

import { dbClient } from '../db/firestoreClient.js';

export const apiClient = {
  async getPublicCenter(publicId) {
    const center = dbClient.getCenter(publicId);
    if (!center) {
      throw new Error("Center not found or inactive.");
    }
    return {
      publicId: center.publicId,
      name: center.name,
      address: center.address,
      phone: center.phone,
      rates: center.rates,
      status: center.status
    };
  },

  async submitCustomerJob(payload) {
    if (!payload.centerId) throw new Error("Center ID is required.");
    if (!payload.file) throw new Error("File is required.");

    const p1 = Math.floor(1000 + Math.random() * 9000);
    const p2 = Math.floor(1000 + Math.random() * 9000);
    const trackingToken = `XP-${p1}-${p2}`;

    const newJob = {
      jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      centerId: payload.centerId,
      trackingToken,
      originalFileName: payload.file.name,
      storagePath: `customer-uploads/${payload.centerId}/${Date.now()}_${payload.file.name}`,
      fileSizeBytes: payload.file.size,
      mimeType: payload.file.type || 'application/pdf',
      pageCount: payload.pageCount || 1,
      copies: payload.copies || 1,
      colorMode: payload.colorMode || 'monochrome',
      duplex: !!payload.duplex,
      paperSize: payload.paperSize || 'A4',
      estimatedAmount: payload.estimatedAmount || 2.0,
      customerNote: payload.customerNote || '',
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600000).toISOString()
    };

    return dbClient.saveJob(newJob);
  },

  async getJobStatus(token) {
    const job = dbClient.getJobByToken(token);
    if (!job) {
      throw new Error("Invalid tracking code or job expired.");
    }
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

  async updateJobStatus(jobId, status, actor) {
    return dbClient.updateJobStatus(jobId, status, actor);
  },

  async provisionCenter(data) {
    const publicId = `CTR-${Math.floor(1000 + Math.random() * 9000)}`;
    const newCenter = {
      centerId: `center_${Date.now()}`,
      publicId,
      name: data.name,
      ownerUid: `owner_${Date.now()}`,
      ownerEmail: data.ownerEmail,
      slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      address: data.address || '',
      phone: data.phone || '',
      status: 'active',
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

    dbClient.saveCenter(newCenter);
    dbClient.addAuditLog({
      actorUid: "superadmin",
      action: "center.provision",
      targetType: "center",
      targetId: newCenter.centerId,
      centerId: newCenter.centerId,
      metadata: { name: newCenter.name, owner: newCenter.ownerEmail }
    });

    return newCenter;
  }
};
