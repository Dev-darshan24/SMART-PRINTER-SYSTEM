/**
 * Real-time Job Tracking Controller
 */

import { api } from './api.js';
import { stateStore } from './state.js';
import { 
  ICONS, 
  showToast, 
  formatCurrencyINR, 
  formatTimeAgo, 
  copyToClipboard, 
  escapeHtml 
} from './ui.js';

let currentToken = null;

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const searchForm = document.getElementById('tracking-search-form');
  const searchInput = document.getElementById('tracking-input');

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = searchInput.value.trim().toUpperCase();
      if (!code) {
        showToast("Please enter your tracking code", "warning");
        return;
      }
      loadJob(code);
    });
  }

  if (token) {
    if (searchInput) searchInput.value = token;
    loadJob(token);
  }

  // Subscribe to changes
  stateStore.subscribe((event) => {
    if (event === 'jobs' && currentToken) {
      loadJob(currentToken, false);
    }
  });

  // Dark / Light Theme Toggle Handler
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIconSun = document.getElementById('theme-icon-sun');
  const themeIconMoon = document.getElementById('theme-icon-moon');
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('smartprint_theme', theme);
    if (theme === 'dark') {
      if (themeIconSun) themeIconSun.style.display = 'inline-flex';
      if (themeIconMoon) themeIconMoon.style.display = 'none';
    } else {
      if (themeIconSun) themeIconSun.style.display = 'none';
      if (themeIconMoon) themeIconMoon.style.display = 'inline-flex';
    }
  };
  applyTheme(localStorage.getItem('smartprint_theme') || 'light');
  themeToggleBtn?.addEventListener('click', () => {
    const active = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(active === 'dark' ? 'light' : 'dark');
  });
});


