/**
 * Client Database Connection & Operations Layer
 */

import { stateStore } from '../state.js';

export const dbClient = {
  // Centers
  getCenters() {
    return stateStore.getCenters();
  },

  getCenter(centerId) {
    return stateStore.getCenter(centerId);
  },

  saveCenter(center) {
    return stateStore.saveCenter(center);
  },

  // Jobs
  getJobs(centerId = null) {
    return stateStore.getJobs(centerId);
  },

  getJobByToken(token) {
    return stateStore.getJobByToken(token);
  },

  saveJob(job) {
    return stateStore.saveJob(job);
  },

  updateJobStatus(jobId, status, actor) {
    return stateStore.updateJobStatus(jobId, status, actor);
  },

  // Plans & Audits
  getPlans() {
    return stateStore.getPlans();
  },

  getAuditLogs() {
    return stateStore.getAuditLogs();
  },

  addAuditLog(entry) {
    return stateStore.addAuditLog(entry);
  },

  subscribe(callback) {
    return stateStore.subscribe(callback);
  }
};
