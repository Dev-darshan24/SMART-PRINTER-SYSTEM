/**
 * Superadmin Portal Controller
 */

import { auth, USER_ROLES } from './auth.js';
import { stateStore } from './state.js';
import { api } from './api.js';
import { 
  ICONS, 
  showToast, 
  formatCurrencyINR, 
  formatTimeAgo, 
  openModal, 
  closeModal, 
  escapeHtml 
} from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Protect page
  if (!auth.protectPage([USER_ROLES.SUPERADMIN])) return;

  // Display active superadmin identity in sidebar
  const currentUser = auth.getCurrentUser();
  if (currentUser) {
    const roleEl = document.querySelector('.user-profile-badge .user-role');
    if (roleEl) roleEl.textContent = currentUser.email || 'admin@smartprint.io';
    const nameEl = document.querySelector('.user-profile-badge .user-name');
    if (nameEl) nameEl.textContent = currentUser.displayName || 'Super Administrator';
  }

  renderStats();
  renderCenters();
  renderPlans();
  renderAuditLogs();

  // Provision center modal listeners
  const btnOpenProvision = document.getElementById('btn-open-provision');
  if (btnOpenProvision) {
    btnOpenProvision.addEventListener('click', () => openModal('provision-modal'));
  }

  const btnCloseProvision = document.getElementById('btn-close-provision');
  if (btnCloseProvision) {
    btnCloseProvision.addEventListener('click', () => closeModal('provision-modal'));
  }

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


  const formProvision = document.getElementById('form-provision-center');
  if (formProvision) {
    formProvision.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-center-name').value.trim();
      const ownerEmail = document.getElementById('new-owner-email').value.trim();
      const address = document.getElementById('new-center-address').value.trim();
      const phone = document.getElementById('new-center-phone').value.trim();

      if (!name || !ownerEmail) {
        showToast("Center name and owner email are required", "error");
        return;
      }

      try {
        await api.createCenter({ name, ownerEmail, address, phone });
        showToast(`Center '${name}' created and owner provisioned!`, 'success');
        closeModal('provision-modal');
        formProvision.reset();
        renderStats();
        renderCenters();
        renderAuditLogs();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => auth.logout());

  stateStore.subscribe(() => {
    renderStats();
    renderCenters();
    renderAuditLogs();
  });
});

function renderStats() {
  const centers = stateStore.getCenters();
  const activeCenters = centers.filter(c => c.status === 'active');
  const jobs = stateStore.getJobs();
  const plans = stateStore.getPlans();

  // MRR estimation based on active centers
  const mrr = activeCenters.length * 999;

  const elCenters = document.getElementById('admin-stat-centers');
  if (elCenters) elCenters.textContent = centers.length;

  const elActive = document.getElementById('admin-stat-active');
  if (elActive) elActive.textContent = activeCenters.length;

  const elMrr = document.getElementById('admin-stat-mrr');
  if (elMrr) elMrr.textContent = formatCurrencyINR(mrr);

  const elJobs = document.getElementById('admin-stat-jobs');
  if (elJobs) elJobs.textContent = jobs.length;
}

function renderCenters() {
  const tbody = document.getElementById('centers-table-body');
  if (!tbody) return;

  const centers = stateStore.getCenters();
  if (centers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2.5rem 1rem;">No Xerox centers provisioned yet. Click "Provision Center" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = centers.map(c => `
    <tr>
      <td>
        <div class="font-semibold text-main">${escapeHtml(c.name)}</div>
        <div class="text-xs text-muted">${escapeHtml(c.address || 'Address not set')}</div>
      </td>
      <td>
        <span class="font-mono text-sm" style="background: var(--primary-50); padding: 2px 6px; border-radius: 4px;">
          ${c.publicId}
        </span>
      </td>
      <td>
        <div class="text-sm">${escapeHtml(c.ownerEmail)}</div>
        <div class="text-xs text-muted">${escapeHtml(c.phone || '')}</div>
      </td>
      <td>
        <span class="badge ${c.status === 'active' ? 'badge-completed' : 'badge-rejected'}">
          ${c.status}
        </span>
      </td>
      <td>
        <span class="text-xs font-semibold" style="color: var(--primary-700);">Growth Plan (Active)</span>
      </td>
      <td class="text-right">
        <a href="/customer/?center=${c.publicId}" target="_blank" class="btn btn-ghost btn-sm">
          ${ICONS.eye} View QR Page
        </a>
      </td>
    </tr>
  `).join('');
}

function renderPlans() {
  const grid = document.getElementById('plans-grid');
  if (!grid) return;

  const plans = stateStore.getPlans();
  grid.innerHTML = plans.map(p => `
    <div class="glass-panel" style="padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div class="flex justify-between items-center" style="margin-bottom: 0.5rem;">
          <h3 style="font-size: 1.1rem;">${escapeHtml(p.name)}</h3>
          <span class="badge badge-active">${p.isActive ? 'Active' : 'Archived'}</span>
        </div>
        <div style="font-size: 1.75rem; font-weight: 800; color: var(--primary-700); margin-bottom: 1rem;">
          ${formatCurrencyINR(p.pricePaise / 100)} <span style="font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">/ ${p.billingInterval}</span>
        </div>
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; font-size: 0.875rem;">
          ${p.features.map(f => `<li class="flex items-center gap-2">${ICONS.check} ${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
      <button class="btn btn-secondary btn-sm w-full" onclick="alert('Plan editor: ${escapeHtml(p.name)}')">
        Edit Plan Pricing
      </button>
    </div>
  `).join('');
}

function renderAuditLogs() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  const logs = stateStore.getAuditLogs();
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 2.5rem 1rem;">No audit logs recorded yet. Platform activity will appear here.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>
        <span class="font-mono text-xs font-semibold text-main">${escapeHtml(l.action)}</span>
      </td>
      <td class="text-xs text-muted">${escapeHtml(l.actorUid)}</td>
      <td class="text-xs font-mono">${escapeHtml(JSON.stringify(l.metadata || {}))}</td>
      <td class="text-xs text-muted text-right">${formatTimeAgo(l.createdAt)}</td>
    </tr>
  `).join('');
}
