/**
 * Reactive State Manager
 * Synchronizes in-memory state with localStorage and dispatches change events.
 */

import { INITIAL_CENTERS, INITIAL_JOBS, INITIAL_PLANS, INITIAL_AUDIT_LOGS } from './fixtures.js';

class StateStore {
  constructor() {
    this.listeners = new Set();
    this.init();
  }

  init() {
    // Purge legacy demo fixture data if present
    const demoCleanedKey = 'smartprint_demo_cleared_v1';
    if (!localStorage.getItem(demoCleanedKey)) {
      localStorage.removeItem('smartprint_centers');
      localStorage.removeItem('smartprint_jobs');
      localStorage.removeItem('smartprint_audit_logs');
      localStorage.setItem(demoCleanedKey, 'true');
    }

    if (!localStorage.getItem('smartprint_initialized') || !localStorage.getItem(demoCleanedKey)) {
      localStorage.setItem('smartprint_centers', JSON.stringify(INITIAL_CENTERS));
      localStorage.setItem('smartprint_jobs', JSON.stringify(INITIAL_JOBS));
      localStorage.setItem('smartprint_plans', JSON.stringify(INITIAL_PLANS));
      localStorage.setItem('smartprint_audit_logs', JSON.stringify(INITIAL_AUDIT_LOGS));
      localStorage.setItem('smartprint_initialized', 'true');
    }
  }

  getCenters() {
    const list = JSON.parse(localStorage.getItem('smartprint_centers') || '[]');
    const demoCenterIds = ['center_koramangala', 'center_indiranagar', 'center_whitefield'];
    const filtered = list.filter(c => !demoCenterIds.includes(c.centerId));
    if (filtered.length !== list.length) {
      localStorage.setItem('smartprint_centers', JSON.stringify(filtered));
    }
    return filtered;
  }

  getCenter(centerId) {
    if (!centerId) return this.getCenters()[0] || null;
    const cidStr = String(centerId).trim();
    return this.getCenters().find(c => 
      c.centerId === cidStr || 
      c.publicId === cidStr || 
      String(c.uniqueId) === cidStr ||
      ('CTR-' + String(c.uniqueId || '').substring(0, 6)) === cidStr
    ) || this.getCenters()[0] || null;
  }

  saveCenter(center) {
    const centers = this.getCenters();
    const idx = centers.findIndex(c => c.centerId === center.centerId);
    if (idx >= 0) {
      centers[idx] = { ...centers[idx], ...center, updatedAt: new Date().toISOString() };
    } else {
      centers.push(center);
    }
    localStorage.setItem('smartprint_centers', JSON.stringify(centers));
    this.notify('centers', centers);
  }

  getJobs(centerId = null) {
    const list = JSON.parse(localStorage.getItem('smartprint_jobs') || '[]');
    const demoJobIds = ['job_101', 'job_102', 'job_103', 'job_104'];

    // Auto-delete data older than 1 year (365 days retention policy)
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const isWithinOneYear = (j) => {
      const time = new Date(j.createdAt || j.updatedAt || 0).getTime();
      if (isNaN(time) || time <= 0) return true;
      return (now - time) <= ONE_YEAR_MS;
    };

    const filtered = list.filter(j => !demoJobIds.includes(j.jobId) && isWithinOneYear(j));
    if (filtered.length !== list.length) {
      localStorage.setItem('smartprint_jobs', JSON.stringify(filtered));
    }
    if (centerId) {
      return filtered.filter(j => j.centerId === centerId);
    }
    return filtered;
  }

  getJobByToken(token) {
    const jobs = this.getJobs();
    const cleanToken = token.trim().toUpperCase();
    return jobs.find(j => j.trackingToken.toUpperCase() === cleanToken);
  }

  saveJob(job) {
    const jobs = this.getJobs();
    const idx = jobs.findIndex(j => j.jobId === job.jobId);
    if (idx >= 0) {
      jobs[idx] = { ...jobs[idx], ...job, updatedAt: new Date().toISOString() };
    } else {
      jobs.unshift(job);
    }
    localStorage.setItem('smartprint_jobs', JSON.stringify(jobs));
    this.notify('jobs', jobs);
    return jobs[idx >= 0 ? idx : 0];
  }

  updateJobStatus(jobId, newStatus, actor = "owner") {
    const validTransitions = {
      submitted: ["under_review", "cancelled", "rejected"],
      under_review: ["printing", "rejected", "cancelled"],
      printing: ["completed", "rejected"],
      completed: [],
      rejected: [],
      cancelled: []
    };

    const jobs = this.getJobs();
    const job = jobs.find(j => j.jobId === jobId);
    if (!job) throw new Error("Job not found");

    const allowed = validTransitions[job.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid status transition from '${job.status}' to '${newStatus}'`);
    }

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();
    if (newStatus === "completed") {
      job.completedAt = new Date().toISOString();
    }

    localStorage.setItem('smartprint_jobs', JSON.stringify(jobs));
    
    // Log audit event
    this.addAuditLog({
      actorUid: actor,
      action: "job.status_change",
      targetType: "printJob",
      targetId: jobId,
      centerId: job.centerId,
      metadata: { newStatus }
    });

    this.notify('jobs', jobs);
    return job;
  }

  getPlans() {
    return JSON.parse(localStorage.getItem('smartprint_plans') || '[]');
  }

  savePlan(plan) {
    const plans = this.getPlans();
    const idx = plans.findIndex(p => p.planId === plan.planId);
    if (idx >= 0) {
      plans[idx] = { ...plans[idx], ...plan, updatedAt: new Date().toISOString() };
    } else {
      plans.push(plan);
    }
    localStorage.setItem('smartprint_plans', JSON.stringify(plans));
    this.notify('plans', plans);
  }

  getAuditLogs() {
    const list = JSON.parse(localStorage.getItem('smartprint_audit_logs') || '[]');
    const demoLogIds = ['log_001', 'log_002', 'log_003'];
    const filtered = list.filter(l => !demoLogIds.includes(l.logId));
    if (filtered.length !== list.length) {
      localStorage.setItem('smartprint_audit_logs', JSON.stringify(filtered));
    }
    return filtered;
  }

  addAuditLog(entry) {
    const logs = this.getAuditLogs();
    const newLog = {
      logId: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...entry
    };
    logs.unshift(newLog);
    localStorage.setItem('smartprint_audit_logs', JSON.stringify(logs.slice(0, 100)));
    this.notify('auditLogs', logs);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(eventType, data) {
    this.listeners.forEach(cb => cb(eventType, data));
  }

  resetStore() {
    localStorage.removeItem('smartprint_initialized');
    localStorage.removeItem('smartprint_centers');
    localStorage.removeItem('smartprint_jobs');
    localStorage.removeItem('smartprint_plans');
    localStorage.removeItem('smartprint_audit_logs');
    localStorage.setItem('smartprint_demo_cleared_v1', 'true');
    this.init();
    window.location.reload();
  }
}

export const stateStore = new StateStore();
