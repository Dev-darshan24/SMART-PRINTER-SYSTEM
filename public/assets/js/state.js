/**
 * Reactive State Manager
 * Synchronizes in-memory state with localStorage and dispatches change events.
 */

import { INITIAL_CENTERS, INITIAL_JOBS, INITIAL_PLANS, INITIAL_AUDIT_LOGS } from './fixtures.js';

export const DEMO_PRINTER_NAMES = [
  'HP LaserJet Pro M404dn',
  'Epson EcoTank L3250 Series',
  'Canon imageRUNNER 2525',
  'Brother MFC-L8690CDW',
  'Ricoh Aficio MP 2014',
  'Konica Minolta bizhub 225i',
  'TVS MSP 240 Star'
];

export function isDemoPrinterName(name) {
  if (!name || typeof name !== 'string') return false;
  const n = name.trim().toLowerCase();
  if (n === 'none' || n.includes('scanning') || n.includes('no printer')) return false;
  return DEMO_PRINTER_NAMES.some(d => d.toLowerCase() === n) ||
         n.includes('demo') ||
         n.includes('sample') ||
         n.includes('fake');
}

export function cleanPrinterRouting(routing) {
  if (!routing || typeof routing !== 'object') {
    return { bwPriority: [], colorPriority: [], autoFailover: true, autoDuplexMatch: true };
  }
  const cleanList = (list) => {
    if (!Array.isArray(list)) return [];
    return list.filter(p => p && p !== 'None' && !isDemoPrinterName(p) && !p.includes('No printer') && !p.includes('Scanning'));
  };
  return {
    ...routing,
    bwPriority: cleanList(routing.bwPriority),
    colorPriority: cleanList(routing.colorPriority),
    autoFailover: routing.autoFailover !== false,
    autoDuplexMatch: routing.autoDuplexMatch !== false
  };
}

class StateStore {
  constructor() {
    this.listeners = new Set();
    this.init();
  }

  init() {
    // Purge legacy demo fixture data and demo printer sequence routing if present
    const demoCleanedKey = 'smartprint_demo_cleared_v2';
    if (!localStorage.getItem(demoCleanedKey)) {
      localStorage.removeItem('smartprint_centers');
      localStorage.removeItem('smartprint_jobs');
      localStorage.removeItem('smartprint_audit_logs');

      // Purge demo printer routing stored in localStorage
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('smartprint_routing_') || key.startsWith('smartprint_center_'))) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (key.startsWith('smartprint_routing_')) {
                const cleaned = cleanPrinterRouting(parsed);
                localStorage.setItem(key, JSON.stringify(cleaned));
              } else if (parsed && parsed.printerRouting) {
                parsed.printerRouting = cleanPrinterRouting(parsed.printerRouting);
                localStorage.setItem(key, JSON.stringify(parsed));
              }
            }
          }
        }
      } catch (e) {}

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
    let modified = false;
    const filtered = list.filter(c => !demoCenterIds.includes(c.centerId)).map(c => {
      if (c.printerRouting) {
        const cleaned = cleanPrinterRouting(c.printerRouting);
        if (JSON.stringify(cleaned) !== JSON.stringify(c.printerRouting)) {
          c.printerRouting = cleaned;
          modified = true;
        }
      }
      return c;
    });
    if (filtered.length !== list.length || modified) {
      localStorage.setItem('smartprint_centers', JSON.stringify(filtered));
    }
    return filtered;
  }

  getCenter(centerId) {
    if (!centerId) return this.getCenters()[0] || null;
    const cidStr = String(centerId).trim();
    const found = this.getCenters().find(c => 
      c.centerId === cidStr || 
      c.publicId === cidStr || 
      String(c.uniqueId) === cidStr ||
      ('CTR-' + String(c.uniqueId || '').substring(0, 6)) === cidStr
    );
    if (found) return found;

    // Check user-specific direct storage
    const directRaw = localStorage.getItem(`smartprint_center_${cidStr}`);
    if (directRaw) {
      try {
        const parsed = JSON.parse(directRaw);
        if (parsed && parsed.printerRouting) {
          parsed.printerRouting = cleanPrinterRouting(parsed.printerRouting);
        }
        return parsed;
      } catch (e) {}
    }

    return null;
  }

  getCenterByPublicId(publicId) {
    if (!publicId) return null;
    return this.getCenter(publicId);
  }

  saveCenter(center) {
    if (!center || !center.centerId) return;
    const cleanedCenter = { ...center };
    if (cleanedCenter.printerRouting) {
      cleanedCenter.printerRouting = cleanPrinterRouting(cleanedCenter.printerRouting);
    }
    const centers = this.getCenters();
    const idx = centers.findIndex(c => c.centerId === cleanedCenter.centerId);
    const updated = { ...(centers[idx] || {}), ...cleanedCenter, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      centers[idx] = updated;
    } else {
      centers.push(updated);
    }
    localStorage.setItem('smartprint_centers', JSON.stringify(centers));
    localStorage.setItem(`smartprint_center_${cleanedCenter.centerId}`, JSON.stringify(updated));
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

  getJob(jobId) {
    if (!jobId) return null;
    return this.getJobs().find(j => j.jobId === jobId) || null;
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

  updateJobStatus(jobId, newStatus, actor = "owner", centerId = null) {
    const validTransitions = {
      submitted: ["under_review", "approved_awaiting_cash", "cancelled", "rejected"],
      pending_confirmation: ["approved_awaiting_cash", "rejected", "cancelled"],
      approved_awaiting_cash: ["payment_confirmed", "queued", "rejected", "cancelled"],
      payment_confirmed: ["queued", "printing", "cancelled"],
      queued: ["printing", "cancelled"],
      under_review: ["approved_awaiting_cash", "payment_confirmed", "printing", "rejected", "cancelled"],
      printing: ["completed", "rejected", "failed"],
      completed: [],
      rejected: [],
      cancelled: [],
      failed: []
    };

    const jobs = this.getJobs();
    const job = jobs.find(j => j.jobId === jobId);
    if (!job) throw new Error("Job not found");

    // Tenant isolation verification: enforce center matching
    if (centerId && job.centerId !== centerId) {
      throw new Error("PERMISSION_DENIED: Tenant isolation violation. Cannot alter order for another print center.");
    }

    const allowed = validTransitions[job.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid status transition from '${job.status}' to '${newStatus}'`);
    }

    job.status = newStatus;
    job.updatedAt = new Date().toISOString();
    if (newStatus === "completed") {
      job.completedAt = new Date().toISOString();
    }
    if (newStatus === "payment_confirmed") {
      job.paymentStatus = "paid";
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
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('smartprint_routing_') || key.startsWith('smartprint_rates_') || key.startsWith('smartprint_center_'))) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {}
    localStorage.setItem('smartprint_demo_cleared_v1', 'true');
    localStorage.setItem('smartprint_demo_cleared_v2', 'true');
    this.init();
    window.location.reload();
  }
}

export const stateStore = new StateStore();
