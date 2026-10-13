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
  const steps = [
    { key: 'submitted', label: 'Submitted' },
    { key: 'under_review', label: 'Reviewing' },
    { key: 'printing', label: 'Printing' },
    { key: 'completed', label: 'Ready for Pickup' }
  ];

  const currentIdx = steps.findIndex(s => s.key === job.status);

  container.innerHTML = `
    <div class="tracking-card" style="margin-top: 1.5rem;">
      <span class="badge ${job.status === 'completed' ? 'badge-completed' : 'badge-under-review'}" style="margin-bottom: 0.5rem;">
        Status: ${job.status.toUpperCase()}
      </span>
      
      <h2>Pickup Code</h2>
      <div class="tracking-code-pill" id="copy-tracking-pill" style="cursor: pointer;" title="Click to copy">
        ${escapeHtml(job.trackingToken)}
        ${ICONS.copy}
      </div>
      <p class="text-sm text-muted">Show this code at the Xerox counter to collect your prints.</p>

      <!-- Stepper timeline -->
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