async function loadJob(token, notify = true) {
  currentToken = token;
  const container = document.getElementById('tracking-result-container');
  if (!container) return;

  try {
    const job = await api.getJobStatus(token);
    renderTrackingDetails(job, container);
    if (notify) showToast("Tracking details loaded", "info");
  } catch (err) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 2.5rem; text-align: center; margin-top: 1.5rem;">
        <div style="color: var(--error-solid); margin-bottom: 0.75rem;">${ICONS.alertCircle}</div>
        <h3>Job Not Found or Expired</h3>
        <p class="text-sm text-muted">Double-check the tracking code on your receipt or submit a new document.</p>
        <a href="/customer/" class="btn btn-secondary btn-sm" style="margin-top: 1rem;">
          Submit New Print
        </a>
      </div>
    `;
  }
}

function renderTrackingDetails(job, container) {
  const statusInfoMap = {
    pending_confirmation: {
      title: "Awaiting Owner Confirmation",
      desc: "Your print request has been submitted and is waiting for confirmation from the print center.",
      badgeClass: "badge-submitted",
      stepIndex: 0
    },
    submitted: {
      title: "Awaiting Confirmation",
      desc: "Your order is waiting for confirmation from the print center.",
      badgeClass: "badge-submitted",
      stepIndex: 0
    },
    under_review: {
      title: "Under Review",
      desc: "The print center is reviewing your document and settings.",
      badgeClass: "badge-under-review",
      stepIndex: 1
    },
    approved_awaiting_cash: {
      title: "Approved • Awaiting Cash Payment",
      desc: `Your order is approved! Please pay ₹${(job.estimatedAmount || 0).toFixed(2)} cash at the counter to release your prints.`,
      badgeClass: "badge-under-review",
      stepIndex: 1
    },
    payment_confirmed: {
      title: "Cash Received • Queued for Printing",
      desc: "Cash payment confirmed. Your document is queued for the store printer.",
      badgeClass: "badge-completed",
      stepIndex: 2
    },
    queued: {
      title: "Queued for Printing",
      desc: "Your document is in the store printer queue.",
      badgeClass: "badge-completed",
      stepIndex: 2
    },
    printing: {
      title: "Printing Now",
      desc: "Your document is actively being printed by the authorized store printer.",
      badgeClass: "badge-printing",
      stepIndex: 3
    },
    completed: {
      title: "Completed • Ready for Pickup",
      desc: "Your print job is ready! Please collect your prints at the Xerox counter.",
      badgeClass: "badge-completed",
      stepIndex: 4
    },
    rejected: {
      title: "Order Rejected",
      desc: "The print center was unable to accept this print request. Please contact the counter staff.",
      badgeClass: "badge-rejected",
      stepIndex: -1
    },
    failed: {
      title: "Print Failed",
      desc: "A hardware issue occurred while printing. Please speak with the counter staff for immediate resolution.",
      badgeClass: "badge-rejected",
      stepIndex: -1
    },
    cancelled: {
      title: "Order Cancelled",
      desc: "This print request was cancelled.",
      badgeClass: "badge-rejected",
      stepIndex: -1
    }
  };

  const statusMeta = statusInfoMap[job.status] || {
    title: job.status.toUpperCase(),
    desc: "Order status update from print center.",
    badgeClass: "badge-submitted",
    stepIndex: 0
  };

  const steps = [
    { label: 'Submitted' },
    { label: 'Approved' },
    { label: 'Cash Paid' },
    { label: 'Printing' },
    { label: 'Ready' }
  ];

  const currentIdx = statusMeta.stepIndex;
  const isTerminalNegative = ['rejected', 'failed', 'cancelled'].includes(job.status);

  container.innerHTML = `
    <div class="tracking-card" style="margin-top: 1.5rem;">
      <span class="badge ${statusMeta.badgeClass}" style="margin-bottom: 0.5rem; font-size: 0.8125rem;">
        ${escapeHtml(statusMeta.title)}
      </span>

      <p class="text-sm" style="color: var(--text-main); margin-bottom: 1.25rem; font-weight: 500;">
        ${escapeHtml(statusMeta.desc)}
      </p>
      
      <h2>Pickup Code</h2>
      <div class="tracking-code-pill" id="copy-tracking-pill" style="cursor: pointer;" title="Click to copy">
        ${escapeHtml(job.trackingToken)}
        ${ICONS.copy}
      </div>
      <p class="text-sm text-muted">Show this code at the Xerox counter to verify and collect your prints.</p>

      <!-- Stepper timeline -->
      ${!isTerminalNegative ? `
        <div class="stepper-timeline">
          ${steps.map((step, idx) => {
            let stateClass = '';
            if (idx < currentIdx) stateClass = 'completed';
            else if (idx === currentIdx) stateClass = 'current';
            
            return `
              <div class="step-item ${stateClass}">
                <div class="step-circle">${idx < currentIdx ? ICONS.check : (idx + 1)}</div>
                <div class="step-title">${step.label}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div class="alert alert-error" style="margin-top: 1rem; text-align: left; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--error-solid); border-radius: var(--radius-md); padding: 0.75rem 1rem;">
          <strong>Order Status: ${escapeHtml(statusMeta.title)}</strong>
          <p class="text-xs" style="margin-top: 0.25rem;">${escapeHtml(statusMeta.desc)}</p>
        </div>
      `}

      <!-- Job summary grid -->
      <div class="glass-panel" style="padding: 1.25rem; text-align: left; margin-top: 1.5rem; background: var(--bg-surface-subtle);">
        <div class="font-semibold text-main" style="margin-bottom: 0.25rem;">${escapeHtml(job.originalFileName)}</div>
        ${job.fileCount > 1 ? `<div class="text-xs text-muted" style="margin-bottom: 0.5rem;">${job.fileCount} Materials Attached &bull; ${job.pageCount || 1} Total Pages</div>` : ''}
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; font-size: 0.8125rem;">
          <div><span class="text-muted">Copies:</span> <strong>${job.copies}</strong></div>
          <div><span class="text-muted">Paper:</span> <strong>${job.paperSize}</strong></div>
          <div><span class="text-muted">Color:</span> <strong>${job.colorMode === 'color' ? 'Full Color' : 'B&W (Monochrome)'}</strong></div>
          <div><span class="text-muted">Sides:</span> <strong>${job.duplex ? 'Double-sided (2-Sided)' : 'Single-sided (1-Sided)'}</strong></div>
          <div><span class="text-muted">Estimated Cost:</span> <strong style="color: var(--primary-700);">${formatCurrencyINR(job.estimatedAmount || 0)}</strong></div>
          <div><span class="text-muted">Submitted:</span> <strong>${formatTimeAgo(job.createdAt)}</strong></div>
          ${job.routedPrinter ? `<div><span class="text-muted">Device:</span> <strong>${escapeHtml(job.routedPrinter)} ${job.isFailover ? '<span class="badge badge-submitted text-xs">Failover</span>' : ''}</strong></div>` : ''}
        </div>
      </div>

      <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; justify-content: center;">
        <button class="btn btn-secondary btn-sm" onclick="window.location.reload()">
          ${ICONS.refresh} Refresh Status
        </button>
        <a href="/customer/" class="btn btn-ghost btn-sm">
          Submit Another Document
        </a>
      </div>
    </div>
  `;

  document.getElementById('copy-tracking-pill')?.addEventListener('click', () => {
    copyToClipboard(job.trackingToken, "Tracking code copied!");
  });
}
