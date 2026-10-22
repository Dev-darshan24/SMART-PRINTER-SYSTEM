/**
 * Center Owner Dashboard Controller
 */

import { auth, USER_ROLES } from './auth.js';
import { stateStore } from './state.js';
import { api } from './api.js';
import { 
  db, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  serverTimestamp 
} from './firebase-config.js';
import { 
  ICONS, 
  showToast, 
  formatCurrencyINR, 
  formatBytes, 
  formatTimeAgo, 
  getStatusBadge, 
  openModal, 
  closeModal, 
  copyToClipboard,
  escapeHtml 
} from './ui.js';
import { drawNormalQrToCanvas, generateNormalQrDataUrl } from './utils/qr.js';

let currentFilter = 'all';
let currentActiveView = 'queue';
let currentHistoryRange = 'all';
let currentAnalyticsRange = 'all';
let currentAnalyticsCustomStart = null;
let currentAnalyticsCustomEnd = null;
let currentAnalyticsTableSearch = '';
let currentAnalyticsTableStatus = 'all';
let currentAnalyticsTablePage = 1;
let currentAnalyticsPrintTypeMetric = 'jobs';
export let currentDetectedPrinters = [];

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

export const STORE_HARDWARE_PRESETS = [];

export function buildPrinterOptionsHtml(selectedPrinterName, isFirstSlot = false) {
  const externalPrinters = (currentDetectedPrinters || []).filter(p => !p.isVirtual && p.isExternal !== false && !isDemoPrinterName(p.name));
  const optionsMap = new Map();

  // 1. Only real detected external hardware printers physically connected to this device
  externalPrinters.forEach(p => {
    if (!isDemoPrinterName(p.name)) {
      optionsMap.set(p.name, `${escapeHtml(p.name)} (${escapeHtml(p.port || 'USB/Local')})`);
    }
  });

  // Verify whether selectedPrinterName is currently connected to this device
  const isSelectedConnected = Boolean(
    selectedPrinterName && 
    selectedPrinterName !== 'None' && 
    !selectedPrinterName.includes('No printer') && 
    !selectedPrinterName.includes('Scanning') && 
    !isDemoPrinterName(selectedPrinterName) &&
    optionsMap.has(selectedPrinterName)
  );

  let html = '';
  optionsMap.forEach((label, name) => {
    const isSelected = isSelectedConnected && selectedPrinterName === name;
    html += `<option value="${escapeHtml(name)}"${isSelected ? ' selected' : ''}>${label}</option>`;
  });

  // 2. None option
  // When no physical printers are connected to device, show "No printer connected to device"
  const isNoneSelected = !isSelectedConnected;
  const noneLabel = optionsMap.size > 0 ? 'None (Do Not Failover)' : 'No printer connected to device';
  html += `<option value="None"${isNoneSelected ? ' selected' : ''}>${noneLabel}</option>`;

  return html;
}


export function shortenPrinterName(name) {
  if (!name || name === 'None') return 'None';
  if (name.length > 18) return name.substring(0, 16) + '..';
  return name;
}

export function updatePrioritySummaryBadge() {
  const summaryBadge = document.getElementById('priority-rule-summary');
  if (!summaryBadge) return;

  const bwContainer = document.getElementById('bw-priority-steps-list');
  const colorContainer = document.getElementById('color-priority-steps-list');

  const bwSelects = bwContainer
    ? Array.from(bwContainer.querySelectorAll('select'))
    : [document.getElementById('seq-bw-p1'), document.getElementById('seq-bw-p2'), document.getElementById('seq-bw-p3')].filter(Boolean);

  const colSelects = colorContainer
    ? Array.from(colorContainer.querySelectorAll('select'))
    : [document.getElementById('seq-color-p1'), document.getElementById('seq-color-p2'), document.getElementById('seq-color-p3')].filter(Boolean);

  const bwPrinters = bwSelects
    .map(s => s?.value)
    .filter(p => p && p !== 'None' && !p.includes('Scanning') && !p.includes('No printer') && !isDemoPrinterName(p));

  const colPrinters = colSelects
    .map(s => s?.value)
    .filter(p => p && p !== 'None' && !p.includes('Scanning') && !p.includes('No printer') && !isDemoPrinterName(p));

  const bw1 = document.getElementById('seq-bw-p1')?.value;
  const bw2 = document.getElementById('seq-bw-p2')?.value;
  const col1 = document.getElementById('seq-color-p1')?.value;
  const col2 = document.getElementById('seq-color-p2')?.value;

  if (bwPrinters.length === 0 && colPrinters.length === 0 && (!bw1 || bw1 === 'None' || bw1.includes('Scanning') || bw1.includes('No printer') || isDemoPrinterName(bw1))) {
    summaryBadge.textContent = "No printers connected to this device";
    summaryBadge.className = "badge badge-rejected text-xs font-semibold";
    return;
  }

  const bwChain = bwPrinters.length > 0
    ? bwPrinters.map(shortenPrinterName).join(' → ')
    : (bw1 && bw1 !== 'None' && !bw1.includes('Scanning') && !bw1.includes('No printer') && !isDemoPrinterName(bw1) ? shortenPrinterName(bw1) : 'None');
  const colChain = colPrinters.length > 0
    ? colPrinters.map(shortenPrinterName).join(' → ')
    : (col1 && col1 !== 'None' && !col1.includes('Scanning') && !col1.includes('No printer') && !isDemoPrinterName(col1) ? shortenPrinterName(col1) : 'None');

  summaryBadge.textContent = `B&W: ${bwChain} | Colour: ${colChain}`;
  summaryBadge.className = "badge badge-submitted text-xs font-semibold";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('smartprint_theme', theme);
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIconSun = document.getElementById('theme-icon-sun');
  const themeIconMoon = document.getElementById('theme-icon-moon');
  if (theme === 'dark') {
    if (themeIconSun) themeIconSun.style.display = 'inline-flex';
    if (themeIconMoon) themeIconMoon.style.display = 'none';
    if (themeToggleBtn) themeToggleBtn.setAttribute('title', 'Switch to Light Theme');
  } else {
    if (themeIconSun) themeIconSun.style.display = 'none';
    if (themeIconMoon) themeIconMoon.style.display = 'inline-flex';
    if (themeToggleBtn) themeToggleBtn.setAttribute('title', 'Switch to Dark Theme');
  }
}

export function initThemeToggle() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const initialTheme = localStorage.getItem('smartprint_theme') || 'light';
  applyTheme(initialTheme);

  if (themeToggleBtn) {
    themeToggleBtn.onclick = (e) => {
      if (e) e.preventDefault();
      const currentTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('smartprint_theme') || 'light';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    };
  }
}

export function initSidebarControls() {
  const sidebar = document.getElementById('app-sidebar');
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebarHideBtn = document.getElementById('sidebar-hide-btn');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');

  const isMobile = () => window.innerWidth <= 1024;

  const exposeSidebar = () => {
    sidebar?.classList.remove('sidebar-hidden');
    sidebar?.classList.add('sidebar-exposed');
    if (isMobile()) {
      sidebarBackdrop?.classList.add('active');
    }
    localStorage.setItem('smartprint_sidebar_state', 'exposed');
    sidebarToggleBtn?.setAttribute('aria-expanded', 'true');
  };

  const hideSidebar = () => {
    sidebar?.classList.add('sidebar-hidden');
    sidebar?.classList.remove('sidebar-exposed');
    sidebarBackdrop?.classList.remove('active');
    localStorage.setItem('smartprint_sidebar_state', 'hidden');
    sidebarToggleBtn?.setAttribute('aria-expanded', 'false');
  };

  const toggleSidebar = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const isHidden = sidebar?.classList.contains('sidebar-hidden') || 
                     (!sidebar?.classList.contains('sidebar-exposed') && isMobile());
    if (isHidden) {
      exposeSidebar();
    } else {
      hideSidebar();
    }
  };

  // Restore saved desktop state preference
  if (!isMobile()) {
    const savedState = localStorage.getItem('smartprint_sidebar_state');
    if (savedState === 'hidden') {
      sidebar?.classList.add('sidebar-hidden');
      sidebar?.classList.remove('sidebar-exposed');
      sidebarToggleBtn?.setAttribute('aria-expanded', 'false');
    } else {
      sidebar?.classList.remove('sidebar-hidden');
      sidebar?.classList.add('sidebar-exposed');
      sidebarToggleBtn?.setAttribute('aria-expanded', 'true');
    }
  } else {
    sidebarToggleBtn?.setAttribute('aria-expanded', 'false');
  }

  // Event Listeners for Slide Bar controls (single-click hide and expose)
  if (sidebarToggleBtn && !sidebarToggleBtn.__boundToggle) {
    sidebarToggleBtn.__boundToggle = true;
    sidebarToggleBtn.addEventListener('click', toggleSidebar);
  }
  if (sidebarHideBtn && !sidebarHideBtn.__boundToggle) {
    sidebarHideBtn.__boundToggle = true;
    sidebarHideBtn.addEventListener('click', toggleSidebar);
  }
  if (sidebarBackdrop && !sidebarBackdrop.__boundToggle) {
    sidebarBackdrop.__boundToggle = true;
    sidebarBackdrop.addEventListener('click', hideSidebar);
  }

  return { exposeSidebar, hideSidebar, toggleSidebar, isMobile };
}

export function updateStoreStatusUI(isOpen) {
  const storeStatusBtn = document.getElementById('store-status-btn');
  const storeStatusText = document.getElementById('store-status-text');
  if (storeStatusBtn) {
    if (isOpen) {
      storeStatusBtn.classList.remove('closed');
      storeStatusBtn.classList.add('open');
      storeStatusBtn.setAttribute('aria-pressed', 'true');
      storeStatusBtn.setAttribute('title', 'Store is OPEN (Accepting Orders). Click to Close Store.');
      storeStatusBtn.setAttribute('aria-label', 'Store Status: Open. Click to close store.');
      if (storeStatusText) storeStatusText.textContent = 'Store Open';
    } else {
      storeStatusBtn.classList.remove('open');
      storeStatusBtn.classList.add('closed');
      storeStatusBtn.setAttribute('aria-pressed', 'false');
      storeStatusBtn.setAttribute('title', 'Store is CLOSED (Orders Paused). Click to Open Store.');
      storeStatusBtn.setAttribute('aria-label', 'Store Status: Closed. Click to open store.');
      if (storeStatusText) storeStatusText.textContent = 'Store Closed';
    }
  }

  // Synchronize Permanent Profile QR card status badge in real-time
  const qrStatusEl = document.getElementById('qr-meta-status');
  if (qrStatusEl) {
    if (isOpen) {
      qrStatusEl.innerHTML = `<span class="badge badge-completed text-xs" style="display:inline-flex; align-items:center; gap:5px;"><span style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></span> Store Open</span>`;
    } else {
      qrStatusEl.innerHTML = `<span class="badge badge-under-review text-xs" style="display:inline-flex; align-items:center; gap:5px; background:rgba(239,68,68,0.15); color:#f87171; border-color:rgba(239,68,68,0.3);"><span style="width:6px; height:6px; border-radius:50%; background:#ef4444;"></span> Store Closed</span>`;
    }
  }
}

function manageStoreHeartbeat(isOpen, effectiveCenterId, centerObj) {
  if (window.__storeHeartbeatTimer) {
    clearInterval(window.__storeHeartbeatTimer);
    window.__storeHeartbeatTimer = null;
  }
  if (!isOpen) return;

  const sendBeat = () => {
    const targetId = effectiveCenterId || centerObj?.publicId || centerObj?.uniqueId;
    if (!targetId) return;
    fetch(`/api/store/heartbeat?center=${encodeURIComponent(targetId)}&uniqueId=${encodeURIComponent(centerObj?.uniqueId || '')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ centerId: targetId, uniqueId: centerObj?.uniqueId, isOpen: true })
    }).catch(() => {});
  };

  sendBeat();
  window.__storeHeartbeatTimer = setInterval(sendBeat, 10000);
}

function setupAutoCloseOnExit(effectiveCenterId, centerObj) {
  if (window.__autoCloseOnExitBound) return;
  window.__autoCloseOnExitBound = true;

  const triggerAutoClose = () => {
    const targetId = effectiveCenterId || centerObj?.publicId || centerObj?.uniqueId;
    if (!targetId) return;

    // 1. Immediately mark center-specific localStorage as closed and clear session open flag
    try {
      sessionStorage.removeItem(`smartprint_session_opened_${targetId}`);
      if (centerObj?.publicId) sessionStorage.removeItem(`smartprint_session_opened_${centerObj.publicId}`);
      localStorage.setItem(`smartprint_store_status_${targetId}`, 'closed');
      if (centerObj?.publicId) localStorage.setItem(`smartprint_store_status_${centerObj.publicId}`, 'closed');
      if (centerObj?.uniqueId) localStorage.setItem(`smartprint_store_status_${centerObj.uniqueId}`, 'closed');
    } catch (e) {}

    // 2. Transmit beacon to server to immediately switch status to closed
    const payload = JSON.stringify({
      centerId: targetId,
      publicId: centerObj?.publicId,
      uniqueId: centerObj?.uniqueId,
      isOpen: false,
      status: 'closed',
      closedBy: 'app_exit'
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/store/status', blob);
    } else {
      try {
        fetch('/api/store/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        });
      } catch (e) {}
    }
  };

  window.addEventListener('beforeunload', triggerAutoClose);
  window.addEventListener('pagehide', triggerAutoClose);
}

export function getStoreStatus(centerId = null) {
  const user = auth?.getCurrentUser?.();
  const effectiveCenterId = centerId || user?.centerId;

  if (effectiveCenterId) {
    // Requirement 4: On app launch or new sign-in, store starts strictly CLOSED.
    // The owner must explicitly open the store in their current session.
    const sessionOpened = sessionStorage.getItem(`smartprint_session_opened_${effectiveCenterId}`);
    if (sessionOpened !== 'true') {
      return false; // strictly default to CLOSED upon opening app or signing in
    }

    const saved = localStorage.getItem(`smartprint_store_status_${effectiveCenterId}`);
    if (saved === 'closed') return false;
    if (saved === 'open') return true;

    const center = stateStore.getCenter(effectiveCenterId);
    if (center && (center.status === 'closed' || center.status === 'inactive' || center.isOpen === false)) {
      return false;
    }
    if (center && (center.status === 'active' || center.isOpen === true)) {
      return true;
    }
  }

  return false; // Default is strictly closed
}

export async function setStoreStatus(isOpen, centerId = null, showNotification = true) {
  const user = auth.getCurrentUser();
  const effectiveCenterId = centerId || user?.centerId || stateStore.getCenters()[0]?.centerId;

  // 1. Session state management (Requirement 4: owner explicitly opens store)
  if (effectiveCenterId) {
    if (isOpen) {
      sessionStorage.setItem(`smartprint_session_opened_${effectiveCenterId}`, 'true');
    } else {
      sessionStorage.removeItem(`smartprint_session_opened_${effectiveCenterId}`);
    }
  }

  // 2. Update UI immediately
  updateStoreStatusUI(isOpen);

  // 3. Persist in localStorage under center-specific keys ONLY (isolated per store)
  const centerObj = effectiveCenterId ? (stateStore.getCenter(effectiveCenterId) || {}) : {};
  if (effectiveCenterId) {
    localStorage.setItem(`smartprint_store_status_${effectiveCenterId}`, isOpen ? 'open' : 'closed');
  }
  if (centerObj.publicId && centerObj.publicId !== effectiveCenterId) {
    localStorage.setItem(`smartprint_store_status_${centerObj.publicId}`, isOpen ? 'open' : 'closed');
  }
  if (centerObj.uniqueId) {
    localStorage.setItem(`smartprint_store_status_${centerObj.uniqueId}`, isOpen ? 'open' : 'closed');
  }

  // 4. Persist in stateStore for this specific center
  if (effectiveCenterId) {
    stateStore.saveCenter({
      ...centerObj,
      centerId: effectiveCenterId,
      status: isOpen ? 'active' : 'closed',
      isOpen: isOpen
    });
  }

  // 5. Manage heartbeat presence
  manageStoreHeartbeat(isOpen, effectiveCenterId, centerObj);

  // 6. Send to authoritative server for this specific center only (broadcasts via SSE to customers with 0 delay)
  try {
    await fetch('/api/store/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centerId: effectiveCenterId,
        publicId: centerObj.publicId || effectiveCenterId,
        uniqueId: centerObj.uniqueId,
        status: isOpen ? 'active' : 'closed',
        isOpen: isOpen
      })
    });
  } catch (err) {
    console.warn("Could not sync store status to server:", err.message);
  }

  // 7. Notify reactive subscribers with center ID
  stateStore.notify('store_status', { centerId: effectiveCenterId, isOpen, status: isOpen ? 'active' : 'closed' });

  // 8. Persist in Firestore if online
  if (effectiveCenterId && db) {
    try {
      const centerRef = doc(db, 'centers', effectiveCenterId);
      await setDoc(centerRef, { 
        status: isOpen ? 'active' : 'closed', 
        isOpen: isOpen, 
        updatedAt: serverTimestamp() 
      }, { merge: true });
    } catch (err) {
      console.warn("Could not sync store status to Firestore:", err.message);
    }
  }

  // 9. Toast feedback
  if (showNotification) {
    if (isOpen) {
      showToast("🟢 Store status updated to OPEN: Customers can upload & print documents.", "success");
    } else {
      showToast("🔴 Store status updated to CLOSED: Customer print order submissions paused.", "info");
    }
  }
}

export function initStoreStatusToggle(centerId = null) {
  const storeStatusBtn = document.getElementById('store-status-btn');
  if (!storeStatusBtn) return;

  const user = auth.getCurrentUser();
  const effectiveCenterId = centerId || user?.centerId || stateStore.getCenters()[0]?.centerId;
  const initialOpen = getStoreStatus(effectiveCenterId);
  updateStoreStatusUI(initialOpen);

  const centerObj = effectiveCenterId ? (stateStore.getCenter(effectiveCenterId) || {}) : {};
  const matchingKeys = new Set([
    effectiveCenterId ? `smartprint_store_status_${effectiveCenterId}` : null,
    centerObj.publicId ? `smartprint_store_status_${centerObj.publicId}` : null,
    centerObj.uniqueId ? `smartprint_store_status_${centerObj.uniqueId}` : null
  ].filter(Boolean));

  // If store is starting closed, ensure server and localStorage reflect closed status immediately
  if (!initialOpen && effectiveCenterId) {
    localStorage.setItem(`smartprint_store_status_${effectiveCenterId}`, 'closed');
    if (centerObj.publicId) localStorage.setItem(`smartprint_store_status_${centerObj.publicId}`, 'closed');
    fetch('/api/store/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centerId: effectiveCenterId,
        publicId: centerObj.publicId || effectiveCenterId,
        uniqueId: centerObj.uniqueId,
        status: 'closed',
        isOpen: false
      })
    }).catch(() => {});
  }

  // Setup presence heartbeat for open store
  manageStoreHeartbeat(initialOpen, effectiveCenterId, centerObj);

  // Setup automatic close when tab/window/app is closed
  setupAutoCloseOnExit(effectiveCenterId, centerObj);

  // Cross-page and Cross-tab instant synchronization via storage event - ONLY for this center
  if (!window.__storeStatusStorageListenerAttached) {
    window.__storeStatusStorageListenerAttached = true;
    window.addEventListener('storage', (e) => {
      if (matchingKeys.has(e.key)) {
        const nextOpen = e.newValue === 'open';
        updateStoreStatusUI(nextOpen);
        manageStoreHeartbeat(nextOpen, effectiveCenterId, centerObj);
      }
    });
  }

  // Subscribe to reactive stateStore events for in-app page changes - ONLY for this center
  stateStore.subscribe((event, data) => {
    if (event === 'store_status' && data && typeof data.isOpen === 'boolean') {
      if (!data.centerId || data.centerId === effectiveCenterId || (centerObj.publicId && data.centerId === centerObj.publicId)) {
        updateStoreStatusUI(data.isOpen);
      }
    }
  });

  if (!storeStatusBtn.__boundClick) {
    storeStatusBtn.__boundClick = true;
    storeStatusBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const currentIsOpen = storeStatusBtn.classList.contains('open');
      const nextIsOpen = !currentIsOpen;
      await setStoreStatus(nextIsOpen, effectiveCenterId, true);
    });
  }
}

// Auto-run theme, sidebar, and store status shell as soon as DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initSidebarControls();
    initStoreStatusToggle();
  });
} else {
  initThemeToggle();
  initSidebarControls();
  initStoreStatusToggle();
}

document.addEventListener('DOMContentLoaded', () => {
  // Always ensure shell controls are bound
  initThemeToggle();
  initSidebarControls();
  initStoreStatusToggle();

  // Protect page
  if (!auth.protectPage([USER_ROLES.OWNER, USER_ROLES.SUPERADMIN])) return;

  const user = auth.getCurrentUser();
  let centerId = user?.centerId;
  if (!centerId && user?.uid && user?.role !== USER_ROLES.SUPERADMIN) {
    centerId = "center_" + user.uid.substring(0, 8);
    user.centerId = centerId;
    auth.saveSession?.();
  }
  if (!centerId) {
    centerId = stateStore.getCenters()[0]?.centerId || null;
  }

  // Retrieve user-isolated cached rates and routing if saved previously
  const cachedRates = centerId ? (localStorage.getItem(`smartprint_rates_${centerId}`) || (user?.uid ? localStorage.getItem(`smartprint_rates_${user.uid}`) : null)) : null;
  let parsedCachedRates = null;
  if (cachedRates) {
    try { parsedCachedRates = JSON.parse(cachedRates); } catch (e) {}
  }

  const cachedRouting = centerId ? (localStorage.getItem(`smartprint_routing_${centerId}`) || (user?.uid ? localStorage.getItem(`smartprint_routing_${user.uid}`) : null)) : null;
  let parsedCachedRouting = null;
  if (cachedRouting) {
    try { parsedCachedRouting = cleanPrinterRouting(JSON.parse(cachedRouting)); } catch (e) {}
  }

  let center = centerId ? stateStore.getCenter(centerId) : null;
  if (!center && centerId) {
    center = {
      centerId,
      id: centerId,
      ownerUid: user?.uid,
      ownerEmail: user?.email,
      storeName: user?.displayName ? `${user.displayName}'s Center` : 'SmartPrint Hub',
      rates: parsedCachedRates || { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
      printerRouting: parsedCachedRouting || { bwPriority: [], colorPriority: [], autoFailover: true, autoDuplexMatch: true }
    };
    stateStore.saveCenter(center);
  } else if (center) {
    if (parsedCachedRates && (!center.rates || Object.keys(center.rates).length === 0)) {
      center.rates = parsedCachedRates;
    }
    if (parsedCachedRouting && (!center.printerRouting || (!center.printerRouting.bwPriority && !center.printerRouting.colorPriority))) {
      center.printerRouting = parsedCachedRouting;
    } else if (center.printerRouting) {
      center.printerRouting = cleanPrinterRouting(center.printerRouting);
    }
  }

  // Initialize UI header & profile
  const centerNameEl = document.getElementById('current-center-name');
  if (centerNameEl) centerNameEl.textContent = center ? (center.storeName || center.name) : "Xerox Management Hub";

  const userEmailEl = document.getElementById('current-user-email');
  if (userEmailEl) userEmailEl.textContent = user.email;

  const initialsEl = document.getElementById('user-avatar-initials');
  if (initialsEl) {
    const nameToUse = (user.displayName || user.email || 'OP').trim();
    const parts = nameToUse.split(/[\s@._-]+/).filter(Boolean);
    const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
    initialsEl.textContent = initials || 'OP';
  }

  // Topbar customer link
  const topbarLink = document.getElementById('topbar-customer-link');
  if (topbarLink) {
    if (center && center.publicId) {
      topbarLink.href = `/customer/?center=${center.publicId}`;
      topbarLink.style.display = 'inline-flex';
    } else {
      topbarLink.style.display = 'none';
    }
  }

  // Restore user-isolated settings immediately on load and sync
  function restoreUserSettings(centerToRestore = null) {
    const activeUser = user || auth.getCurrentUser();
    const effectiveCenterId = centerToRestore?.centerId || centerId || activeUser?.centerId;
    const c = centerToRestore || (effectiveCenterId ? stateStore.getCenter(effectiveCenterId) : null) || {};

    // 1. RATES: Try centerObj.rates, then localStorage per-center, then localStorage per-user
    let ratesToApply = c.rates;
    if (!ratesToApply && effectiveCenterId) {
      const rawCenterRates = localStorage.getItem(`smartprint_rates_${effectiveCenterId}`);
      if (rawCenterRates) {
        try { ratesToApply = JSON.parse(rawCenterRates); } catch (e) {}
      }
    }
    if (!ratesToApply && activeUser?.uid) {
      const rawUserRates = localStorage.getItem(`smartprint_rates_${activeUser.uid}`);
      if (rawUserRates) {
        try { ratesToApply = JSON.parse(rawUserRates); } catch (e) {}
      }
    }

    if (ratesToApply) {
      c.rates = ratesToApply;
      const setInput = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
      };
      setInput('rate-bw-single', ratesToApply.bwSingle);
      setInput('rate-bw-double', ratesToApply.bwDouble);
      setInput('rate-color-single', ratesToApply.colorSingle);
      setInput('rate-color-double', ratesToApply.colorDouble);

      const ratesBadge = document.getElementById('rates-status-badge');
      if (ratesBadge) {
        ratesBadge.textContent = "Live Rates";
        ratesBadge.className = "badge badge-completed text-xs font-semibold";
      }
    }

    // 2. PRINTER PRIORITY ROUTING: Try centerObj.printerRouting, then localStorage per-center, then localStorage per-user
    let routingToApply = c.printerRouting ? cleanPrinterRouting(c.printerRouting) : null;
    if (!routingToApply && effectiveCenterId) {
      const rawCenterRouting = localStorage.getItem(`smartprint_routing_${effectiveCenterId}`);
      if (rawCenterRouting) {
        try { routingToApply = cleanPrinterRouting(JSON.parse(rawCenterRouting)); } catch (e) {}
      }
    }
    if (!routingToApply && activeUser?.uid) {
      const rawUserRouting = localStorage.getItem(`smartprint_routing_${activeUser.uid}`);
      if (rawUserRouting) {
        try { routingToApply = cleanPrinterRouting(JSON.parse(rawUserRouting)); } catch (e) {}
      }
    }

    if (routingToApply) {
      routingToApply = cleanPrinterRouting(routingToApply);
      c.printerRouting = routingToApply;
      populatePrinterSequenceDropdowns(currentDetectedPrinters, routingToApply);
    }
  }

  // Render KPIs, Queue, History, Analytics, Subscription, and Profile safely
  try { renderKPIs(centerId); } catch (e) { console.warn("renderKPIs notice:", e); }
  try { renderQueue(centerId); } catch (e) { console.warn("renderQueue notice:", e); }
  try { renderHistory(centerId); } catch (e) { console.warn("renderHistory notice:", e); }
  try { renderAnalytics(centerId); } catch (e) { console.warn("renderAnalytics notice:", e); }
  try { renderSubscription(center); } catch (e) { console.warn("renderSubscription notice:", e); }
  try { populateProfileForm(center, user); } catch (e) { console.warn("populateProfileForm notice:", e); }
  try { restoreUserSettings(center); } catch (e) { console.warn("restoreUserSettings notice:", e); }

  // Asynchronously query Firestore for persisted profile details and sync
  async function syncProfileFromFirestore() {
    if (!db || !user || !user.uid) return;
    try {
      let remoteCenter = null;
      let effectiveCenterId = centerId || user.centerId;

      // 1. Try direct center document fetch by centerId
      if (effectiveCenterId) {
        const centerSnap = await getDoc(doc(db, "centers", effectiveCenterId));
        if (centerSnap.exists()) {
          remoteCenter = { centerId: effectiveCenterId, id: effectiveCenterId, ...centerSnap.data() };
        }
      }

      // 2. Query centers collection where ownerUid matches user.uid
      if (!remoteCenter && user.uid) {
        const q = query(collection(db, "centers"), where("ownerUid", "==", user.uid));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
          const firstDoc = querySnap.docs[0];
          remoteCenter = { centerId: firstDoc.id, id: firstDoc.id, ...firstDoc.data() };
          effectiveCenterId = firstDoc.id;
          centerId = effectiveCenterId;
          user.centerId = effectiveCenterId;
          auth.saveSession?.();
        }
      }

      // 3. Check users/{uid} for additional profile fields
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const uData = userSnap.data();
          if (uData.uniqueId && !user.uniqueId) user.uniqueId = uData.uniqueId;
          if (uData.name && !user.displayName) user.displayName = uData.name;
          if (remoteCenter) {
            if (!remoteCenter.userName && uData.name) remoteCenter.userName = uData.name;
            if (!remoteCenter.phone && uData.phone) remoteCenter.phone = uData.phone;
            if (!remoteCenter.address && uData.address) remoteCenter.address = uData.address;
            if (!remoteCenter.gender && uData.gender) remoteCenter.gender = uData.gender;
            if (!remoteCenter.uniqueId && uData.uniqueId) remoteCenter.uniqueId = uData.uniqueId;
          }
        }
      } catch (uErr) {}

        if (remoteCenter) {
          center = remoteCenter;
          stateStore.saveCenter(remoteCenter);
          populateProfileForm(remoteCenter, user);
          restoreUserSettings(remoteCenter);

          const isClosed = remoteCenter.status === 'closed' || remoteCenter.status === 'inactive' || remoteCenter.isOpen === false;
          updateStoreStatusUI(!isClosed);
          if (effectiveCenterId) {
            localStorage.setItem(`smartprint_store_status_${effectiveCenterId}`, isClosed ? 'closed' : 'open');
          }

          if (centerNameEl) {
            centerNameEl.textContent = remoteCenter.storeName || remoteCenter.name || "Xerox Management Hub";
          }

          if (topbarLink && remoteCenter.publicId) {
            topbarLink.href = `/customer/?center=${remoteCenter.publicId}`;
            topbarLink.style.display = 'inline-flex';
          }
        }
    } catch (err) {
      console.warn("Could not sync profile from Firestore:", err.message);
    }
  }

  syncProfileFromFirestore();

  // Operator Profile Card fields in Profile View
  const profileEmailEl = document.getElementById('profile-user-email');
  if (profileEmailEl) profileEmailEl.textContent = user.email || 'owner@center.com';

  const profileRoleEl = document.getElementById('profile-user-role');
  if (profileRoleEl) profileRoleEl.textContent = (user.role || USER_ROLES.OWNER).toUpperCase();

  // Slide Bar (Sidebar) Controls
  const { exposeSidebar, hideSidebar, toggleSidebar, isMobile } = initSidebarControls();
  const sidebar = document.getElementById('app-sidebar');
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebarHideBtn = document.getElementById('sidebar-hide-btn');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');

  // Close on Escape on mobile
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile() && sidebar?.classList.contains('sidebar-exposed')) {
      hideSidebar();
    }
  });

  // Sidebar Tab Navigation (1. Dashboard, 2. History, 3. Analytics, 4. Setting, 5. Profile)
  document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetView = btn.getAttribute('data-view');
      const href = btn.getAttribute('href');
      const curPath = window.location.pathname.toLowerCase();
      
      const hasAllViews = !!(document.getElementById('view-dashboard') && document.getElementById('view-settings'));

      const isCurrentPage = 
        (targetView === 'dashboard' && (curPath.endsWith('/app/') || curPath.endsWith('/app') || curPath.includes('index') || curPath.includes('dashboard'))) ||
        (targetView === 'history' && curPath.includes('history')) ||
        (targetView === 'analytics' && curPath.includes('analytics')) ||
        (targetView === 'settings' && (curPath.includes('setting') || curPath.includes('settings'))) ||
        (targetView === 'profile' && curPath.includes('profile'));

      if (hasAllViews || isCurrentPage) {
        e.preventDefault();
        switchView(targetView);
        if (isMobile()) hideSidebar();
      } else if (href && !href.startsWith('#')) {
        // Direct browser navigation to dedicated HTML section page
        if (isMobile()) hideSidebar();
      } else {
        switchView(targetView);
        if (isMobile()) hideSidebar();
      }
    });
  });

  // Status Filter Tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-status');
      renderQueue(centerId);
    });
  });

  // Search queue input
  const searchInput = document.getElementById('search-queue-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderQueue(centerId);
    });
  }

  // Profile Form Submission (View 4: Profile)
  const profileForm = document.getElementById('center-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = profileForm.querySelector('button[type="submit"]');
      const origBtnHtml = saveBtn ? saveBtn.innerHTML : '';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span>Saving..</span>`;
      }

      const storeName = (document.getElementById('profile-store-name')?.value || document.getElementById('profile-name')?.value || '').trim();
      const userName = (document.getElementById('profile-user-name')?.value || '').trim();
      const phone = (document.getElementById('profile-phone')?.value || '').trim();
      const email = (document.getElementById('profile-email')?.value || user?.email || '').trim();
      const address = (document.getElementById('profile-address')?.value || '').trim();
      const gender = (document.getElementById('profile-gender')?.value || '').trim();

      const formUid = document.getElementById('profile-unique-id-display')?.value?.trim();
      const uniqueId = formUid || getOrGenerateUniqueId(user);
      const currentCenter = (centerId ? stateStore.getCenter(centerId) : null) || {};

      let resolvedCenterId = centerId || user?.centerId || currentCenter.centerId;
      if (!resolvedCenterId && user?.uid) {
        resolvedCenterId = "center_" + user.uid.substring(0, 8);
      }
      centerId = resolvedCenterId;
      if (user) user.centerId = resolvedCenterId;

      const publicId = currentCenter.publicId || ('CTR-' + uniqueId);

      const updatedCenter = {
        ...currentCenter,
        centerId: resolvedCenterId,
        id: resolvedCenterId,
        publicId,
        ownerUid: user?.uid || currentCenter.ownerUid || null,
        ownerEmail: email,
        name: storeName,
        storeName,
        userName,
        phone,
        email,
        address,
        gender,
        uniqueId,
        status: currentCenter.status || 'active',
        updatedAt: new Date().toISOString()
      };

      // 1. Immediately persist in local reactive stateStore & localStorage
      stateStore.saveCenter(updatedCenter);

      // 2. Persist in user session
      if (user) {
        user.centerId = resolvedCenterId;
        user.displayName = userName;
        user.email = email;
        user.uniqueId = uniqueId;
        auth.saveSession?.();
        try {
          const raw = localStorage.getItem('smartprint_auth_session');
          if (raw) {
            const s = JSON.parse(raw);
            s.centerId = resolvedCenterId;
            s.displayName = userName;
            s.email = email;
            s.uniqueId = uniqueId;
            localStorage.setItem('smartprint_auth_session', JSON.stringify(s));
          }
        } catch(e) {}
      }

      if (centerNameEl) centerNameEl.textContent = storeName;
      renderPermanentProfileQR(updatedCenter);

      // 3. Fast parallel Firestore persistence
      try {
        if (db && resolvedCenterId) {
          const centerRef = doc(db, "centers", resolvedCenterId);
          const saveTasks = [
            setDoc(centerRef, {
              ...updatedCenter,
              updatedAt: serverTimestamp()
            }, { merge: true })
          ];

          if (user?.uid) {
            const userRef = doc(db, "users", user.uid);
            saveTasks.push(
              setDoc(userRef, {
                name: userName,
                displayName: userName,
                centerId: resolvedCenterId,
                phone,
                address,
                gender,
                uniqueId,
                updatedAt: serverTimestamp()
              }, { merge: true })
            );
          }

          // Parallel execution with 300ms window for instantaneous responsiveness
          await Promise.race([
            Promise.all(saveTasks),
            new Promise(res => setTimeout(res, 300))
          ]);
        }
      } catch (firestoreErr) {
        console.warn("Firestore profile save notice (saved to local state):", firestoreErr.message);
      }

      showToast("Profile details and permanent QR code updated successfully!", "success");

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origBtnHtml || `Save Profile Details`;
      }
    });
  }

  // Copy Unique ID Button
  document.getElementById('btn-copy-uid')?.addEventListener('click', () => {
    const uid = document.getElementById('profile-unique-id-display')?.value || getOrGenerateUniqueId(user);
    copyToClipboard(uid, `Permanent Unique User ID ${uid} copied!`);
  });

  // Helper: Extract current profile credentials for Standee generation
  function getCurrentProfileData() {
    const user = auth.getCurrentUser() || {};
    const centerId = user.centerId || null;
    const center = centerId ? stateStore.getCenter(centerId) : null;

    const storeName = (document.getElementById('profile-store-name')?.value || center?.storeName || center?.name || user.displayName || 'SmartPrint Center').trim();
    const userName = (document.getElementById('profile-user-name')?.value || center?.userName || user.displayName || 'Operator').trim();
    const phone = (document.getElementById('profile-phone')?.value || center?.phone || '').trim();
    const email = (document.getElementById('profile-email')?.value || user.email || center?.email || '').trim();
    const address = (document.getElementById('profile-address')?.value || center?.address || '').trim();
    const gender = (document.getElementById('profile-gender')?.value || center?.gender || '').trim();
    const uniqueId = document.getElementById('profile-unique-id-display')?.value || center?.uniqueId || user.uniqueId || getOrGenerateUniqueId(user);
    const publicId = center?.publicId || (user.uid ? `CTR-${user.uid.substring(0, 6).toUpperCase()}` : 'N/A');

    return {
      storeName,
      userName,
      phone,
      email,
      address,
      gender,
      uniqueId,
      publicId
    };
  }

  // Draw rounded rectangle helper for canvas
  function drawCanvasRoundRect(ctx, x, y, width, height, radius, fill = false, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Draw top rounded rectangle helper
  function drawCanvasRoundRectTop(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  // Draw SmartPrint Printer Logo Icon glyph
  function drawCanvasPrinterGlyph(ctx, cx, cy, size, color = '#ffffff') {
    ctx.save();
    ctx.translate(cx, cy);
    const s = size / 24;
    ctx.scale(s, s);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Top paper input tray
    ctx.beginPath();
    ctx.moveTo(-6, -3);
    ctx.lineTo(-6, -10);
    ctx.lineTo(6, -10);
    ctx.lineTo(6, -3);
    ctx.stroke();

    // Main printer body
    ctx.beginPath();
    ctx.moveTo(-10, 3);
    ctx.lineTo(-10, -3);
    ctx.quadraticCurveTo(-10, -5, -8, -5);
    ctx.lineTo(8, -5);
    ctx.quadraticCurveTo(10, -5, 10, -3);
    ctx.lineTo(10, 3);
    ctx.quadraticCurveTo(10, 5, 8, 5);
    ctx.lineTo(6, 5);
    ctx.lineTo(-6, 5);
    ctx.lineTo(-8, 5);
    ctx.quadraticCurveTo(-10, 5, -10, 3);
    ctx.stroke();

    // Bottom paper output sheet
    ctx.beginPath();
    ctx.rect(-5, 0, 10, 8);
    ctx.stroke();

    // Small indicator dot
    ctx.beginPath();
    ctx.arc(6, -1.5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw standard normal black-and-white QR code
  function drawProceduralQrFallback(ctx, x, y, size, uid) {
    const fallbackText = `${window.location.origin}/customer/?center=${encodeURIComponent(uid || '1000000')}`;
    drawNormalQrToCanvas(ctx, fallbackText, x, y, size);
  }

  // Load QR Image safely for Canvas rendering (handling cross-origin)
  async function loadQrImageForCanvas(profileData) {
    const qrImgEl = document.getElementById('permanent-qr-image');
    const uid = String(profileData.uniqueId || '1000000');
    const publicId = profileData.publicId || ('CTR-' + uid);
    const customerUrl = `${window.location.origin}/customer/?center=${encodeURIComponent(profileData.uniqueId || publicId)}`;
    const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=10&data=${encodeURIComponent(customerUrl)}`;
    const src = (qrImgEl && qrImgEl.src) ? qrImgEl.src : fallbackUrl;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = async () => {
        try {
          const resp = await fetch(src);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const blobImg = new Image();
          blobImg.onload = () => {
            URL.revokeObjectURL(blobUrl);
            resolve(blobImg);
          };
          blobImg.onerror = () => resolve(null);
          blobImg.src = blobUrl;
        } catch (e) {
          if (qrImgEl && qrImgEl.complete && qrImgEl.naturalWidth > 0) {
            resolve(qrImgEl);
          } else {
            resolve(null);
          }
        }
      };
      img.src = src;
      setTimeout(() => resolve(null), 2500);
    });
  }

  // Generate complete, high-resolution Store Standee Canvas Poster (1200 x 1700 px)
  async function generateStoreStandeeCanvas(profileData) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1700;
    const ctx = canvas.getContext('2d');

    const storeName = (profileData.storeName || 'SmartPrint Xerox & Print Hub').trim();
    const ownerName = (profileData.userName || 'Center Operator').trim();
    const phone = (profileData.phone || '--').trim();
    const email = (profileData.email || '--').trim();
    const address = (profileData.address || '').trim();
    const uid = String(profileData.uniqueId || '1000000');
    const publicId = profileData.publicId || ('CTR-' + uid);

    // 1. Background Fill
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle background tint & card area
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#fbfaff');
    bgGrad.addColorStop(0.35, '#f5f3ff');
    bgGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(24, 24, 1152, 1652);

    // Outer double border matching app's purple gradient
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 4;
    drawCanvasRoundRect(ctx, 24, 24, 1152, 1652, 32, false, true);

    ctx.strokeStyle = 'rgba(124, 58, 237, 0.22)';
    ctx.lineWidth = 1.5;
    drawCanvasRoundRect(ctx, 34, 34, 1132, 1632, 26, false, true);

    // 2. Brand Header Banner (Height: 200px)
    const headerGrad = ctx.createLinearGradient(24, 24, 1176, 224);
    headerGrad.addColorStop(0, '#4c1d95');
    headerGrad.addColorStop(0.5, '#6d28d9');
    headerGrad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = headerGrad;
    drawCanvasRoundRectTop(ctx, 24, 24, 1152, 200, 32);

    // Logo Circular Badge
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(110, 124, 46, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(110, 124, 46, 0, Math.PI * 2);
    ctx.stroke();

    drawCanvasPrinterGlyph(ctx, 110, 124, 44, '#ffffff');

    // Brand Title & Tagline
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SmartPrint', 180, 115);

    ctx.fillStyle = '#ddd6fe';
    ctx.font = '600 16px "Inter", sans-serif';
    ctx.fillText('OFFICIAL COUNTER PRINTING PARTNER • SELF-SERVICE', 184, 150);

    // Verified Stamp on Right
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('★ VERIFIED PRINT CENTER', 1130, 128);

    // 3. Store Title Banner
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6d28d9';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.fillText('OFFICIAL STORE DISPLAY STANDEE', 600, 275);

    ctx.fillStyle = '#0f172a';
    const storeFontSize = storeName.length > 30 ? 36 : (storeName.length > 22 ? 42 : 48);
    ctx.font = `bold ${storeFontSize}px "Inter", sans-serif`;
    ctx.fillText(storeName, 600, 335);

    // Scanner Callout Pill
    ctx.fillStyle = 'rgba(124, 58, 237, 0.12)';
    drawCanvasRoundRect(ctx, 260, 365, 680, 42, 21, true, false);
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.3)';
    ctx.lineWidth = 1;
    drawCanvasRoundRect(ctx, 260, 365, 680, 42, 21, false, true);

    ctx.fillStyle = '#5b21b6';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.fillText('📱 SCAN WITH PHONE CAMERA TO UPLOAD & PRINT DOCUMENTS', 600, 392);

    // 4. Central QR Code Showcase Frame
    ctx.save();
    ctx.shadowColor = 'rgba(124, 58, 237, 0.18)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#ffffff';
    drawCanvasRoundRect(ctx, 320, 440, 560, 560, 32, true, false);
    ctx.restore();

    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3.5;
    drawCanvasRoundRect(ctx, 320, 440, 560, 560, 32, false, true);

    // Draw standard normal black-and-white QR Code centered
    const qrTargetUrl = `${window.location.origin}/customer/?center=${encodeURIComponent(publicId)}`;
    drawNormalQrToCanvas(ctx, qrTargetUrl, 370, 490, 460);

    // Guidance text below QR box
    ctx.fillStyle = '#475569';
    ctx.font = '600 16px "Inter", sans-serif';
    ctx.fillText('No Pendrive Needed • PDF, Word & Photos • Color & B/W Instant Prints', 600, 1040);

    // 5. Store & Owner Information Card (2x2 Grid)
    ctx.fillStyle = '#ffffff';
    drawCanvasRoundRect(ctx, 80, 1080, 1040, 410, 26, true, false);
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.35)';
    ctx.lineWidth = 1.5;
    drawCanvasRoundRect(ctx, 80, 1080, 1040, 410, 26, false, true);

    // Card Header Bar
    const infoBarGrad = ctx.createLinearGradient(80, 1080, 1120, 1140);
    infoBarGrad.addColorStop(0, '#f5f3ff');
    infoBarGrad.addColorStop(1, '#ede9fe');
    ctx.fillStyle = infoBarGrad;
    drawCanvasRoundRectTop(ctx, 80, 1080, 1040, 56, 26);

    ctx.fillStyle = '#5b21b6';
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('STORE DETAILS & VERIFIED OWNER CREDENTIALS', 120, 1115);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#6d28d9';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.fillText(`PERMANENT UID: ${uid}`, 1080, 1115);

    // Helper to draw clean metadata cells
    const drawGridCell = (label, val, x, y) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#64748b';
      ctx.font = '600 14px "Inter", sans-serif';
      ctx.fillText(label.toUpperCase(), x, y);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 22px "Inter", sans-serif';
      const maxLen = 30;
      const displayStr = val.length > maxLen ? val.substring(0, maxLen) + '...' : val;
      ctx.fillText(displayStr, x, y + 30);
    };

    // Row 1: Store Name & Owner Name
    drawGridCell('Store Name', storeName, 120, 1175);
    drawGridCell('Owner Name', ownerName, 630, 1175);

    // Divider 1
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(120, 1240);
    ctx.lineTo(1080, 1240);
    ctx.stroke();

    // Row 2: Contact Number & Email Address
    drawGridCell('Contact Number', phone, 120, 1275);
    drawGridCell('Email Address', email, 630, 1275);

    // Divider 2
    ctx.beginPath();
    ctx.moveTo(120, 1340);
    ctx.lineTo(1080, 1340);
    ctx.stroke();

    // Row 3: Physical Store Address & Public Center ID
    if (address) {
      drawGridCell('Store Address', address, 120, 1375);
      drawGridCell('Public Center ID', publicId, 630, 1375);
    } else {
      drawGridCell('Public Center ID', publicId, 120, 1375);
      drawGridCell('Permanent Unique ID', uid, 630, 1375);
    }

    // 6. Security Trust Strip
    ctx.fillStyle = 'rgba(124, 58, 237, 0.08)';
    drawCanvasRoundRect(ctx, 80, 1515, 1040, 56, 16, true, false);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4c1d95';
    ctx.font = '600 15px "Inter", sans-serif';
    ctx.fillText('🔒 100% Private & Secure • Files Auto-Expire After Printing • Direct Printer Dispatch', 600, 1550);

    // 7. Footer
    ctx.fillStyle = '#64748b';
    ctx.font = '500 13px "Inter", sans-serif';
    ctx.fillText('SmartPrint Management System • Place this standee on your store counter for instant customer printing', 600, 1630);

    return canvas;
  }

  // Print Permanent QR Standee - Direct Print Only (Zero download options)
  document.getElementById('btn-print-profile-badge')?.addEventListener('click', async () => {
    const printBtn = document.getElementById('btn-print-profile-badge');
    const origHtml = printBtn ? printBtn.innerHTML : '';
    if (printBtn) {
      printBtn.disabled = true;
      printBtn.innerHTML = `<span>Opening Printer...</span>`;
    }

    try {
      const profileData = getCurrentProfileData();
      const canvas = await generateStoreStandeeCanvas(profileData);
      const storeSlug = (profileData.storeName || 'Store').replace(/[^a-zA-Z0-9_-]/g, '_');
      const uid = profileData.uniqueId || '1000000';
      const filename = `SmartPrint_Store_Standee_${storeSlug}_${uid}.png`;

      showToast("Opening direct print for Store QR Standee...", "info");

      // Direct print without opening extra web pages or offering download options
      let printFrame = document.getElementById('print-standee-iframe');
      if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'print-standee-iframe';
        printFrame.style.position = 'fixed';
        printFrame.style.top = '-9999px';
        printFrame.style.left = '-9999px';
        printFrame.style.width = '0px';
        printFrame.style.height = '0px';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);
      }

      const dataUrl = canvas.toDataURL('image/png');
      const frameDoc = printFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${escapeHtml(profileData.storeName || 'Store')} - QR Standee</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              background: #ffffff;
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            img {
              width: 100vw;
              height: 100vh;
              max-width: 210mm;
              max-height: 297mm;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" alt="Store QR Standee" />
        </body>
        </html>
      `);
      frameDoc.close();

      const img = frameDoc.querySelector('img');
      const triggerPrint = () => {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch (e) {
          window.print();
        }
      };

      if (img && img.complete) {
        setTimeout(triggerPrint, 250);
      } else if (img) {
        img.onload = () => setTimeout(triggerPrint, 250);
      } else {
        setTimeout(triggerPrint, 250);
      }
    } catch (err) {
      console.warn("Direct print standee notice:", err);
      window.print();
    } finally {
      if (printBtn) {
        printBtn.disabled = false;
        printBtn.innerHTML = origHtml || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Print QR Code Standee`;
      }
    }
  });

  // Live input change listener for profile completeness progress
  ['profile-store-name', 'profile-user-name', 'profile-phone', 'profile-address', 'profile-gender'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const storeName = document.getElementById('profile-store-name')?.value || '';
        const userName = document.getElementById('profile-user-name')?.value || '';
        const phone = document.getElementById('profile-phone')?.value || '';
        const address = document.getElementById('profile-address')?.value || '';
        const gender = document.getElementById('profile-gender')?.value || '';
        updateProfileCompleteness({ storeName, userName, phone, address, gender });
      });
    }
  });

  // -------------------------------------------------------------
  // Settings: 1. Per-Page Pricing Rates (₹) - Save, Edit, Update
  // -------------------------------------------------------------
  const settingsRatesForm = document.getElementById('settings-rates-form');
  const btnEditRates = document.getElementById('btn-edit-rates');
  const btnResetRates = document.getElementById('btn-reset-rates');
  const ratesStatusBadge = document.getElementById('rates-status-badge');

  async function saveRatesSettings(showNotification = true) {
    const bwSingle = parseFloat(document.getElementById('rate-bw-single')?.value) || 2.0;
    const bwDouble = parseFloat(document.getElementById('rate-bw-double')?.value) || 3.5;
    const colorSingle = parseFloat(document.getElementById('rate-color-single')?.value) || 10.0;
    const colorDouble = parseFloat(document.getElementById('rate-color-double')?.value) || 18.0;

    if (bwSingle <= 0 || bwDouble <= 0 || colorSingle <= 0 || colorDouble <= 0) {
      if (showNotification) showToast("Please enter positive rate values for all fields.", "error");
      return false;
    }

    const effectiveCenterId = centerId || user?.centerId;
    const currentCenter = (effectiveCenterId ? stateStore.getCenter(effectiveCenterId) : null) || {};
    const newRates = { bwSingle, bwDouble, colorSingle, colorDouble };

    stateStore.saveCenter({
      ...currentCenter,
      centerId: effectiveCenterId,
      ownerUid: user?.uid,
      rates: newRates
    });

    if (effectiveCenterId) {
      localStorage.setItem(`smartprint_rates_${effectiveCenterId}`, JSON.stringify(newRates));
    }
    if (user?.uid) {
      localStorage.setItem(`smartprint_rates_${user.uid}`, JSON.stringify(newRates));
    }

    // Synchronize with Firebase Firestore if online
    if (effectiveCenterId && db) {
      try {
        const centerRef = doc(db, 'centers', effectiveCenterId);
        await setDoc(centerRef, { rates: newRates, updatedAt: serverTimestamp() }, { merge: true });
      } catch (err) {
        console.warn("Could not save rates to Firestore directly:", err);
      }
    }

    if (ratesStatusBadge) {
      ratesStatusBadge.textContent = "Live Rates";
      ratesStatusBadge.className = "badge badge-completed text-xs font-semibold";
    }

    if (showNotification) {
      showToast("Store pricing rates saved and updated successfully!", "success");
    }
    return true;
  }

  // Edit Rates Button
  if (btnEditRates) {
    btnEditRates.addEventListener('click', () => {
      const firstInput = document.getElementById('rate-bw-single');
      if (firstInput) {
        firstInput.focus();
        firstInput.select();
      }
      if (ratesStatusBadge) {
        ratesStatusBadge.textContent = "Editing Rates...";
        ratesStatusBadge.className = "badge badge-in_progress text-xs font-semibold";
      }
      showToast("Editing mode active. Adjust pricing rates below and click Save & Update.", "info");
    });
  }

  // Quick Preset Buttons
  document.querySelectorAll('.rates-preset-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const preset = btn.getAttribute('data-preset');
      let pRates = { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 };
      if (preset === 'budget') {
        pRates = { bwSingle: 1.5, bwDouble: 3.0, colorSingle: 8.0, colorDouble: 15.0 };
      } else if (preset === 'premium') {
        pRates = { bwSingle: 2.0, bwDouble: 4.0, colorSingle: 12.0, colorDouble: 20.0 };
      }
      setVal('rate-bw-single', pRates.bwSingle);
      setVal('rate-bw-double', pRates.bwDouble);
      setVal('rate-color-single', pRates.colorSingle);
      setVal('rate-color-double', pRates.colorDouble);

      await saveRatesSettings(false);
      showToast(`Applied ${preset.charAt(0).toUpperCase() + preset.slice(1)} pricing preset and updated!`, "success");
    });
  });

  // Reset Rates Button
  if (btnResetRates) {
    btnResetRates.addEventListener('click', () => {
      const savedRates = stateStore.getCenter(centerId)?.rates || { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 };
      setVal('rate-bw-single', savedRates.bwSingle || 2.0);
      setVal('rate-bw-double', savedRates.bwDouble || 3.5);
      setVal('rate-color-single', savedRates.colorSingle || 10.0);
      setVal('rate-color-double', savedRates.colorDouble || 18.0);

      if (ratesStatusBadge) {
        ratesStatusBadge.textContent = "Live Rates";
        ratesStatusBadge.className = "badge badge-completed text-xs font-semibold";
      }
      showToast("Pricing rates reset to current saved values.", "info");
    });
  }

  // Input Change Tracking & Auto-Save on edit completion
  ['rate-bw-single', 'rate-bw-double', 'rate-color-single', 'rate-color-double'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => {
        if (ratesStatusBadge) {
          ratesStatusBadge.textContent = "Unsaved Changes";
          ratesStatusBadge.className = "badge badge-in_progress text-xs font-semibold";
        }
      });
      input.addEventListener('change', () => {
        saveRatesSettings(true);
      });
    }
  });

  // Settings Rates Form Submission
  if (settingsRatesForm) {
    settingsRatesForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveRatesSettings(true);
    });
  }

  // -------------------------------------------------------------
  // Settings: 2. Connected Printers Status (REAL Hardware Only)
  // -------------------------------------------------------------
  currentDetectedPrinters = [];

  function triggerPrinterTestSlip(printerName) {
    showToast(`Sending hardware test slip to ${printerName}...`, "info");
    const centerObj = stateStore.getCenter(centerId);
    const storeName = centerObj?.storeName || centerObj?.name || "SmartPrint Xerox Center";
    const testSlipWindow = window.open('', '_blank', 'width=460,height=560');
    if (testSlipWindow) {
      testSlipWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Printer Diagnostic Slip - ${escapeHtml(printerName)}</title>
          <style>
            body { font-family: monospace; padding: 24px; color: #111; margin: 0; }
            .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 12px; margin-bottom: 16px; }
            .title { font-size: 16px; font-weight: bold; }
            .sub { font-size: 12px; color: #555; }
            .row { display: flex; justify-content: space-between; font-size: 12px; margin: 6px 0; }
            .line { border-bottom: 1px dashed #777; margin: 12px 0; }
            .cmyk-bar { display: flex; height: 16px; border: 1px solid #000; margin: 12px 0; }
            .cmyk-bar div { flex: 1; height: 100%; }
            .footer { text-align: center; border-top: 2px dashed #000; padding-top: 12px; margin-top: 16px; font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">SMARTPRINT WORKSTATION TEST SLIP</div>
            <div class="sub">${escapeHtml(storeName)}</div>
          </div>
          <div class="row"><span>Target Device:</span><strong>${escapeHtml(printerName)}</strong></div>
          <div class="row"><span>Diagnostic ID:</span><span>PASS-OK-${Date.now().toString(36).toUpperCase()}</span></div>
          <div class="row"><span>Timestamp:</span><span>${new Date().toLocaleString()}</span></div>
          <div class="row"><span>Interface:</span><span>Hardware Direct Spooler</span></div>
          <div class="line"></div>
          <div class="cmyk-bar">
            <div style="background: #00ffff;" title="Cyan"></div>
            <div style="background: #ff00ff;" title="Magenta"></div>
            <div style="background: #ffff00;" title="Yellow"></div>
            <div style="background: #000000;" title="Black"></div>
          </div>
          <div class="footer">
            *** HARDWARE CALIBRATION &amp; PRINT SEQUENCE OK ***
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          <\/script>
        </body>
        </html>
      `);
      testSlipWindow.document.close();
    }
  }

  function getPrinterSvgForType(iconType) {
    if (iconType === 'receipt') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>`;
    }
    if (iconType === 'color') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>`;
    }
    if (iconType === 'copier') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><polyline points="7 7 7 3 17 3 17 7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>`;
    }
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>`;
  }

  function renderConnectedPrinters(printers) {
    const listEl = document.getElementById('printers-status-list');
    if (!listEl) return;

    // Filter out any virtual printers just in case
    const externalPrinters = (printers || []).filter(p => !p.isVirtual && p.isExternal !== false);

    if (externalPrinters.length === 0) {
      listEl.innerHTML = `
        <div class="empty-printers-card" style="text-align: center; padding: 2.25rem 1rem; border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface-subtle); grid-column: 1 / -1;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔌</div>
          <h4 style="margin: 0 0 0.35rem 0; font-size: 0.95rem; font-weight: 700;">No Printers Connected to this Device</h4>
          <p class="text-xs text-muted" style="max-width: 480px; margin: 0 auto 1.25rem auto; line-height: 1.5;">
            No external hardware printers are currently detected on your workstation. Plug in your Xerox machine, laser printer, or color ink tank (Canon, HP, Epson, Brother, Ricoh, Konica Minolta, TVS, etc.) via USB cable or local Wi-Fi / LAN, then click <strong>Scan</strong>. Virtual software spoolers (PDF / OneNote) are filtered out.
          </p>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.25rem;">
            <span class="printer-spec-tag" style="font-size: 0.72rem;">Xerox / Copier</span>
            <span class="printer-spec-tag" style="font-size: 0.72rem;">Laser (B&amp;W)</span>
            <span class="printer-spec-tag" style="font-size: 0.72rem;">Color Ink Tank</span>
            <span class="printer-spec-tag" style="font-size: 0.72rem;">Thermal / POS Receipt</span>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-scan-empty-prompt">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            Scan for Connected Printers
          </button>
        </div>
      `;
      const emptyScanBtn = document.getElementById('btn-scan-empty-prompt');
      if (emptyScanBtn) {
        emptyScanBtn.addEventListener('click', () => {
          const refreshBtn = document.getElementById('btn-refresh-printers');
          if (refreshBtn) refreshBtn.click();
        });
      }
      return;
    }

    // Render ONLY real external printers physically connected on the device
    listEl.innerHTML = externalPrinters.map(p => {
      const iconSvg = getPrinterSvgForType(p.iconType || p.category);
      return `
      <div class="printer-device-card" data-printer-id="${escapeHtml(p.id)}">
        <div class="printer-device-header">
          <div class="printer-name-group">
            <div class="printer-type-icon">
              ${iconSvg}
            </div>
            <div>
              <div class="printer-name-title">
                ${escapeHtml(p.name)} 
                ${p.isDefault ? '<span class="badge badge-completed text-xs" style="font-size:0.65rem; padding: 0.1rem 0.4rem; vertical-align: middle;">Default</span>' : ''}
              </div>
              <div class="printer-name-sub">${escapeHtml(p.driver)} &bull; Port: ${escapeHtml(p.port)}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="badge badge-submitted text-xs font-semibold" style="font-size: 0.7rem; padding: 0.2rem 0.55rem;">
              ${escapeHtml(p.categoryBadge || p.category || 'External')}
            </span>
            <span class="printer-status-pill ${p.isOffline ? 'idle' : 'online'}">
              <span class="status-dot-pulse"></span>
              ${escapeHtml(p.status)}
            </span>
          </div>
        </div>
        <div class="printer-specs-row">
          <span class="printer-spec-tag"><strong>Type:</strong> ${escapeHtml(p.category || p.type || 'Hardware Printer')}</span>
          <span class="printer-spec-tag"><strong>Connection:</strong> ${escapeHtml(p.connectionInterface || p.port)}</span>
          <span class="printer-spec-tag">${p.isLocal ? 'Local Workstation' : 'Network Spooler'}</span>
        </div>
        <div class="printer-actions-row">
          <span class="text-xs text-muted">Connected to Counter PC &bull; Ready for Store Print Queue</span>
          <button type="button" class="btn btn-secondary btn-sm btn-test-print" data-printer="${escapeHtml(p.name)}" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;">
            Print Test Slip
          </button>
        </div>
      </div>
    `;
    }).join('');

    listEl.querySelectorAll('.btn-test-print').forEach(btn => {
      btn.addEventListener('click', () => {
        const printerName = btn.getAttribute('data-printer') || 'Connected Printer';
        triggerPrinterTestSlip(printerName);
      });
    });
  }

  function shortenPrinterName(name) {
    if (!name || name === 'None') return 'None';
    if (name.length > 18) return name.substring(0, 16) + '..';
    return name;
  }

  function getStepTitle(index) {
    if (index === 0) return '1st Choice (Primary)';
    if (index === 1) return '2nd Choice (Failover / Large Batches)';
    if (index === 2) return '3rd Choice (Backup)';
    return `${index + 1}th Choice (Failover)`;
  }

  function getStepBadgeClass(index) {
    if (index === 0) return 'priority-badge-pill priority-badge-p1';
    if (index === 1) return 'priority-badge-pill priority-badge-p2';
    if (index === 2) return 'priority-badge-pill priority-badge-p3';
    return 'priority-badge-pill priority-badge-pn';
  }

  function reindexPrioritySteps(type) {
    const container = document.getElementById(`${type === 'bw' ? 'bw' : 'color'}-priority-steps-list`);
    if (!container) return;
    const items = Array.from(container.querySelectorAll('.priority-step-item'));
    items.forEach((item, idx) => {
      item.setAttribute('data-index', idx);
      const titleEl = item.querySelector('.priority-step-title');
      if (titleEl) titleEl.textContent = getStepTitle(idx);

      const badgeEl = item.querySelector('.priority-badge-pill');
      if (badgeEl) {
        badgeEl.textContent = `Priority ${idx + 1}`;
        badgeEl.className = getStepBadgeClass(idx);
      }

      const sel = item.querySelector('select');
      if (sel) {
        if (idx === 0) sel.id = `seq-${type}-p1`;
        else if (idx === 1) sel.id = `seq-${type}-p2`;
        else if (idx === 2) sel.id = `seq-${type}-p3`;
        else sel.id = `seq-${type}-p${idx + 1}`;
      }

      const upBtn = item.querySelector('.btn-move-up');
      if (upBtn) upBtn.disabled = (idx === 0);

      const downBtn = item.querySelector('.btn-move-down');
      if (downBtn) downBtn.disabled = (idx === items.length - 1);
    });
  }

  function movePriorityStep(btn, direction) {
    const item = btn.closest('.priority-step-item');
    if (!item) return;
    const container = item.parentElement;
    const type = item.getAttribute('data-type') || (container.id.includes('bw') ? 'bw' : 'color');

    if (direction === 'up') {
      const prev = item.previousElementSibling;
      if (prev && prev.classList.contains('priority-step-item')) {
        container.insertBefore(item, prev);
        reindexPrioritySteps(type);
        updatePrioritySummaryBadge();
        savePrinterPrioritySettings(true);
      }
    } else if (direction === 'down') {
      const next = item.nextElementSibling;
      if (next && next.classList.contains('priority-step-item')) {
        container.insertBefore(next, item);
        reindexPrioritySteps(type);
        updatePrioritySummaryBadge();
        savePrinterPrioritySettings(true);
      }
    }
  }

  function removePriorityStep(btn) {
    const item = btn.closest('.priority-step-item');
    if (!item) return;
    const container = item.parentElement;
    const type = item.getAttribute('data-type') || (container.id.includes('bw') ? 'bw' : 'color');
    const items = container.querySelectorAll('.priority-step-item');

    if (items.length <= 1) {
      const sel = item.querySelector('select');
      if (sel) sel.value = 'None';
      updatePrioritySummaryBadge();
      savePrinterPrioritySettings(true);
      return;
    }

    item.remove();
    reindexPrioritySteps(type);
    updatePrioritySummaryBadge();
    savePrinterPrioritySettings(true);
    showToast(`Removed printer from ${type === 'bw' ? 'B&W' : 'Colour'} priority sequence.`, "info");
  }

  function addPriorityStep(type, selectedPrinterName = null) {
    const container = document.getElementById(`${type === 'bw' ? 'bw' : 'color'}-priority-steps-list`);
    if (!container) return;

    const existingCount = container.querySelectorAll('.priority-step-item').length;
    const newIdx = existingCount;

    const optionsHtml = buildPrinterOptionsHtml(selectedPrinterName, false);
    const stepId = newIdx === 0 ? `seq-${type}-p1` : (newIdx === 1 ? `seq-${type}-p2` : (newIdx === 2 ? `seq-${type}-p3` : `seq-${type}-p${newIdx + 1}`));

    const stepDiv = document.createElement('div');
    stepDiv.className = 'priority-step-item';
    stepDiv.setAttribute('data-type', type);
    stepDiv.setAttribute('data-index', newIdx);
    stepDiv.innerHTML = `
      <div class="priority-step-label">
        <div class="flex items-center gap-2">
          <span class="priority-step-title">${getStepTitle(newIdx)}</span>
          <span class="${getStepBadgeClass(newIdx)}">Priority ${newIdx + 1}</span>
        </div>
        <div class="priority-step-actions flex items-center gap-1">
          <button type="button" class="btn-priority-nav btn-move-up" title="Move Up in Priority" aria-label="Move Up">▲</button>
          <button type="button" class="btn-priority-nav btn-move-down" title="Move Down in Priority" aria-label="Move Down" disabled>▼</button>
          <button type="button" class="btn-priority-nav btn-remove-step" title="Remove Printer from Sequence" aria-label="Remove">✕</button>
        </div>
      </div>
      <select class="form-select text-xs priority-select" id="${stepId}">
        ${optionsHtml}
      </select>
    `;

    container.appendChild(stepDiv);

    const sel = stepDiv.querySelector('select');
    const externalPrinters = (currentDetectedPrinters || []).filter(p => !p.isVirtual && p.isExternal !== false && !isDemoPrinterName(p.name));
    const isConnected = (p) => externalPrinters.some(ep => ep.name === p);
    if (selectedPrinterName && !isDemoPrinterName(selectedPrinterName) && isConnected(selectedPrinterName)) {
      sel.value = selectedPrinterName;
    } else {
      if (externalPrinters.length > newIdx) {
        sel.value = externalPrinters[newIdx].name;
      } else if (externalPrinters.length > 0) {
        sel.value = externalPrinters[0].name;
      } else {
        sel.value = 'None';
      }
    }

    sel.addEventListener('change', () => {
      updatePrioritySummaryBadge();
      savePrinterPrioritySettings(true);
    });

    stepDiv.querySelector('.btn-move-up').addEventListener('click', (e) => movePriorityStep(e.currentTarget, 'up'));
    stepDiv.querySelector('.btn-move-down').addEventListener('click', (e) => movePriorityStep(e.currentTarget, 'down'));
    stepDiv.querySelector('.btn-remove-step').addEventListener('click', (e) => removePriorityStep(e.currentTarget));

    reindexPrioritySteps(type);
    updatePrioritySummaryBadge();
    savePrinterPrioritySettings(true);
    showToast(`Added Priority ${newIdx + 1} slot for ${type === 'bw' ? 'B&W' : 'Colour'}. Select any available printer!`, "success");
  }

  function updatePrioritySummaryBadge() {
    const summaryBadge = document.getElementById('priority-rule-summary');
    if (!summaryBadge) return;

    const bwContainer = document.getElementById('bw-priority-steps-list');
    const colorContainer = document.getElementById('color-priority-steps-list');

    const bwSelects = bwContainer
      ? Array.from(bwContainer.querySelectorAll('select'))
      : [document.getElementById('seq-bw-p1'), document.getElementById('seq-bw-p2'), document.getElementById('seq-bw-p3')].filter(Boolean);

    const colSelects = colorContainer
      ? Array.from(colorContainer.querySelectorAll('select'))
      : [document.getElementById('seq-color-p1'), document.getElementById('seq-color-p2'), document.getElementById('seq-color-p3')].filter(Boolean);

    const bwPrinters = bwSelects
      .map(s => s?.value)
      .filter(p => p && p !== 'None' && !p.includes('Scanning') && !p.includes('No printer') && !isDemoPrinterName(p));

    const colPrinters = colSelects
      .map(s => s?.value)
      .filter(p => p && p !== 'None' && !p.includes('Scanning') && !p.includes('No printer') && !isDemoPrinterName(p));

    const bw1 = document.getElementById('seq-bw-p1')?.value;
    const bw2 = document.getElementById('seq-bw-p2')?.value;
    const col1 = document.getElementById('seq-color-p1')?.value;
    const col2 = document.getElementById('seq-color-p2')?.value;

    if (bwPrinters.length === 0 && colPrinters.length === 0 && (!bw1 || bw1 === 'None' || bw1.includes('Scanning') || bw1.includes('No printer') || isDemoPrinterName(bw1))) {
      summaryBadge.textContent = "No printers connected to this device";
      summaryBadge.className = "badge badge-rejected text-xs font-semibold";
      return;
    }

    const bwChain = bwPrinters.length > 0
      ? bwPrinters.map(shortenPrinterName).join(' → ')
      : (bw1 && bw1 !== 'None' && !bw1.includes('Scanning') && !bw1.includes('No printer') && !isDemoPrinterName(bw1) ? shortenPrinterName(bw1) : 'None');
    const colChain = colPrinters.length > 0
      ? colPrinters.map(shortenPrinterName).join(' → ')
      : (col1 && col1 !== 'None' && !col1.includes('Scanning') && !col1.includes('No printer') && !isDemoPrinterName(col1) ? shortenPrinterName(col1) : 'None');

    summaryBadge.textContent = `B&W: ${bwChain} | Colour: ${colChain}`;
    summaryBadge.className = "badge badge-submitted text-xs font-semibold";
  }

  function populatePrinterSequenceDropdowns(printers = null, explicitRouting = null) {
    const bwContainer = document.getElementById('bw-priority-steps-list');
    const colorContainer = document.getElementById('color-priority-steps-list');
    const bwP1 = document.getElementById('seq-bw-p1');
    const bwP2 = document.getElementById('seq-bw-p2');
    const bwP3 = document.getElementById('seq-bw-p3');
    const colP1 = document.getElementById('seq-color-p1');
    const colP2 = document.getElementById('seq-color-p2');
    const colP3 = document.getElementById('seq-color-p3');

    if (!bwContainer && !bwP1) return;

    if (printers && Array.isArray(printers)) {
      currentDetectedPrinters = printers.filter(p => !p.isVirtual && p.isExternal !== false && !isDemoPrinterName(p.name));
    }

    const activeUser = user || auth.getCurrentUser();
    const effectiveCenterId = centerId || activeUser?.centerId;
    const currentCenter = (effectiveCenterId ? stateStore.getCenter(effectiveCenterId) : null) || {};

    let savedRouting = explicitRouting || currentCenter.printerRouting;
    if (!savedRouting && effectiveCenterId) {
      const rawCenterRouting = localStorage.getItem(`smartprint_routing_${effectiveCenterId}`);
      if (rawCenterRouting) {
        try { savedRouting = JSON.parse(rawCenterRouting); } catch (e) {}
      }
    }
    if (!savedRouting && activeUser?.uid) {
      const rawUserRouting = localStorage.getItem(`smartprint_routing_${activeUser.uid}`);
      if (rawUserRouting) {
        try { savedRouting = JSON.parse(rawUserRouting); } catch (e) {}
      }
    }
    savedRouting = cleanPrinterRouting(savedRouting);

    const externalPrinters = (currentDetectedPrinters || []).filter(p => !p.isVirtual && p.isExternal !== false && !isDemoPrinterName(p.name));
    const isConnected = (p) => externalPrinters.some(ep => ep.name === p);

    const setupList = (type, savedList) => {
      const container = document.getElementById(`${type === 'bw' ? 'bw' : 'color'}-priority-steps-list`);
      if (!container) return;

      const cleanedSavedList = (Array.isArray(savedList) ? savedList : [])
        .filter(p => p && p !== 'None' && !isDemoPrinterName(p) && isConnected(p));

      let listToRender = [];
      if (cleanedSavedList.length > 0) {
        listToRender = [...cleanedSavedList];
      } else if (externalPrinters.length > 0) {
        listToRender = externalPrinters.slice(0, 3).map(p => p.name);
      } else {
        listToRender = ['None', 'None', 'None'];
      }

      while (listToRender.length < 3) {
        listToRender.push('None');
      }

      container.innerHTML = '';
      listToRender.forEach((printerName, idx) => {
        const stepId = idx === 0 ? `seq-${type}-p1` : (idx === 1 ? `seq-${type}-p2` : (idx === 2 ? `seq-${type}-p3` : `seq-${type}-p${idx + 1}`));
        const optionsHtml = buildPrinterOptionsHtml(printerName, idx === 0);

        const stepDiv = document.createElement('div');
        stepDiv.className = 'priority-step-item';
        stepDiv.setAttribute('data-type', type);
        stepDiv.setAttribute('data-index', idx);
        stepDiv.innerHTML = `
          <div class="priority-step-label">
            <div class="flex items-center gap-2">
              <span class="priority-step-title">${getStepTitle(idx)}</span>
              <span class="${getStepBadgeClass(idx)}">Priority ${idx + 1}</span>
            </div>
            <div class="priority-step-actions flex items-center gap-1">
              <button type="button" class="btn-priority-nav btn-move-up" title="Move Up in Priority" aria-label="Move Up" ${idx === 0 ? 'disabled' : ''}>▲</button>
              <button type="button" class="btn-priority-nav btn-move-down" title="Move Down in Priority" aria-label="Move Down" ${idx === listToRender.length - 1 ? 'disabled' : ''}>▼</button>
              <button type="button" class="btn-priority-nav btn-remove-step" title="Remove Printer from Sequence" aria-label="Remove">✕</button>
            </div>
          </div>
          <select class="form-select text-xs priority-select" id="${stepId}">
            ${optionsHtml}
          </select>
        `;

        container.appendChild(stepDiv);

        const sel = stepDiv.querySelector('select');
        if (printerName && !isDemoPrinterName(printerName) && isConnected(printerName)) {
          sel.value = printerName;
        } else {
          sel.value = 'None';
        }

        sel.addEventListener('change', () => {
          updatePrioritySummaryBadge();
          savePrinterPrioritySettings(true);
        });

        stepDiv.querySelector('.btn-move-up').addEventListener('click', (e) => movePriorityStep(e.currentTarget, 'up'));
        stepDiv.querySelector('.btn-move-down').addEventListener('click', (e) => movePriorityStep(e.currentTarget, 'down'));
        stepDiv.querySelector('.btn-remove-step').addEventListener('click', (e) => removePriorityStep(e.currentTarget));
      });

      reindexPrioritySteps(type);
    };

    if (bwContainer && colorContainer) {
      setupList('bw', savedRouting.bwPriority);
      setupList('color', savedRouting.colorPriority);
    } else {
      // Legacy fallback
      const bw1Val = isConnected(savedRouting.bwPriority?.[0]) ? savedRouting.bwPriority[0] : (externalPrinters[0]?.name || 'None');
      const bw2Val = isConnected(savedRouting.bwPriority?.[1]) ? savedRouting.bwPriority[1] : (externalPrinters[1]?.name || 'None');
      const bw3Val = isConnected(savedRouting.bwPriority?.[2]) ? savedRouting.bwPriority[2] : 'None';
      const col1Val = isConnected(savedRouting.colorPriority?.[0]) ? savedRouting.colorPriority[0] : (externalPrinters[0]?.name || 'None');
      const col2Val = isConnected(savedRouting.colorPriority?.[1]) ? savedRouting.colorPriority[1] : (externalPrinters[1]?.name || 'None');
      const col3Val = isConnected(savedRouting.colorPriority?.[2]) ? savedRouting.colorPriority[2] : 'None';

      if (bwP1) bwP1.innerHTML = buildPrinterOptionsHtml(bw1Val, true);
      if (bwP2) bwP2.innerHTML = buildPrinterOptionsHtml(bw2Val, false);
      if (bwP3) bwP3.innerHTML = buildPrinterOptionsHtml(bw3Val, false);
      if (colP1) colP1.innerHTML = buildPrinterOptionsHtml(col1Val, true);
      if (colP2) colP2.innerHTML = buildPrinterOptionsHtml(col2Val, false);
      if (colP3) colP3.innerHTML = buildPrinterOptionsHtml(col3Val, false);

      if (bwP1) bwP1.value = bw1Val;
      if (bwP2) bwP2.value = bw2Val;
      if (bwP3) bwP3.value = bw3Val;
      if (colP1) colP1.value = col1Val;
      if (colP2) colP2.value = col2Val;
      if (colP3) colP3.value = col3Val;
    }

    if (typeof savedRouting.autoFailover === 'boolean') {
      const failoverCheck = document.getElementById('seq-auto-failover');
      if (failoverCheck) failoverCheck.checked = savedRouting.autoFailover;
    }
    if (typeof savedRouting.autoDuplexMatch === 'boolean') {
      const duplexCheck = document.getElementById('seq-auto-duplex-match');
      if (duplexCheck) duplexCheck.checked = savedRouting.autoDuplexMatch;
    }

    updatePrioritySummaryBadge();
  }

  async function fetchAndRenderConnectedPrinters() {
    const countBadge = document.getElementById('printer-count-badge');
    const scanTimeEl = document.getElementById('printer-scan-time');

    try {
      const res = await fetch('/api/system/printers');
      const data = await res.json();
      currentDetectedPrinters = (data && data.printers)
        ? data.printers.filter(p => !p.isVirtual && p.isExternal !== false && !isDemoPrinterName(p.name))
        : [];
    } catch (err) {
      currentDetectedPrinters = [];
    }

    renderConnectedPrinters(currentDetectedPrinters);

    const activeUser = user || auth.getCurrentUser();
    const effectiveCenterId = centerId || activeUser?.centerId;
    const currentCenter = (effectiveCenterId ? stateStore.getCenter(effectiveCenterId) : null) || {};
    let savedRouting = currentCenter.printerRouting;
    if (!savedRouting && effectiveCenterId) {
      const r = localStorage.getItem(`smartprint_routing_${effectiveCenterId}`);
      if (r) { try { savedRouting = JSON.parse(r); } catch(e) {} }
    }
    if (!savedRouting && activeUser?.uid) {
      const r = localStorage.getItem(`smartprint_routing_${activeUser.uid}`);
      if (r) { try { savedRouting = JSON.parse(r); } catch(e) {} }
    }
    savedRouting = cleanPrinterRouting(savedRouting);

    populatePrinterSequenceDropdowns(currentDetectedPrinters, savedRouting);

    if (countBadge) {
      countBadge.textContent = `${currentDetectedPrinters.length} External Connected`;
      countBadge.className = currentDetectedPrinters.length > 0
        ? "badge badge-completed text-xs font-semibold"
        : "badge badge-rejected text-xs font-semibold";
    }

    if (scanTimeEl) {
      const now = new Date();
      scanTimeEl.textContent = `Updated at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }

    return currentDetectedPrinters;
  }

  // Scan & Refresh button
  const refreshPrintersBtn = document.getElementById('btn-refresh-printers');
  if (refreshPrintersBtn) {
    refreshPrintersBtn.addEventListener('click', async () => {
      refreshPrintersBtn.disabled = true;
      const origContent = refreshPrintersBtn.innerHTML;
      refreshPrintersBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg> Scanning...
      `;

      const printers = await fetchAndRenderConnectedPrinters();
      refreshPrintersBtn.disabled = false;
      refreshPrintersBtn.innerHTML = origContent;

      if (printers.length > 0) {
        showToast(`Workstation scanned: ${printers.length} external printer(s) connected to your device!`, "success");
      } else {
        showToast("No external printers detected on this device. Connect via USB or local network and retry.", "info");
      }
    });
  }

  // Initial detection of connected printers
  fetchAndRenderConnectedPrinters();

  // -------------------------------------------------------------
  // Settings: 3. Printer Sequence Priority (B&W & Colour)
  // -------------------------------------------------------------
  async function savePrinterPrioritySettings(showNotification = true) {
    const activeUser = user || auth.getCurrentUser();
    const effectiveCenterId = centerId || activeUser?.centerId;

    const bwContainer = document.getElementById('bw-priority-steps-list');
    const colorContainer = document.getElementById('color-priority-steps-list');

    const bwSelects = bwContainer
      ? Array.from(bwContainer.querySelectorAll('select'))
      : [document.getElementById('seq-bw-p1'), document.getElementById('seq-bw-p2'), document.getElementById('seq-bw-p3')].filter(Boolean);

    const colSelects = colorContainer
      ? Array.from(colorContainer.querySelectorAll('select'))
      : [document.getElementById('seq-color-p1'), document.getElementById('seq-color-p2'), document.getElementById('seq-color-p3')].filter(Boolean);

    const bw1 = document.getElementById('seq-bw-p1')?.value;
    const bw2 = document.getElementById('seq-bw-p2')?.value;
    const bw3 = document.getElementById('seq-bw-p3')?.value;
    const col1 = document.getElementById('seq-color-p1')?.value;
    const col2 = document.getElementById('seq-color-p2')?.value;
    const col3 = document.getElementById('seq-color-p3')?.value;
    const autoFailover = document.getElementById('seq-auto-failover')?.checked ?? true;
    const autoDuplexMatch = document.getElementById('seq-auto-duplex-match')?.checked ?? true;

    const bwPriority = (bwSelects.length > 0 ? bwSelects.map(s => s.value) : [bw1, bw2, bw3])
      .filter(p => p && p !== 'None' && !p.includes('No printer') && !p.includes('Scanning') && !isDemoPrinterName(p));

    const colorPriority = (colSelects.length > 0 ? colSelects.map(s => s.value) : [col1, col2, col3])
      .filter(p => p && p !== 'None' && !p.includes('No printer') && !p.includes('Scanning') && !isDemoPrinterName(p));

    const printerRouting = cleanPrinterRouting({
      bwPriority,
      colorPriority,
      autoFailover,
      autoDuplexMatch,
      updatedAt: new Date().toISOString()
    });

    const currentCenter = (effectiveCenterId ? stateStore.getCenter(effectiveCenterId) : null) || {};
    stateStore.saveCenter({
      ...currentCenter,
      centerId: effectiveCenterId,
      ownerUid: activeUser?.uid,
      printerRouting
    });

    if (effectiveCenterId) {
      localStorage.setItem(`smartprint_routing_${effectiveCenterId}`, JSON.stringify(printerRouting));
    }
    if (activeUser?.uid) {
      localStorage.setItem(`smartprint_routing_${activeUser.uid}`, JSON.stringify(printerRouting));
    }

    if (effectiveCenterId && db) {
      try {
        const centerRef = doc(db, 'centers', effectiveCenterId);
        await setDoc(centerRef, { printerRouting, updatedAt: serverTimestamp() }, { merge: true });
      } catch (err) {
        console.warn("Could not save printerRouting to Firestore directly:", err);
      }
    }

    updatePrioritySummaryBadge();
    if (showNotification) {
      showToast("Printer priority sequence saved and updated successfully!", "success");
    }
  }

  // Auto-save on change of any priority dropdown or routing option
  ['seq-bw-p1', 'seq-bw-p2', 'seq-bw-p3', 'seq-color-p1', 'seq-color-p2', 'seq-color-p3', 'seq-auto-failover', 'seq-auto-duplex-match'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        updatePrioritySummaryBadge();
        savePrinterPrioritySettings(true);
      });
    }
  });

  // Explicit Save & Update Button for Printer Priority
  const btnSavePrinterPriority = document.getElementById('btn-save-printer-priority');
  if (btnSavePrinterPriority) {
    btnSavePrinterPriority.addEventListener('click', async (e) => {
      e.preventDefault();
      await savePrinterPrioritySettings(true);
    });
  }

  // Add Printer buttons for B&W and Colour priority sequences
  const addBwBtn = document.getElementById('btn-add-bw-printer');
  if (addBwBtn) {
    addBwBtn.addEventListener('click', () => addPriorityStep('bw'));
  }
  const addColorBtn = document.getElementById('btn-add-color-printer');
  if (addColorBtn) {
    addColorBtn.addEventListener('click', () => addPriorityStep('color'));
  }

  const printerPriorityForm = document.getElementById('printer-priority-form');
  if (printerPriorityForm) {
    printerPriorityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await savePrinterPrioritySettings(true);
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => auth.logout());

  // Show QR Card Modal button
  const showQrBtn = document.getElementById('btn-show-qr');
  if (showQrBtn) {
    showQrBtn.addEventListener('click', () => {
      populateQRModal(stateStore.getCenter(centerId));
      openModal('qr-modal');
    });
  }

  // View All Orders in History button on Dashboard
  const viewAllHistoryBtn = document.getElementById('btn-view-all-history');
  if (viewAllHistoryBtn) {
    viewAllHistoryBtn.addEventListener('click', () => {
      switchView('history');
    });
  }

  // History Date Range Filter Buttons
  document.querySelectorAll('.history-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentHistoryRange = btn.getAttribute('data-range') || 'all';
      renderHistory(centerId);
    });
  });

  // History Search Input
  const searchHistoryInput = document.getElementById('search-history-input');
  if (searchHistoryInput) {
    searchHistoryInput.addEventListener('input', () => {
      renderHistory(centerId);
    });
  }

  // Analytics Timeframe Filter Buttons & Custom Range
  document.querySelectorAll('.analytics-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.analytics-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAnalyticsRange = btn.getAttribute('data-range') || 'all';
      currentAnalyticsTablePage = 1;

      const customContainers = document.querySelectorAll('#analytics-custom-date-container');
      customContainers.forEach(el => {
        el.style.display = currentAnalyticsRange === 'custom' ? 'flex' : 'none';
      });

      if (currentAnalyticsRange !== 'custom') {
        renderAnalyticsSection(centerId);
      }
    });
  });

  // Custom Range Apply button
  document.querySelectorAll('#btn-apply-custom-date').forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('#analytics-custom-date-container') || document;
      const sInput = container.querySelector('#analytics-custom-start');
      const eInput = container.querySelector('#analytics-custom-end');
      if (!sInput?.value || !eInput?.value) {
        showToast("Please choose both start and end dates", "warning");
        return;
      }
      currentAnalyticsCustomStart = sInput.value;
      currentAnalyticsCustomEnd = eInput.value;
      currentAnalyticsTablePage = 1;
      renderAnalyticsSection(centerId);
      showToast(`Applied custom date filter: ${sInput.value} to ${eInput.value}`, "info");
    });
  });

  // Analytics CSV Export Action Button
  document.querySelectorAll('#btn-export-analytics-csv').forEach(btn => {
    btn.addEventListener('click', () => {
      exportAnalyticsToCSV(centerId);
    });
  });

  // Small Dark / Light Theme Toggle Button Handler
  initThemeToggle();

  // Subscribe to reactive state updates
  stateStore.subscribe((event) => {
    if (event === 'jobs') {
      renderKPIs(centerId);
      renderQueue(centerId);
      renderHistory(centerId);
      renderAnalyticsSection(centerId);
    }
    if (event === 'centers') {
      const updatedCenter = centerId ? stateStore.getCenter(centerId) : null;
      renderSubscription(updatedCenter);
      populateProfileForm(updatedCenter);
    }
  });

  // Auto-detect section view from current URL pathname (supports clean URLs on Vercel without .html)
  const curPagePath = window.location.pathname.toLowerCase();
  let initialView = 'dashboard';
  if (curPagePath.includes('history')) initialView = 'history';
  else if (curPagePath.includes('analytics')) initialView = 'analytics';
  else if (curPagePath.includes('setting')) initialView = 'settings';
  else if (curPagePath.includes('profile')) initialView = 'profile';

  switchView(initialView);
});

function switchView(viewName) {
  let target = viewName;
  if (viewName === 'queue') target = 'dashboard';
  if (viewName === 'setting') target = 'settings';

  currentActiveView = target;
  document.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
    const btnView = btn.getAttribute('data-view');
    const isActive = (btnView === target) || (target === 'dashboard' && btnView === 'queue') || (target === 'settings' && btnView === 'setting');
    btn.classList.toggle('active', isActive);
  });

  document.querySelectorAll('.tab-view-content').forEach(view => {
    view.style.display = 'none';
  });

  const activeViewEl = document.getElementById(`view-${target}`) || document.getElementById(`view-${viewName}`);
  if (activeViewEl) {
    activeViewEl.style.display = 'block';
  } else {
    // Safety fallback: If activeViewEl not found (e.g. dedicated section page like settings.html, history.html),
    // ensure the page's primary tab-view-content remains visible!
    const singleView = document.querySelector('.tab-view-content');
    if (singleView) singleView.style.display = 'block';
  }

  const breadcrumb = document.getElementById('view-title-breadcrumb');
  if (breadcrumb) {
    const titles = {
      dashboard: 'Dashboard',
      queue: 'Dashboard',
      history: 'History',
      analytics: 'Analytics',
      settings: 'Setting',
      setting: 'Setting',
      profile: 'Profile'
    };
    breadcrumb.textContent = titles[target] || 'Dashboard';
  }
}

function renderKPIs(centerId) {
  const jobs = stateStore.getJobs(centerId);

  const isToday = (dateStr) => {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const today = new Date();
      return d.getFullYear() === today.getFullYear() &&
             d.getMonth() === today.getMonth() &&
             d.getDate() === today.getDate();
    } catch (e) {
      return false;
    }
  };

  // 1. TODAYS EARNING (Sum of completed jobs today)
  const completedTodayJobs = jobs.filter(j => 
    j.status === 'completed' && 
    (isToday(j.completedAt) || isToday(j.updatedAt) || isToday(j.createdAt))
  );
  const todaysEarnings = completedTodayJobs.reduce((sum, j) => sum + (Number(j.estimatedAmount) || 0), 0);

  // 2. ORDERS PENDING (Active print queue pipeline)
  const pendingJobs = jobs.filter(j => ['submitted', 'under_review', 'printing'].includes(j.status));
  const pendingCount = pendingJobs.length;

  // 3. HOW MANY ORDERS TODAY (Total print orders received today)
  const ordersToday = jobs.filter(j => isToday(j.createdAt) || isToday(j.updatedAt));
  const ordersTodayCount = ordersToday.length;

  // 4. REJECT PRINT (Rejected print requests)
  const rejectJobs = jobs.filter(j => j.status === 'rejected');
  const rejectCount = rejectJobs.length;

  // Card 1: Today's Earning
  const elEarning = document.getElementById('kpi-todays-earning') || document.getElementById('kpi-revenue-total');
  if (elEarning) elEarning.textContent = formatCurrencyINR(todaysEarnings);

  // Card 2: Orders Pending
  const elPending = document.getElementById('kpi-orders-pending') || document.getElementById('kpi-queue-count-display');
  if (elPending) elPending.textContent = pendingCount;

  // Update Slide Bar queue badge counter
  const kpiQueue = document.getElementById('kpi-queue-count');
  if (kpiQueue) kpiQueue.textContent = pendingCount;

  // Card 3: How Many Orders Today
  const elToday = document.getElementById('kpi-orders-today') || document.getElementById('kpi-today-count');
  if (elToday) elToday.textContent = ordersTodayCount;

  // Card 4: Reject Print
  const elReject = document.getElementById('kpi-reject-print') || document.getElementById('kpi-reject-count');
  if (elReject) elReject.textContent = rejectCount;

  // Legacy fallback if pages counter element is queried
  const kpiPages = document.getElementById('kpi-pages-count');
  if (kpiPages) {
    const totalPages = completedTodayJobs.reduce((sum, j) => sum + ((j.pageCount || 1) * (j.copies || 1)), 0);
    kpiPages.textContent = totalPages;
  }
}

function renderQueue(centerId) {
  const jobsTableBody = document.getElementById('queue-table-body');
  if (!jobsTableBody) return;

  const searchQuery = (document.getElementById('search-queue-input')?.value || '').toLowerCase().trim();

  let jobs = stateStore.getJobs(centerId);
  // Sort most recent first
  jobs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (currentFilter !== 'all') {
    if (currentFilter === 'submitted') {
      jobs = jobs.filter(j => j.status === 'submitted' || j.status === 'pending_confirmation');
    } else if (currentFilter === 'under_review') {
      jobs = jobs.filter(j => j.status === 'under_review' || j.status === 'approved_awaiting_cash' || j.status === 'payment_confirmed' || j.status === 'queued');
    } else {
      jobs = jobs.filter(j => j.status === currentFilter);
    }
  }

  if (searchQuery) {
    jobs = jobs.filter(j => 
      j.originalFileName.toLowerCase().includes(searchQuery) || 
      j.trackingToken.toLowerCase().includes(searchQuery)
    );
  }

  updateTabBadges(centerId);

  // Update footer subtext for last 5 orders
  const subtextEl = document.getElementById('dashboard-queue-subtext');
  if (subtextEl) {
    subtextEl.textContent = jobs.length === 0 
      ? 'No orders in queue' 
      : `Showing last ${Math.min(5, jobs.length)} orders`;
  }

  // Dashboard shows ONLY LAST 5 ORDERS
  const displayJobs = jobs.slice(0, 5);

  if (displayJobs.length === 0) {
    jobsTableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">${ICONS.printer}</div>
            <h3>No print jobs found</h3>
            <p class="text-sm text-muted">Customer submissions will appear here in real-time.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  jobsTableBody.innerHTML = displayJobs.map(job => `
    <tr id="job-row-${job.jobId}">
      <td>
        <div class="font-medium text-main">${escapeHtml(job.originalFileName)}</div>
        <div class="text-xs text-muted flex items-center gap-1 flex-wrap">
          ${job.fileCount > 1 ? `<span class="badge badge-submitted text-xs" style="font-size:0.65rem; padding: 1px 4px;">${job.fileCount} Materials</span> &bull;` : ''}
          <span>${formatBytes(job.fileSizeBytes)}</span> &bull; 
          <span>${job.pageCount} pgs</span> &bull; 
          <span>${job.copies} ${job.copies > 1 ? 'copies' : 'copy'}</span>
        </div>
      </td>
      <td>
        <span class="font-medium text-sm" style="font-family: var(--font-family-mono); background: var(--primary-50); padding: 2px 6px; border-radius: 4px;">
          ${job.trackingToken}
        </span>
      </td>
      <td>
        <div class="text-xs">
          <span class="font-semibold">${job.paperSize}</span> &bull; 
          <span>${job.colorMode === 'color' ? 'Color' : 'B&W'}</span> &bull; 
          <span>${job.duplex ? '2-Sided' : '1-Sided'}</span>
        </div>
        ${job.routedPrinter ? `
          <div class="text-xs" style="margin-top: 2px;">
            <span class="badge badge-submitted text-xs" style="font-size: 0.65rem; padding: 1px 4px;">🖨️ ${escapeHtml(job.routedPrinter)}${job.isFailover ? ' (Failover P' + job.priorityLevel + ')' : ''}</span>
          </div>
        ` : ''}
      </td>
      <td>
        <span class="font-semibold text-sm">${formatCurrencyINR(job.estimatedAmount || 0)}</span>
      </td>
      <td>
        ${getStatusBadge(job.status)}
      </td>
      <td class="text-xs text-muted">
        ${formatTimeAgo(job.createdAt)}
      </td>
      <td class="text-right">
        <div class="flex items-center justify-center gap-1">
          ${renderActionButtons(job)}
        </div>
      </td>
    </tr>
  `).join('');

  attachActionListeners();
}

export function getYearCycle(dateInput = new Date()) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '2026 - 2027';
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan, 3 = Apr
  // Standard Indian fiscal/annual cycle (April to March):
  // e.g. April 2026 to March 2027 is "2026 - 2027", April 2027 to March 2028 is "2027 - 2028"
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear} - ${endYear}`;
}

export function filterJobsByDateRange(jobs, range, customStart = null, customEnd = null) {
  const now = new Date();
  const nowMs = now.getTime();

  return (jobs || []).filter(job => {
    const jobDate = new Date(job.createdAt || job.updatedAt || 0);
    if (isNaN(jobDate.getTime()) || jobDate.getTime() === 0) return true;
    const jobMs = jobDate.getTime();
    const diffMs = nowMs - jobMs;

    switch (range) {
      case 'today':
        return jobDate.getFullYear() === now.getFullYear() &&
               jobDate.getMonth() === now.getMonth() &&
               jobDate.getDate() === now.getDate();
      case 'yesterday': {
        const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        return jobDate.getFullYear() === yest.getFullYear() &&
               jobDate.getMonth() === yest.getMonth() &&
               jobDate.getDate() === yest.getDate();
      }
      case '7days':
        return diffMs <= 7 * 24 * 60 * 60 * 1000 && diffMs >= 0;
      case '30days':
        return diffMs <= 30 * 24 * 60 * 60 * 1000 && diffMs >= 0;
      case 'this_month':
        return jobDate.getFullYear() === now.getFullYear() &&
               jobDate.getMonth() === now.getMonth();
      case 'prev_month': {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return jobDate.getFullYear() === prevMonthDate.getFullYear() &&
               jobDate.getMonth() === prevMonthDate.getMonth();
      }
      case '3months':
        return diffMs <= 90 * 24 * 60 * 60 * 1000 && diffMs >= 0;
      case '6months':
        return diffMs <= 180 * 24 * 60 * 60 * 1000 && diffMs >= 0;
      case '1year': {
        // Year calculation on the basis of annual cycle (e.g. 2026 - 2027 and so on)
        const currentCycle = getYearCycle(now);
        const jobCycle = getYearCycle(jobDate);
        return jobCycle === currentCycle || (diffMs <= 365 * 24 * 60 * 60 * 1000 && diffMs >= 0);
      }
      case 'custom': {
        if (!customStart || !customEnd) return true;
        const s = new Date(customStart + "T00:00:00.000").getTime();
        const e = new Date(customEnd + "T23:59:59.999").getTime();
        return jobMs >= s && jobMs <= e;
      }
      case 'all':
      default:
        return true;
    }
  });
}

function renderHistory(centerId) {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  const searchQuery = (document.getElementById('search-history-input')?.value || '').toLowerCase().trim();

  // 1. Retrieve all jobs for center and sort newest first
  let allJobs = stateStore.getJobs(centerId);
  allJobs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Dynamic Year cycle label (e.g. "2026 - 2027")
  const currentCycle = getYearCycle(new Date());
  const yearTabLabel = document.getElementById('history-year-tab-label');
  if (yearTabLabel) yearTabLabel.textContent = currentCycle;

  // 2. Update badge counts for each date range tab
  const countTabs = {
    all: allJobs.length,
    today: filterJobsByDateRange(allJobs, 'today').length,
    '7days': filterJobsByDateRange(allJobs, '7days').length,
    '3months': filterJobsByDateRange(allJobs, '3months').length,
    '6months': filterJobsByDateRange(allJobs, '6months').length,
    '1year': filterJobsByDateRange(allJobs, '1year').length
  };

  for (const [key, count] of Object.entries(countTabs)) {
    const el = document.getElementById(`history-count-${key}`);
    if (el) el.textContent = count;
  }

  // 3. Filter jobs by active selected date range
  let filteredJobs = filterJobsByDateRange(allJobs, currentHistoryRange);

  // 4. Search filter by filename or tracking token
  if (searchQuery) {
    filteredJobs = filteredJobs.filter(j =>
      (j.originalFileName || '').toLowerCase().includes(searchQuery) ||
      (j.trackingToken || '').toLowerCase().includes(searchQuery)
    );
  }

  // 5. Update header badge & subtext
  const totalBadge = document.getElementById('history-total-badge');
  if (totalBadge) totalBadge.textContent = `${filteredJobs.length} Orders`;

  const subtextEl = document.getElementById('history-filter-subtext');
  if (subtextEl) {
    const rangeNames = {
      all: 'All Time',
      today: 'Today',
      '7days': 'Last 7 Days',
      '3months': 'Last 3 Months',
      '6months': 'Last 6 Months',
      '1year': currentCycle
    };
    const activeLabel = rangeNames[currentHistoryRange] || 'Filtered';
    subtextEl.textContent = `Showing ${filteredJobs.length} orders (${activeLabel}) • Annual session basis: ${currentCycle} • Orders older than 1 year are automatically deleted`;
  }

  if (filteredJobs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted" style="padding: 2.5rem 1rem;">
          No orders found for the selected timeframe.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredJobs.map(job => `
    <tr>
      <td>
        <div class="font-medium text-main text-sm">${escapeHtml(job.originalFileName)}</div>
        <div class="text-xs text-muted">${formatBytes(job.fileSizeBytes)}</div>
      </td>
      <td>
        <span class="font-mono text-xs" style="background: var(--primary-50); padding: 2px 6px; border-radius: 4px;">
          ${job.trackingToken}
        </span>
      </td>
      <td class="text-xs">${job.pageCount} pgs &times; ${job.copies} ${job.copies > 1 ? 'copies' : 'copy'}</td>
      <td class="text-xs">${job.paperSize} &bull; ${job.colorMode === 'color' ? 'Color' : 'B&W'} &bull; ${job.duplex ? '2-Sided' : '1-Sided'}</td>
      <td class="font-semibold text-sm">${formatCurrencyINR(job.estimatedAmount || 0)}</td>
      <td class="text-xs text-muted" title="${new Date(job.createdAt || job.updatedAt).toLocaleString()}">
        ${formatTimeAgo(job.completedAt || job.updatedAt || job.createdAt)}
      </td>
      <td>${getStatusBadge(job.status)}</td>
    </tr>
  `).join('');
}

function getOrGenerateUniqueId(user) {
  const START_UID = 1000000;
  
  const userKey = (user && (user.uid || user.email)) ? (user.uid || user.email) : 'default_operator';
  const profiles = JSON.parse(localStorage.getItem('smartprint_user_profiles') || '{}');

  // 1. In-memory check (ensure non-default users don't share identical default UID)
  if (user && user.uniqueId && (userKey === 'default_operator' || String(user.uniqueId) !== '1000000')) {
    return String(user.uniqueId);
  }

  // 2. Local profile store check
  if (profiles[userKey]?.uniqueId && (userKey === 'default_operator' || String(profiles[userKey].uniqueId) !== '1000000')) {
    const existingId = String(profiles[userKey].uniqueId);
    if (user) user.uniqueId = existingId;
    return existingId;
  }

  // 3. Sequence counter starting from 1M (1,000,000) and forwarding +1 for each login/user
  let currentSeq = parseInt(localStorage.getItem('smartprint_next_uid_seq') || `${START_UID}`, 10);
  if (isNaN(currentSeq) || currentSeq < START_UID) {
    currentSeq = START_UID;
  }

  // If userKey is not the first/default user and currentSeq is 1000000, advance to ensure uniqueness
  if (currentSeq === START_UID && userKey !== 'default_operator' && Object.keys(profiles).length > 0) {
    currentSeq = START_UID + 1;
  }

  const assignedId = String(currentSeq);
  localStorage.setItem('smartprint_next_uid_seq', String(currentSeq + 1));

  if (user) user.uniqueId = assignedId;
  profiles[userKey] = {
    ...(profiles[userKey] || {}),
    uniqueId: assignedId,
    email: user?.email,
    displayName: user?.displayName
  };
  localStorage.setItem('smartprint_user_profiles', JSON.stringify(profiles));

  try {
    const raw = localStorage.getItem('smartprint_auth_session');
    if (raw) {
      const s = JSON.parse(raw);
      s.uniqueId = assignedId;
      localStorage.setItem('smartprint_auth_session', JSON.stringify(s));
    }
  } catch(e) {}

  // 4. Asynchronously query authoritative server UID assigner to guarantee cross-session uniqueness
  fetch(`/api/user/unique-id?uid=${encodeURIComponent(user?.uid || userKey)}&email=${encodeURIComponent(user?.email || '')}&displayName=${encodeURIComponent(user?.displayName || '')}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.success && data.uniqueId && data.uniqueId !== assignedId) {
        const verifiedId = String(data.uniqueId);
        if (user) user.uniqueId = verifiedId;
        profiles[userKey] = { ...(profiles[userKey] || {}), uniqueId: verifiedId };
        localStorage.setItem('smartprint_user_profiles', JSON.stringify(profiles));
        const pill = document.getElementById('profile-uid-pill');
        if (pill) pill.textContent = `UID: ${verifiedId}`;
        const disp = document.getElementById('profile-unique-id-display');
        if (disp) disp.value = verifiedId;
        const lbl = document.getElementById('permanent-qr-uid-label');
        if (lbl) lbl.textContent = verifiedId;
      }
    })
    .catch(() => {});

  return assignedId;
}

function updateProfileCompleteness(profile) {
  const fields = [
    profile.storeName || profile.name || '',
    profile.userName || '',
    profile.phone || '',
    profile.address || '',
    profile.gender || ''
  ];
  const filled = fields.filter(val => typeof val === 'string' && val.trim().length > 0).length;
  const total = 5;
  const pct = Math.round((filled / total) * 100);

  const progressBar = document.getElementById('profile-progress-bar');
  if (progressBar) progressBar.style.width = `${pct}%`;

  const countEl = document.getElementById('profile-fields-count');
  if (countEl) countEl.textContent = `${filled} of ${total} completed (${pct}%)`;

  const badgeEl = document.getElementById('profile-completeness-badge');
  if (badgeEl) {
    if (filled === total) {
      badgeEl.className = 'badge badge-completed text-xs font-semibold';
      badgeEl.textContent = 'Profile Complete (5/5)';
    } else {
      badgeEl.className = 'badge badge-under-review text-xs font-semibold';
      badgeEl.textContent = `Profile Incomplete (${filled}/${total})`;
    }
  }
}

function renderPermanentProfileQR(profile) {
  if (!profile) return;
  const qrImageEl = document.getElementById('permanent-qr-image');
  const qrUidLabel = document.getElementById('permanent-qr-uid-label');
  const qrStoreName = document.getElementById('qr-display-store-name');
  const qrUserName = document.getElementById('qr-display-user-name');
  const qrPhone = document.getElementById('qr-meta-phone');
  const qrGender = document.getElementById('qr-meta-gender');
  const profileUidPill = document.getElementById('profile-uid-pill');
  const profileUidDisplay = document.getElementById('profile-unique-id-display');
  const qrStatusEl = document.getElementById('qr-meta-status');

  const uid = String(profile.uniqueId || '1000000');
  if (qrUidLabel) qrUidLabel.textContent = uid;
  if (profileUidPill) profileUidPill.textContent = `UID: ${uid}`;
  if (profileUidDisplay) profileUidDisplay.value = uid;

  const storeName = profile.storeName || profile.name || 'Store Name Not Set';
  const userName = profile.userName || 'Operator Name Not Set';

  if (qrStoreName) qrStoreName.textContent = storeName;
  if (qrUserName) qrUserName.textContent = userName;
  if (qrPhone) qrPhone.textContent = profile.phone || '--';
  if (qrGender) qrGender.textContent = profile.gender || '--';

  // Live status badge synced with store open/closed
  if (qrStatusEl) {
    const isStoreOpen = (typeof profile.isOpen === 'boolean') ? profile.isOpen : getStoreStatus(profile.centerId || profile.publicId);
    if (isStoreOpen) {
      qrStatusEl.innerHTML = `<span class="badge badge-completed text-xs" style="display:inline-flex; align-items:center; gap:5px;"><span style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></span> Store Open</span>`;
    } else {
      qrStatusEl.innerHTML = `<span class="badge badge-under-review text-xs" style="display:inline-flex; align-items:center; gap:5px; background:rgba(239,68,68,0.15); color:#f87171; border-color:rgba(239,68,68,0.3);"><span style="width:6px; height:6px; border-radius:50%; background:#ef4444;"></span> Store Closed</span>`;
    }
  }

  // Construct structured permanent QR payload
  const qrPayload = JSON.stringify({
    type: "smartprint_user_profile",
    uid: uid,
    store: storeName,
    user: userName,
    phone: profile.phone || '',
    email: profile.email || '',
    address: profile.address || '',
    gender: profile.gender || '',
    v: 1
  });

  const publicId = profile.publicId || ('CTR-' + uid);
  const qrTarget = `${window.location.origin}/customer/?center=${encodeURIComponent(profile.uniqueId || publicId)}`;
  const normalQrDataUrl = generateNormalQrDataUrl(qrTarget, 260);
  if (qrImageEl) {
    qrImageEl.src = normalQrDataUrl;
    qrImageEl.setAttribute('data-qr-payload', qrTarget);
    qrImageEl.setAttribute('data-uid', uid);
  }

  updateProfileCompleteness(profile);
}

function populateProfileForm(center, maybeUser = null) {
  const user = maybeUser || auth.getCurrentUser() || {};
  if (!center && !user) return;
  const c = center || {};

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  };
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== undefined && val !== null ? val : '';
  };

  const uniqueId = (c.uniqueId && String(c.uniqueId) !== '1000000') 
    ? String(c.uniqueId) 
    : ((user.uniqueId && String(user.uniqueId) !== '1000000') 
        ? String(user.uniqueId) 
        : getOrGenerateUniqueId(user));

  // 1. STORE NAME
  const storeName = c.storeName || c.name || (user.displayName ? `${user.displayName}'s Center` : 'SmartPrint Center');
  setVal('profile-store-name', storeName);
  setVal('profile-name', storeName);

  // 2. USER NAME
  const userName = c.userName || user.displayName || '';
  setVal('profile-user-name', userName);

  // 3. PHONE
  const phone = c.phone || user.phone || '';
  setVal('profile-phone', phone);

  // 4. EMAIL (Directly retrieved from Google login / verified auth session)
  const authEmail = (user.email || '').trim();
  const email = authEmail || (c.email || '').trim();
  setVal('profile-email', email);

  // If email came from authenticated Google / login session, auto-save to center if missing
  if (authEmail && center && (!center.email || center.email !== authEmail)) {
    center.email = authEmail;
    stateStore.saveCenter(center);
  }

  // Display Google Verified badge and readonly styling
  const emailBadge = document.getElementById('profile-email-source-badge');
  const emailInput = document.getElementById('profile-email');
  if (authEmail) {
    if (emailBadge) {
      emailBadge.style.display = 'inline-flex';
      const isGoogle = user.authProvider === 'google' || authEmail.endsWith('@gmail.com');
      emailBadge.textContent = isGoogle ? '✓ Google Verified' : '✓ Verified Account';
    }
    if (emailInput) {
      emailInput.readOnly = true;
      emailInput.style.background = 'var(--bg-surface-subtle)';
      emailInput.title = 'Email directly linked from your authenticated login';
    }
  }

  // 5. ADDRESS
  const address = c.address || user.address || '';
  setVal('profile-address', address);

  // 6. GENDER
  const gender = c.gender || user.gender || '';
  setVal('profile-gender', gender);

  // Unique ID Display
  setVal('profile-unique-id-display', uniqueId);
  setText('profile-uid-pill', `UID: ${uniqueId}`);

  const publicId = c.publicId || (user.uid ? `CTR-${user.uid.substring(0, 6).toUpperCase()}` : 'N/A');
  setText('profile-center-id', publicId);
  const publicLink = `${window.location.origin}/customer/?center=${publicId}`;
  const customerLinkEl = document.getElementById('profile-customer-link');
  if (customerLinkEl && publicId !== 'N/A') {
    customerLinkEl.href = publicLink;
    customerLinkEl.textContent = `Open Link (${publicId}) \u2192`;
  }

  let rates = c.rates;
  if (!rates && c.centerId) {
    try {
      const r = localStorage.getItem(`smartprint_rates_${c.centerId}`);
      if (r) rates = JSON.parse(r);
    } catch (e) {}
  }
  if (!rates && user?.uid) {
    try {
      const r = localStorage.getItem(`smartprint_rates_${user.uid}`);
      if (r) rates = JSON.parse(r);
    } catch (e) {}
  }
  if (!rates) rates = {};

  setVal('rate-bw-single', rates.bwSingle !== undefined ? rates.bwSingle : 2.0);
  setVal('rate-bw-double', rates.bwDouble !== undefined ? rates.bwDouble : 3.5);
  setVal('rate-color-single', rates.colorSingle !== undefined ? rates.colorSingle : 10.0);
  setVal('rate-color-double', rates.colorDouble !== undefined ? rates.colorDouble : 18.0);

  // Restore Printer Routing Priority if saved
  let pr = c.printerRouting ? cleanPrinterRouting(c.printerRouting) : null;
  if (!pr && c.centerId) {
    try {
      const r = localStorage.getItem(`smartprint_routing_${c.centerId}`);
      if (r) pr = cleanPrinterRouting(JSON.parse(r));
    } catch (e) {}
  }
  if (!pr && user?.uid) {
    try {
      const r = localStorage.getItem(`smartprint_routing_${user.uid}`);
      if (r) pr = cleanPrinterRouting(JSON.parse(r));
    } catch (e) {}
  }
  if (pr) {
    pr = cleanPrinterRouting(pr);
    if (pr.bwPriority) {
      if (pr.bwPriority[0] && !isDemoPrinterName(pr.bwPriority[0])) setVal('seq-bw-p1', pr.bwPriority[0]);
      if (pr.bwPriority[1] && !isDemoPrinterName(pr.bwPriority[1])) setVal('seq-bw-p2', pr.bwPriority[1]);
      if (pr.bwPriority[2] && !isDemoPrinterName(pr.bwPriority[2])) setVal('seq-bw-p3', pr.bwPriority[2]);
    }
    if (pr.colorPriority) {
      if (pr.colorPriority[0] && !isDemoPrinterName(pr.colorPriority[0])) setVal('seq-color-p1', pr.colorPriority[0]);
      if (pr.colorPriority[1] && !isDemoPrinterName(pr.colorPriority[1])) setVal('seq-color-p2', pr.colorPriority[1]);
      if (pr.colorPriority[2] && !isDemoPrinterName(pr.colorPriority[2])) setVal('seq-color-p3', pr.colorPriority[2]);
    }
    if (typeof pr.autoFailover === 'boolean') {
      const failoverCheck = document.getElementById('seq-auto-failover');
      if (failoverCheck) failoverCheck.checked = pr.autoFailover;
    }
    if (typeof pr.autoDuplexMatch === 'boolean') {
      const duplexCheck = document.getElementById('seq-auto-duplex-match');
      if (duplexCheck) duplexCheck.checked = pr.autoDuplexMatch;
    }
    if (typeof updatePrioritySummaryBadge === 'function') {
      try { updatePrioritySummaryBadge(); } catch (e) {}
    }
  }

  // Render Permanent QR Code and completeness
  renderPermanentProfileQR({
    storeName,
    userName,
    phone,
    email,
    address,
    gender,
    uniqueId,
    publicId
  });

  // Sync store profile to local server registry for instant <1s QR scan resolution
  try {
    fetch('/api/store/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centerId: c.centerId || publicId,
        publicId: publicId,
        uniqueId: uniqueId,
        storeName: storeName,
        name: storeName,
        address: address,
        phone: phone,
        rates: rates
      })
    }).catch(() => {});
  } catch (e) {}
}

function renderActionButtons(job) {
  if (job.status === 'pending_confirmation') {
    return `
      <button class="btn btn-primary btn-sm action-status-btn" data-id="${job.jobId}" data-status="approved_awaiting_cash" title="Approve this print request">
        ${ICONS.check} Approve
      </button>
      <button class="btn btn-danger btn-sm action-status-btn" data-id="${job.jobId}" data-status="rejected" title="Reject print request">
        Reject
      </button>
    `;
  }
  if (job.status === 'approved_awaiting_cash') {
    return `
      <button class="btn btn-success btn-sm action-status-btn" data-id="${job.jobId}" data-status="payment_confirmed" style="background: var(--success-bg, rgba(34,197,94,0.15)); color: var(--success-text, #15803d); border: 1px solid var(--success-border, #86efac); font-weight: 600;" title="Confirm cash received at counter">
        ${ICONS.check} Confirm Cash (₹${(job.estimatedAmount || 0).toFixed(2)})
      </button>
      <button class="btn btn-danger btn-sm action-status-btn" data-id="${job.jobId}" data-status="rejected" title="Reject print request">
        Reject
      </button>
    `;
  }
  if (job.status === 'payment_confirmed' || job.status === 'queued') {
    return `
      <button class="btn btn-primary btn-sm action-print-btn" data-id="${job.jobId}">
        ${ICONS.printer} Print Now
      </button>
      <button class="btn btn-danger btn-sm action-status-btn" data-id="${job.jobId}" data-status="rejected">
        Reject
      </button>
    `;
  }
  if (job.status === 'submitted') {
    return `
      <button class="btn btn-secondary btn-sm action-status-btn" data-id="${job.jobId}" data-status="approved_awaiting_cash">
        Approve
      </button>
      <button class="btn btn-primary btn-sm action-print-btn" data-id="${job.jobId}">
        ${ICONS.printer} Print Now
      </button>
    `;
  }
  if (job.status === 'under_review') {
    return `
      <button class="btn btn-primary btn-sm action-print-btn" data-id="${job.jobId}">
        ${ICONS.printer} Print Now
      </button>
      <button class="btn btn-danger btn-sm action-status-btn" data-id="${job.jobId}" data-status="rejected">
        Reject
      </button>
    `;
  }
  if (job.status === 'printing') {
    return `
      <button class="btn btn-secondary btn-sm action-status-btn" data-id="${job.jobId}" data-status="completed" style="background: var(--success-bg); color: var(--success-text); border-color: var(--success-border);">
        ${ICONS.check} Done
      </button>
    `;
  }
  return `
    <button class="btn btn-ghost btn-sm" onclick="window.alert('Document details: ${escapeHtml(job.originalFileName)}')">
      ${ICONS.eye}
    </button>
  `;
}

function attachActionListeners() {
  document.querySelectorAll('.action-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-id');
      const newStatus = btn.getAttribute('data-status');
      try {
        const user = auth.getCurrentUser();
        const ownerCenterId = user?.centerId;
        stateStore.updateJobStatus(jobId, newStatus, user?.uid || 'owner', ownerCenterId);
        showToast(`Job status updated to ${newStatus}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.action-print-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-id');
      try {
        const job = stateStore.getJob(jobId);
        if (!job) throw new Error("Job not found");

        const user = auth.getCurrentUser();
        const centerId = user?.centerId || stateStore.getCenters()[0]?.centerId;

        // Strict Tenant Isolation: verify job center matches current authenticated owner's center
        if (job.centerId && centerId && job.centerId !== centerId) {
          throw new Error("PERMISSION_DENIED: Tenant isolation violation. Cannot print an order belonging to another store.");
        }

        // Cash payment workflow rule: Cash orders must be confirmed before printing can be triggered
        if (job.paymentMethod === 'cash') {
          if (job.status === 'pending_confirmation') {
            throw new Error("Cannot print: Order is pending owner approval.");
          }
          if (job.status === 'approved_awaiting_cash') {
            throw new Error("Cannot print: Cash collection must be confirmed at counter first.");
          }
        }

        const centerObj = centerId ? stateStore.getCenter(centerId) : null;
        const isColor = job?.printOptions?.colorMode === 'color' || job?.colorMode === 'color';

        const routing = centerObj?.printerRouting || {};
        const priorityList = isColor
          ? (routing.colorPriority || [])
          : (routing.bwPriority || []);
        const autoFailover = routing.autoFailover !== false;

        const p1 = priorityList[0];
        const p2 = priorityList[1];
        const p3 = priorityList[2];

        // Check if printer is available: connected, online, and not currently printing another job
        const allJobs = stateStore.getJobs(centerId);
        const isPrinterAvailable = (pName) => {
          if (!pName || pName === 'None' || pName.includes('No printer') || pName.includes('Scanning') || isDemoPrinterName(pName)) return false;
          if (currentDetectedPrinters && currentDetectedPrinters.length > 0) {
            const dev = currentDetectedPrinters.find(d => d.name === pName);
            if (!dev || dev.isOffline || dev.status === 'Offline') return false;
          }
          const isBusy = allJobs.some(j => j.jobId !== jobId && j.status === 'printing' && j.routedPrinter === pName);
          return !isBusy;
        };

        let targetPrinter = p1;
        let priorityLevel = 1;
        let isFailover = false;
        let failoverMsg = '';

        if (p1 && p1 !== 'None' && isPrinterAvailable(p1)) {
          // Priority 1 is ready and available
          targetPrinter = p1;
          priorityLevel = 1;
          isFailover = false;
        } else if (autoFailover && p2 && p2 !== 'None' && isPrinterAvailable(p2)) {
          // Priority 1 is busy/unavailable -> Auto-failover to Priority 2
          targetPrinter = p2;
          priorityLevel = 2;
          isFailover = true;
          failoverMsg = `Priority 1 Printer (${p1 || 'Primary'}) is busy/unavailable. Auto-failing over to Priority 2: ${p2}...`;
        } else if (autoFailover && p3 && p3 !== 'None' && isPrinterAvailable(p3)) {
          // Priority 1 & 2 unavailable -> Auto-failover to Priority 3
          targetPrinter = p3;
          priorityLevel = 3;
          isFailover = true;
          failoverMsg = `Priority 1 & 2 unavailable. Auto-failing over to Priority 3: ${p3}...`;
        } else if (autoFailover && priorityList && priorityList.length > 3) {
          // Check beyond Priority 3 for multiple printers
          for (let pIdx = 3; pIdx < priorityList.length; pIdx++) {
            const pCandidate = priorityList[pIdx];
            if (pCandidate && pCandidate !== 'None' && isPrinterAvailable(pCandidate)) {
              targetPrinter = pCandidate;
              priorityLevel = pIdx + 1;
              isFailover = true;
              failoverMsg = `Higher priority printers unavailable. Auto-failing over to Priority ${priorityLevel}: ${pCandidate}...`;
              break;
            }
          }
        }

        if (!targetPrinter || isDemoPrinterName(targetPrinter)) {
          // Fallback if none in priority sequence available
          const validDetected = (currentDetectedPrinters || []).filter(p => !isDemoPrinterName(p.name));
          targetPrinter = (!isDemoPrinterName(p1) ? p1 : null) || (validDetected[0]?.name) || (isColor ? 'Connected Color Printer' : 'Connected B&W Printer');
          priorityLevel = 1;
          isFailover = false;
        }

        stateStore.updateJobStatus(jobId, 'printing');
        const updatedJob = stateStore.getJob(jobId);
        if (updatedJob) {
          updatedJob.routedPrinter = targetPrinter;
          updatedJob.priorityLevel = priorityLevel;
          updatedJob.isFailover = isFailover;
          stateStore.saveJob(updatedJob);
        }

        if (isFailover) {
          showToast(failoverMsg, 'warning');
        } else {
          showToast(`Routing to Priority 1 Printer: ${targetPrinter}...`, 'info');
        }
        
        // Simulate hardware print completion after 3 seconds
        setTimeout(() => {
          try {
            stateStore.updateJobStatus(jobId, 'completed');
            showToast(`Print job completed successfully on ${targetPrinter}!`, 'success');
          } catch(e) {}
        }, 3000);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function updateTabBadges(centerId) {
  const jobs = stateStore.getJobs(centerId);
  const counts = {
    all: jobs.length,
    submitted: jobs.filter(j => j.status === 'submitted' || j.status === 'pending_confirmation').length,
    under_review: jobs.filter(j => j.status === 'under_review' || j.status === 'approved_awaiting_cash' || j.status === 'payment_confirmed' || j.status === 'queued').length,
    printing: jobs.filter(j => j.status === 'printing').length,
    completed: jobs.filter(j => j.status === 'completed').length
  };

  for (const [key, val] of Object.entries(counts)) {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = val;
  }
}

function populateQRModal(center) {
  if (!center) return;
  const qrContainer = document.getElementById('qr-modal-content');
  if (!qrContainer) return;

  const publicUrl = `${window.location.origin}/customer/?center=${center.publicId}`;

  qrContainer.innerHTML = `
    <div class="text-center" style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
      <div style="background: white; padding: 1.5rem; border-radius: 16px; border: 2px dashed var(--primary-300); box-shadow: var(--shadow-md);">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}" alt="Customer QR Code" style="width: 200px; height: 200px; display: block;" />
      </div>
      <div>
        <h3 style="margin-bottom: 0.25rem;">${escapeHtml(center.name)}</h3>
        <p class="text-sm text-muted">Center ID: <strong>${center.publicId}</strong></p>
      </div>
      <div class="flex items-center gap-2 w-full">
        <input type="text" class="form-input text-xs" readonly value="${escapeHtml(publicUrl)}" id="qr-public-url-input" />
        <button class="btn btn-secondary btn-sm" id="btn-copy-qr-link">
          ${ICONS.copy}
        </button>
      </div>
      <button class="btn btn-primary w-full" onclick="window.print()">
        ${ICONS.printer} Print Store QR Standee
      </button>
    </div>
  `;

  document.getElementById('btn-copy-qr-link')?.addEventListener('click', () => {
    copyToClipboard(publicUrl, "Public submission link copied!");
  });
}

export function isCollectedPayment(job) {
  if (!job) return false;
  return job.status === 'completed' || job.paymentStatus === 'paid';
}

export function renderAnalytics(centerId) {
  return renderAnalyticsSection(centerId);
}

export function exportAnalyticsToCSV(centerId) {
  const user = auth.getCurrentUser();
  const effectiveCenterId = centerId || user?.centerId || stateStore.getCenters()[0]?.centerId;
  const allJobs = stateStore.getJobs(effectiveCenterId);
  const filteredJobs = filterJobsByDateRange(allJobs, currentAnalyticsRange, currentAnalyticsCustomStart, currentAnalyticsCustomEnd);

  if (!filteredJobs || filteredJobs.length === 0) {
    showToast("No records available to export for the selected period", "info");
    return;
  }

  // Formula injection protection: sanitize untrusted text cells starting with =, +, -, @, \t, \r
  const sanitizeCell = (val) => {
    if (val === null || val === undefined) return '""';
    let str = String(val).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str}"`;
  };

  const headers = [
    "Order Reference",
    "Tracking Token",
    "Submitted Date/Time",
    "Completed Date/Time",
    "Print Type",
    "Sides",
    "Paper Size",
    "Copies",
    "Document Pages",
    "Total Billable Sheets",
    "Quoted Total (INR)",
    "Confirmed Payment (INR)",
    "Payment Status",
    "Payment Method",
    "Job Status",
    "Assigned Printer"
  ];

  const rows = filteredJobs.map(j => {
    const isCompleted = j.status === 'completed';
    const isPaid = isCollectedPayment(j);
    const paidAmount = isPaid ? (Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0) : 0;
    const quotedAmount = Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0;
    const totalPages = (j.pageCount || 1) * (j.copies || 1);
    const billableSheets = j.duplex ? Math.ceil(totalPages / 2) : totalPages;

    return [
      sanitizeCell(j.jobId),
      sanitizeCell(j.trackingToken || ''),
      sanitizeCell(j.createdAt || ''),
      sanitizeCell(j.completedAt || ''),
      sanitizeCell(j.colorMode === 'color' ? 'Color' : 'Black & White'),
      sanitizeCell(j.duplex ? '2-Sided (Duplex)' : '1-Sided (Single)'),
      sanitizeCell(j.paperSize || 'A4'),
      j.copies || 1,
      j.pageCount || 1,
      billableSheets,
      quotedAmount.toFixed(2),
      paidAmount.toFixed(2),
      sanitizeCell(j.paymentStatus || 'pending'),
      sanitizeCell(j.paymentMethod || 'cash'),
      sanitizeCell(j.status),
      sanitizeCell(j.assignedPrinter || 'Store Default')
    ].join(',');
  });

  const csvContent = "\uFEFF" + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `smartprint_analytics_${effectiveCenterId || 'store'}_${currentAnalyticsRange}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${filteredJobs.length} orders to CSV successfully!`, "success");
}

export function renderAnalyticsSection(centerId) {
  const container = document.getElementById('analytics-content-view') || document.getElementById('analytics-content-container');
  if (!container) return;

  const user = auth.getCurrentUser();
  const effectiveCenterId = centerId || user?.centerId || stateStore.getCenters()[0]?.centerId;
  const center = stateStore.getCenter(effectiveCenterId) || {};
  const allJobs = stateStore.getJobs(effectiveCenterId);
  const currentCycle = getYearCycle(new Date());

  // Dynamic Year cycle label in Analytics filter tab
  const yearTabLabel = document.getElementById('analytics-year-tab-label');
  if (yearTabLabel) yearTabLabel.textContent = currentCycle;

  // Filter jobs for selected analytics range
  const filteredJobs = filterJobsByDateRange(allJobs, currentAnalyticsRange, currentAnalyticsCustomStart, currentAnalyticsCustomEnd);

  // Range Display Names
  const rangeNames = {
    all: 'All Time',
    today: 'Today',
    yesterday: 'Yesterday',
    '7days': 'Last 7 Days',
    '30days': 'Last 30 Days',
    this_month: 'This Month',
    prev_month: 'Previous Month',
    '3months': 'Last 3 Months',
    '6months': 'Last 6 Months',
    '1year': `Annual Cycle (${currentCycle})`,
    custom: `Custom Range (${currentAnalyticsCustomStart || 'Start'} to ${currentAnalyticsCustomEnd || 'End'})`
  };
  const activeLabel = rangeNames[currentAnalyticsRange] || 'Custom Range';

  // Update badge and subtext
  const totalBadge = document.getElementById('analytics-total-badge');
  if (totalBadge) totalBadge.textContent = `${filteredJobs.length} Orders in Period`;

  const subtextEl = document.getElementById('analytics-filter-subtext');
  if (subtextEl) {
    subtextEl.textContent = `Showing analytics for: ${activeLabel} • ${filteredJobs.length} orders in period • Real-time verified store data`;
  }

  // 1. Metric Calculations
  const completedJobs = filteredJobs.filter(j => j.status === 'completed');
  const liveBacklogJobs = allJobs.filter(j => ['pending_confirmation', 'approved_awaiting_cash', 'payment_confirmed', 'queued', 'under_review', 'processing', 'printing'].includes(j.status));
  const approvedAwaitingCashJobs = filteredJobs.filter(j => j.status === 'approved_awaiting_cash');
  const rejectedJobs = filteredJobs.filter(j => j.status === 'rejected' || j.status === 'failed');

  // Revenue rules: Confirmed cash collections during period only
  const totalRevenue = completedJobs.reduce((sum, j) => sum + (Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0), 0);
  const outstandingApprovedPaise = approvedAwaitingCashJobs.reduce((sum, j) => sum + (Number(j.amountPaise) || (j.estimatedAmount ? j.estimatedAmount * 100 : 0)), 0);
  const outstandingAmount = outstandingApprovedPaise / 100;
  const grossPotentialRevenue = totalRevenue + outstandingAmount;

  const totalPages = completedJobs.reduce((sum, j) => sum + ((j.pageCount || 1) * (j.copies || 1)), 0);
  const avgOrderValue = completedJobs.length > 0 ? (totalRevenue / completedJobs.length) : 0;
  const avgPagesPerOrder = completedJobs.length > 0 ? (totalPages / completedJobs.length).toFixed(1) : '0';

  const completionRate = filteredJobs.length > 0 ? Math.round((completedJobs.length / filteredJobs.length) * 100) : 0;
  const rejectionRate = filteredJobs.length > 0 ? Math.round((rejectedJobs.length / filteredJobs.length) * 100) : 0;
  const pendingRate = Math.max(0, 100 - completionRate - rejectionRate);

  // If no records in range, render informative empty state
  if (filteredJobs.length === 0) {
    container.innerHTML = `
      <div class="glass-panel text-center" style="padding: 3.5rem 1.5rem; margin-bottom: 2rem;">
        <div class="empty-state-icon" style="font-size: 2.5rem; margin-bottom: 0.75rem;">📊</div>
        <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem; color: var(--text-main);">No Orders Found for ${escapeHtml(activeLabel)}</h3>
        <p class="text-sm text-muted" style="max-width: 440px; margin: 0 auto 1.25rem;">
          There is no print activity recorded for this timeframe. Select another filter preset or switch to All Time analytics.
        </p>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-analytics-reset-filter">
          Switch to All Time
        </button>
      </div>
    `;

    document.getElementById('btn-analytics-reset-filter')?.addEventListener('click', () => {
      document.querySelectorAll('.analytics-filter-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-range') === 'all');
      });
      currentAnalyticsRange = 'all';
      renderAnalyticsSection(centerId);
    });
    return;
  }

  // 2. Comparisons & Segmented Metrics
  const monoJobs = filteredJobs.filter(j => j.colorMode !== 'color');
  const colorJobs = filteredJobs.filter(j => j.colorMode === 'color');
  const monoPercent = filteredJobs.length > 0 ? Math.round((monoJobs.length / filteredJobs.length) * 100) : 0;
  const colorPercent = 100 - monoPercent;
  const monoRevenue = monoJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0), 0);
  const colorRevenue = colorJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0), 0);
  const monoPages = monoJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + ((j.pageCount || 1) * (j.copies || 1)), 0);
  const colorPages = colorJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + ((j.pageCount || 1) * (j.copies || 1)), 0);

  const duplexJobs = filteredJobs.filter(j => Boolean(j.duplex));
  const singleJobs = filteredJobs.filter(j => !j.duplex);
  const duplexPercent = filteredJobs.length > 0 ? Math.round((duplexJobs.length / filteredJobs.length) * 100) : 0;
  const singlePercent = 100 - duplexPercent;
  const sheetsSaved = duplexJobs.reduce((sum, j) => sum + Math.max(1, Math.floor(((j.pageCount || 1) * (j.copies || 1)) / 2)), 0);

  // Paper Sizes Supported Breakdown
  const sizeMap = new Map();
  filteredJobs.forEach(j => {
    const size = (j.paperSize || 'A4').toUpperCase();
    if (!sizeMap.has(size)) {
      sizeMap.set(size, { size, count: 0, completedCount: 0, pages: 0, revenue: 0 });
    }
    const s = sizeMap.get(size);
    s.count += 1;
    if (j.status === 'completed') {
      s.completedCount += 1;
      s.pages += ((j.pageCount || 1) * (j.copies || 1));
      s.revenue += Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0;
    }
  });
  const paperSizesList = Array.from(sizeMap.values()).sort((a, b) => b.count - a.count);

  // Print Service Combinations (B&W Single, B&W Duplex, Color Single, Color Duplex)
  const serviceStats = {
    bwSingle: { label: 'B&W Single-Sided', jobs: 0, revenue: 0, pages: 0 },
    bwDouble: { label: 'B&W Double-Sided', jobs: 0, revenue: 0, pages: 0 },
    colorSingle: { label: 'Color Single-Sided', jobs: 0, revenue: 0, pages: 0 },
    colorDouble: { label: 'Color Double-Sided', jobs: 0, revenue: 0, pages: 0 }
  };
  completedJobs.forEach(j => {
    const isC = j.colorMode === 'color';
    const isD = Boolean(j.duplex);
    const key = isC ? (isD ? 'colorDouble' : 'colorSingle') : (isD ? 'bwDouble' : 'bwSingle');
    const pgs = (j.pageCount || 1) * (j.copies || 1);
    const rev = Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0;
    serviceStats[key].jobs += 1;
    serviceStats[key].pages += pgs;
    serviceStats[key].revenue += rev;
  });

  // Daily Timeline Buckets for Line Chart & Bar Volume Chart
  const dayBuckets = new Map();
  filteredJobs.forEach(job => {
    const rawDate = job.createdAt || job.updatedAt || new Date().toISOString();
    const d = new Date(rawDate);
    const dateKey = isNaN(d.getTime()) ? 'Recent' : d.toISOString().split('T')[0];
    const isCompleted = job.status === 'completed';
    const isRejected = job.status === 'rejected' || job.status === 'failed';

    if (!dayBuckets.has(dateKey)) {
      dayBuckets.set(dateKey, {
        dateKey,
        label: !isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'Recent',
        totalOrders: 0,
        completedOrders: 0,
        rejectedOrders: 0,
        revenue: 0,
        pages: 0,
        colorCount: 0,
        monoCount: 0,
        duplexCount: 0
      });
    }

    const b = dayBuckets.get(dateKey);
    b.totalOrders += 1;
    if (isCompleted) {
      b.completedOrders += 1;
      b.revenue += Number(job.amountPaise ? job.amountPaise / 100 : job.estimatedAmount) || 0;
      b.pages += ((job.pageCount || 1) * (job.copies || 1));
    }
    if (isRejected) {
      b.rejectedOrders += 1;
    }
    if (job.colorMode === 'color') {
      b.colorCount += 1;
    } else {
      b.monoCount += 1;
    }
    if (job.duplex) {
      b.duplexCount += 1;
    }
  });

  const sortedDays = Array.from(dayBuckets.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const maxRevenueDay = Math.max(...sortedDays.map(d => d.revenue), 100);
  const maxOrdersDay = Math.max(...sortedDays.map(d => d.totalOrders), 5);

  // SVG Dimensions for Chart A (Revenue Line Chart)
  const svgWidth = 680;
  const svgHeight = 220;
  const chartPadLeft = 50;
  const chartPadRight = 20;
  const chartPadTop = 25;
  const chartPadBottom = 35;
  const plotWidth = svgWidth - chartPadLeft - chartPadRight;
  const plotHeight = svgHeight - chartPadTop - chartPadBottom;

  // Build Line Chart Coordinates
  const pointCount = Math.max(sortedDays.length, 1);
  const stepX = pointCount > 1 ? plotWidth / (pointCount - 1) : plotWidth / 2;
  const linePoints = sortedDays.map((d, idx) => {
    const x = pointCount > 1 ? chartPadLeft + (idx * stepX) : chartPadLeft + plotWidth / 2;
    const yRatio = maxRevenueDay > 0 ? (d.revenue / maxRevenueDay) : 0;
    const y = chartPadTop + plotHeight * (1 - yRatio);
    return { x, y, day: d };
  });

  const polylineStr = linePoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPathStr = linePoints.length > 0 
    ? `M ${linePoints[0].x.toFixed(1)},${(chartPadTop + plotHeight).toFixed(1)} ` +
      linePoints.map(p => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
      ` L ${linePoints[linePoints.length - 1].x.toFixed(1)},${(chartPadTop + plotHeight).toFixed(1)} Z`
    : '';

  // Chart B: Grouped Volume Bar Markup
  const colWidth = plotWidth / Math.max(sortedDays.length, 1);
  const singleBarW = Math.min(Math.max(colWidth * 0.25, 4), 16);
  const volumeBarsMarkup = sortedDays.map((day, idx) => {
    const groupX = chartPadLeft + (idx * colWidth) + (colWidth / 2);
    const subH = maxOrdersDay > 0 ? (day.totalOrders / maxOrdersDay) * plotHeight : 2;
    const compH = maxOrdersDay > 0 ? (day.completedOrders / maxOrdersDay) * plotHeight : 2;
    const rejH = maxOrdersDay > 0 ? (day.rejectedOrders / maxOrdersDay) * plotHeight : 2;

    const subY = chartPadTop + (plotHeight - Math.max(subH, 2));
    const compY = chartPadTop + (plotHeight - Math.max(compH, 2));
    const rejY = chartPadTop + (plotHeight - Math.max(rejH, 2));

    return `
      <g class="chart-volume-group">
        <!-- Submitted -->
        <rect x="${(groupX - singleBarW * 1.6).toFixed(1)}" y="${subY.toFixed(1)}" width="${singleBarW.toFixed(1)}" height="${Math.max(subH, 2).toFixed(1)}" rx="2" fill="#8b5cf6">
          <title>${escapeHtml(day.label)}: ${day.totalOrders} total submitted</title>
        </rect>
        <!-- Completed -->
        <rect x="${(groupX - singleBarW * 0.4).toFixed(1)}" y="${compY.toFixed(1)}" width="${singleBarW.toFixed(1)}" height="${Math.max(compH, 2).toFixed(1)}" rx="2" fill="#10b981">
          <title>${escapeHtml(day.label)}: ${day.completedOrders} completed</title>
        </rect>
        <!-- Rejected -->
        <rect x="${(groupX + singleBarW * 0.8).toFixed(1)}" y="${rejY.toFixed(1)}" width="${singleBarW.toFixed(1)}" height="${Math.max(rejH, 2).toFixed(1)}" rx="2" fill="#ef4444">
          <title>${escapeHtml(day.label)}: ${day.rejectedOrders} rejected</title>
        </rect>
        <text class="chart-axis-text" x="${groupX.toFixed(1)}" y="${(svgHeight - 12).toFixed(1)}" text-anchor="middle" font-size="10">
          ${escapeHtml(day.label)}
        </text>
      </g>
    `;
  }).join('');

  // Chart C: Job Status Distribution (Donut Calculation)
  const statusCounts = {
    pending_confirmation: allJobs.filter(j => j.status === 'pending_confirmation' || j.status === 'submitted').length,
    approved_awaiting_cash: allJobs.filter(j => j.status === 'approved_awaiting_cash').length,
    payment_confirmed_queued: allJobs.filter(j => j.status === 'payment_confirmed' || j.status === 'queued' || j.status === 'under_review').length,
    printing: allJobs.filter(j => j.status === 'printing').length,
    completed: allJobs.filter(j => j.status === 'completed').length,
    rejected_failed: allJobs.filter(j => j.status === 'rejected' || j.status === 'failed' || j.status === 'cancelled').length
  };
  const totalStatusJobs = Math.max(Object.values(statusCounts).reduce((a, b) => a + b, 0), 1);

  // Donut Arc generator
  const donutRadius = 55;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let strokeOffset = 0;
  const donutColors = {
    pending_confirmation: '#f59e0b',
    approved_awaiting_cash: '#6366f1',
    payment_confirmed_queued: '#3b82f6',
    printing: '#8b5cf6',
    completed: '#10b981',
    rejected_failed: '#ef4444'
  };
  const donutSlices = Object.entries(statusCounts).map(([key, count]) => {
    const fraction = count / totalStatusJobs;
    const strokeDash = fraction * donutCircumference;
    const offset = strokeOffset;
    strokeOffset -= strokeDash;
    return {
      key,
      count,
      percent: Math.round(fraction * 100),
      strokeDash: `${strokeDash.toFixed(2)} ${donutCircumference.toFixed(2)}`,
      offset: offset.toFixed(2),
      color: donutColors[key]
    };
  });

  // Chart G: Peak Hours & Days Breakdown
  const shiftCounts = { morning: 0, midday: 0, evening: 0, night: 0 };
  const dayOfWeekCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  filteredJobs.forEach(j => {
    const d = new Date(j.createdAt || j.updatedAt || 0);
    if (!isNaN(d.getTime())) {
      const hr = d.getHours();
      if (hr >= 8 && hr < 12) shiftCounts.morning++;
      else if (hr >= 12 && hr < 16) shiftCounts.midday++;
      else if (hr >= 16 && hr < 20) shiftCounts.evening++;
      else shiftCounts.night++;

      const dayName = dayNames[d.getDay()];
      if (dayOfWeekCounts[dayName] !== undefined) {
        dayOfWeekCounts[dayName]++;
      }
    }
  });

  // Printer Performance
  const routing = center.printerRouting || { bwPriority: [], colorPriority: [] };
  const connectedPrinters = Array.from(new Set([
    ...(routing.bwPriority || []),
    ...(routing.colorPriority || []),
    ...(currentDetectedPrinters.map(p => p.name))
  ])).filter(p => p && p !== 'None');

  // Table filtering & pagination logic
  let tableFiltered = filteredJobs.slice();
  if (currentAnalyticsTableStatus && currentAnalyticsTableStatus !== 'all') {
    tableFiltered = tableFiltered.filter(j => j.status === currentAnalyticsTableStatus);
  }
  if (currentAnalyticsTableSearch) {
    const query = currentAnalyticsTableSearch.toLowerCase().trim();
    tableFiltered = tableFiltered.filter(j => 
      (j.jobId && j.jobId.toLowerCase().includes(query)) ||
      (j.trackingToken && j.trackingToken.toLowerCase().includes(query)) ||
      (j.paperSize && j.paperSize.toLowerCase().includes(query)) ||
      (j.customerNote && j.customerNote.toLowerCase().includes(query))
    );
  }

  const PAGE_SIZE = 10;
  const totalPagesCount = Math.max(1, Math.ceil(tableFiltered.length / PAGE_SIZE));
  if (currentAnalyticsTablePage > totalPagesCount) currentAnalyticsTablePage = totalPagesCount;
  const pageStart = (currentAnalyticsTablePage - 1) * PAGE_SIZE;
  const pagedRecords = tableFiltered.slice(pageStart, pageStart + PAGE_SIZE);

  // Render HTML Structure
  container.innerHTML = `
    <!-- A. KPIs Overview Grid (8 Cards) -->
    <div class="analytics-kpi-grid">
      <!-- 1. Collected Revenue -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Collected Revenue (Total Revenue)
        </div>
        <div class="analytics-kpi-value" style="color: var(--primary-600);">${formatCurrencyINR(totalRevenue)}</div>
        <div class="analytics-kpi-subtext">
          ${completedJobs.length} paid completions &bull; Net verified collections
        </div>
      </div>

      <!-- 2. Total Orders -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
          Total Orders
        </div>
        <div class="analytics-kpi-value">${filteredJobs.length}</div>
        <div class="analytics-kpi-subtext">
          Unique orders created in period
        </div>
      </div>

      <!-- 3. Completed Jobs -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Completed Jobs
        </div>
        <div class="analytics-kpi-value" style="color: #10b981;">${completedJobs.length}</div>
        <div class="analytics-kpi-subtext">
          ${completionRate}% overall fulfillment success
        </div>
      </div>

      <!-- 4. Pending Jobs (Live Backlog) -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Pending Jobs
        </div>
        <div class="analytics-kpi-value" style="color: #f59e0b;">${liveBacklogJobs.length}</div>
        <div class="analytics-kpi-subtext">
          Live actionable backlog across store
        </div>
      </div>

      <!-- 5. Billable Pages -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Billable Pages (Printed)
        </div>
        <div class="analytics-kpi-value">${totalPages.toLocaleString()}</div>
        <div class="analytics-kpi-subtext">
          Avg ${avgPagesPerOrder} pages per completed job
        </div>
      </div>

      <!-- 6. Average Order Value -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Average Order Value
        </div>
        <div class="analytics-kpi-value">${formatCurrencyINR(avgOrderValue)}</div>
        <div class="analytics-kpi-subtext">
          Across completed cash orders
        </div>
      </div>

      <!-- 7. Outstanding Approved Amount -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Outstanding Approved
        </div>
        <div class="analytics-kpi-value" style="color: #6366f1;">${formatCurrencyINR(outstandingAmount)}</div>
        <div class="analytics-kpi-subtext">
          ${approvedAwaitingCashJobs.length} orders approved awaiting cash
        </div>
      </div>

      <!-- 8. Failed / Rejected Jobs -->
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          Failed & Rejected Jobs
        </div>
        <div class="analytics-kpi-value" style="color: #ef4444;">${rejectedJobs.length}</div>
        <div class="analytics-kpi-subtext">
          ${rejectionRate}% rejection / cancellation rate
        </div>
      </div>
    </div>

    <!-- B. Charts Grid (6 Visual Charts) -->
    <div class="analytics-charts-grid">
      <!-- Chart A: Revenue Trend (Smooth Line & Gradient Area) -->
      <div class="analytics-chart-card chart-revenue-trend">
        <div class="analytics-chart-top">
          <div>
            <div class="analytics-chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              Revenue Trend (Confirmed Collections)
            </div>
            <div class="analytics-chart-desc">Confirmed net cash collections grouped by payment/completion date</div>
          </div>
          <span class="badge" style="background: var(--primary-100); color: var(--primary-800); font-weight: 600; font-size: 0.75rem;">
            Peak Day: ₹${Math.round(maxRevenueDay)}
          </span>
        </div>

        <div class="chart-svg-wrapper">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; overflow: visible;">
            <defs>
              <linearGradient id="revenueLineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.45" />
                <stop offset="100%" stop-color="#6366f1" stop-opacity="0.02" />
              </linearGradient>
            </defs>

            <!-- Grid Lines -->
            <line x1="${chartPadLeft}" y1="${(svgHeight - chartPadBottom).toFixed(1)}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${(svgHeight - chartPadBottom).toFixed(1)}" stroke="var(--border-subtle)" stroke-width="1" />
            <line x1="${chartPadLeft}" y1="${(chartPadTop + plotHeight * 0.5).toFixed(1)}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${(chartPadTop + plotHeight * 0.5).toFixed(1)}" class="chart-grid-line" />
            <line x1="${chartPadLeft}" y1="${chartPadTop}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${chartPadTop}" class="chart-grid-line" />

            <!-- Y-Axis Labels -->
            <text x="${chartPadLeft - 8}" y="${(svgHeight - chartPadBottom).toFixed(1)}" text-anchor="end" class="chart-axis-text">₹0</text>
            <text x="${chartPadLeft - 8}" y="${(chartPadTop + plotHeight * 0.5 + 4).toFixed(1)}" text-anchor="end" class="chart-axis-text">₹${Math.round(maxRevenueDay / 2)}</text>
            <text x="${chartPadLeft - 8}" y="${chartPadTop + 4}" text-anchor="end" class="chart-axis-text">₹${Math.round(maxRevenueDay)}</text>

            <!-- Area & Line Path -->
            ${areaPathStr ? `<path d="${areaPathStr}" fill="url(#revenueLineGrad)" />` : ''}
            ${linePoints.length > 1 ? `<polyline points="${polylineStr}" fill="none" stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}

            <!-- Data Dots -->
            ${linePoints.map(p => `
              <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#7c3aed" stroke="#ffffff" stroke-width="2">
                <title>${escapeHtml(p.day.label)} (${escapeHtml(p.day.dateKey)}): ₹${p.day.revenue.toFixed(2)} (${p.day.completedOrders} completed)</title>
              </circle>
              <text class="chart-axis-text" x="${p.x.toFixed(1)}" y="${(svgHeight - 12).toFixed(1)}" text-anchor="middle">
                ${escapeHtml(p.day.label)}
              </text>
            `).join('')}
          </svg>
        </div>
      </div>

      <!-- Chart B: Order Volume Trend (Grouped Bars) -->
      <div class="analytics-chart-card chart-volume-trend">
        <div class="analytics-chart-top">
          <div>
            <div class="analytics-chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              Order Volume Trend
            </div>
            <div class="analytics-chart-desc">Unique submitted, completed, and rejected orders per day</div>
          </div>
          <div class="flex items-center gap-2" style="font-size: 0.75rem;">
            <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; background: #8b5cf6; border-radius: 2px;"></span>Submitted</span>
            <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; background: #10b981; border-radius: 2px;"></span>Completed</span>
            <span style="display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; background: #ef4444; border-radius: 2px;"></span>Rejected</span>
          </div>
        </div>

        <div class="chart-svg-wrapper">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; overflow: visible;">
            <!-- Axis & Grid -->
            <line x1="${chartPadLeft}" y1="${(svgHeight - chartPadBottom).toFixed(1)}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${(svgHeight - chartPadBottom).toFixed(1)}" stroke="var(--border-subtle)" stroke-width="1" />
            <line x1="${chartPadLeft}" y1="${(chartPadTop + plotHeight * 0.5).toFixed(1)}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${(chartPadTop + plotHeight * 0.5).toFixed(1)}" class="chart-grid-line" />
            <line x1="${chartPadLeft}" y1="${chartPadTop}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${chartPadTop}" class="chart-grid-line" />

            <text x="${chartPadLeft - 8}" y="${(svgHeight - chartPadBottom).toFixed(1)}" text-anchor="end" class="chart-axis-text">0</text>
            <text x="${chartPadLeft - 8}" y="${(chartPadTop + plotHeight * 0.5 + 4).toFixed(1)}" text-anchor="end" class="chart-axis-text">${Math.round(maxOrdersDay / 2)}</text>
            <text x="${chartPadLeft - 8}" y="${chartPadTop + 4}" text-anchor="end" class="chart-axis-text">${maxOrdersDay}</text>

            <!-- Bars -->
            ${volumeBarsMarkup}
          </svg>
        </div>
      </div>

      <!-- Chart C: Job Status Distribution (Donut Chart) -->
      <div class="analytics-chart-card chart-status-donut">
        <div class="analytics-chart-top">
          <div>
            <div class="analytics-chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>
              Job Status Distribution
            </div>
            <div class="analytics-chart-desc">Live current store state across all lifecycle transitions</div>
          </div>
          <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #059669; font-size: 0.75rem;">
            ${allJobs.length} Total Store Records
          </span>
        </div>

        <div class="donut-layout">
          <div class="donut-svg-box">
            <svg viewBox="0 0 140 140" style="transform: rotate(-90deg); width: 100%; height: 100%;">
              <!-- Background circle -->
              <circle cx="70" cy="70" r="${donutRadius}" fill="none" stroke="var(--bg-surface-subtle)" stroke-width="16" />
              <!-- Slices -->
              ${donutSlices.map(s => `
                <circle cx="70" cy="70" r="${donutRadius}" fill="none" stroke="${s.color}" stroke-width="16"
                        stroke-dasharray="${s.strokeDash}" stroke-dashoffset="${s.offset}" />
              `).join('')}
            </svg>
            <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
              <span style="font-size: 1.35rem; font-weight: 800; color: var(--text-main);">${allJobs.length}</span>
              <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600;">ACTIVE JOBS</span>
            </div>
          </div>

          <div class="donut-legend">
            <div class="donut-legend-item">
              <span class="flex items-center gap-2"><span class="donut-legend-color" style="background: #f59e0b;"></span>Pending Confirmation</span>
              <strong>${statusCounts.pending_confirmation}</strong>
            </div>
            <div class="donut-legend-item">
              <span class="flex items-center gap-2"><span class="donut-legend-color" style="background: #6366f1;"></span>Approved Awaiting Cash</span>
              <strong>${statusCounts.approved_awaiting_cash}</strong>
            </div>
            <div class="donut-legend-item">
              <span class="flex items-center gap-2"><span class="donut-legend-color" style="background: #3b82f6;"></span>Queued / Confirmed</span>
              <strong>${statusCounts.payment_confirmed_queued}</strong>
            </div>
            <div class="donut-legend-item">
              <span class="flex items-center gap-2"><span class="donut-legend-color" style="background: #8b5cf6;"></span>Printing</span>
              <strong>${statusCounts.printing}</strong>
            </div>
            <div class="donut-legend-item">
              <span class="flex items-center gap-2"><span class="donut-legend-color" style="background: #10b981;"></span>Completed</span>
              <strong>${statusCounts.completed}</strong>
            </div>
            <div class="donut-legend-item">
              <span class="flex items-center gap-2"><span class="donut-legend-color" style="background: #ef4444;"></span>Rejected / Failed</span>
              <strong>${statusCounts.rejected_failed}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Chart D: Print Type Analysis (Color vs Monochrome with Metric Switcher) -->
      <div class="analytics-chart-card chart-print-type">
        <div class="analytics-chart-top">
          <div>
            <div class="analytics-chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20Z"></path></svg>
              Print Type Analysis (Color vs Monochrome)
            </div>
            <div class="analytics-chart-desc">Compare B&W and color split across jobs, pages, or confirmed revenue</div>
          </div>

          <!-- Metric Switcher -->
          <div class="metric-switcher" id="print-type-metric-switcher">
            <button type="button" class="metric-switch-btn ${currentAnalyticsPrintTypeMetric === 'jobs' ? 'active' : ''}" data-metric="jobs">Jobs</button>
            <button type="button" class="metric-switch-btn ${currentAnalyticsPrintTypeMetric === 'pages' ? 'active' : ''}" data-metric="pages">Pages</button>
            <button type="button" class="metric-switch-btn ${currentAnalyticsPrintTypeMetric === 'revenue' ? 'active' : ''}" data-metric="revenue">Revenue</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1rem; padding-top: 0.5rem;">
          ${(() => {
            let mVal, cVal, mLabel, cLabel, mPct, cPct;
            if (currentAnalyticsPrintTypeMetric === 'pages') {
              mVal = monoPages;
              cVal = colorPages;
              const totalP = Math.max(mVal + cVal, 1);
              mPct = Math.round((mVal / totalP) * 100);
              cPct = 100 - mPct;
              mLabel = `${mVal.toLocaleString()} billable pages`;
              cLabel = `${cVal.toLocaleString()} billable pages`;
            } else if (currentAnalyticsPrintTypeMetric === 'revenue') {
              mVal = monoRevenue;
              cVal = colorRevenue;
              const totalR = Math.max(mVal + cVal, 1);
              mPct = Math.round((mVal / totalR) * 100);
              cPct = 100 - mPct;
              mLabel = formatCurrencyINR(mVal);
              cLabel = formatCurrencyINR(cVal);
            } else {
              mVal = monoJobs.length;
              cVal = colorJobs.length;
              mPct = monoPercent;
              cPct = colorPercent;
              mLabel = `${mVal} completed orders`;
              cLabel = `${cVal} completed orders`;
            }

            return `
              <div class="flex justify-between items-center text-sm">
                <div class="flex items-center gap-2">
                  <span style="width: 12px; height: 12px; border-radius: 3px; background: #64748b;"></span>
                  <strong>Black & White (B&W)</strong>
                </div>
                <span><strong>${mPct}%</strong> (${mLabel})</span>
              </div>

              <div class="flex justify-between items-center text-sm">
                <div class="flex items-center gap-2">
                  <span style="width: 12px; height: 12px; border-radius: 3px; background: var(--primary-600);"></span>
                  <strong>Full Color</strong>
                </div>
                <span><strong>${cPct}%</strong> (${cLabel})</span>
              </div>

              <div class="comparison-meter-track" style="height: 14px; border-radius: 7px;" title="B&W: ${mPct}% | Color: ${cPct}%">
                <div style="width: ${mPct}%; background: #64748b;"></div>
                <div style="width: ${cPct}%; background: var(--primary-600);"></div>
              </div>
            `;
          })()}

          <p class="text-xs text-muted" style="margin-top: 0.25rem;">
            Tip: B&W single-sided remains the most common counter xerox format, while color orders yield higher average basket value.
          </p>
        </div>
      </div>

      <!-- Chart E: Paper Size Popularity (Horizontal Bar Chart) -->
      <div class="analytics-chart-card chart-paper-size">
        <div class="analytics-chart-top">
          <div>
            <div class="analytics-chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              Paper Size Popularity
            </div>
            <div class="analytics-chart-desc">Billable pages and order frequency by paper format</div>
          </div>
          <span class="badge" style="background: var(--bg-surface-subtle); font-size: 0.75rem;">Supported Media</span>
        </div>

        <div class="hbar-list">
          ${paperSizesList.map(item => {
            const pct = filteredJobs.length > 0 ? Math.round((item.count / filteredJobs.length) * 100) : 0;
            return `
              <div class="hbar-item">
                <div class="hbar-header">
                  <span><strong>${escapeHtml(item.size)}</strong> (${item.count} orders)</span>
                  <span class="text-muted">${item.pages.toLocaleString()} pgs &bull; ${pct}%</span>
                </div>
                <div class="hbar-track">
                  <div class="hbar-fill" style="width: ${pct}%; background: ${item.size === 'A4' ? 'var(--primary-600)' : item.size === 'A3' ? '#3b82f6' : '#8b5cf6'};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Chart F: Revenue by Print Service (Service Combinations) -->
      <div class="analytics-chart-card chart-service-revenue">
        <div class="analytics-chart-top">
          <div>
            <div class="analytics-chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Revenue by Print Service & 1-Sided vs Duplex
            </div>
            <div class="analytics-chart-desc">Collections derived from confirmed rates and single/double-sided options</div>
          </div>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #059669; font-size: 0.75rem;">
            ~${sheetsSaved} Sheets Saved
          </span>
        </div>

        <div class="print-services-grid">
          ${Object.values(serviceStats).map(s => `
            <div class="service-card">
              <span class="service-card-title">${escapeHtml(s.label)}</span>
              <span class="service-card-revenue">${formatCurrencyINR(s.revenue)}</span>
              <span class="service-card-count">${s.jobs} jobs &bull; ${s.pages} pgs</span>
            </div>
          `).join('')}
        </div>

        <!-- 1-Sided vs Duplex Efficiency Meter -->
        <div style="margin-top: 0.75rem;">
          <div class="flex justify-between items-center text-xs" style="margin-bottom: 0.35rem;">
            <span><strong>1-Sided</strong>: ${singlePercent}% (${singleJobs.length} orders)</span>
            <span><strong>2-Sided (Duplex)</strong>: ${duplexPercent}% (${duplexJobs.length} orders)</span>
          </div>
          <div class="comparison-meter-track" title="1-Sided: ${singlePercent}% | Duplex: ${duplexPercent}%">
            <div style="width: ${singlePercent}%; background: #94a3b8;"></div>
            <div style="width: ${duplexPercent}%; background: #10b981;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- C. Peak Hours & Operational Traffic Section -->
    <div class="analytics-chart-card chart-peak-hours" style="margin-bottom: 1.75rem;">
      <div class="analytics-chart-top">
        <div>
          <div class="analytics-chart-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            Peak Operating Hours & Weekly Load
          </div>
          <div class="analytics-chart-desc">Traffic distribution by work shift and weekday in store timezone (IST)</div>
        </div>
      </div>

      <div class="peak-hours-grid">
        <div class="peak-card">
          <span class="peak-card-time">Morning (8am - 12pm)</span>
          <span class="peak-card-count">${shiftCounts.morning}</span>
          <span class="text-xs text-muted">Orders</span>
        </div>
        <div class="peak-card">
          <span class="peak-card-time">Midday (12pm - 4pm)</span>
          <span class="peak-card-count">${shiftCounts.midday}</span>
          <span class="text-xs text-muted">Orders</span>
        </div>
        <div class="peak-card">
          <span class="peak-card-time">Evening (4pm - 8pm)</span>
          <span class="peak-card-count">${shiftCounts.evening}</span>
          <span class="text-xs text-muted">Orders</span>
        </div>
        <div class="peak-card">
          <span class="peak-card-time">Night (8pm - 12am)</span>
          <span class="peak-card-count">${shiftCounts.night}</span>
          <span class="text-xs text-muted">Orders</span>
        </div>
      </div>
    </div>

    <!-- D. Hardware & Printer Performance Strip -->
    ${connectedPrinters.length > 0 ? `
      <div class="printer-perf-panel analytics-printer-perf">
        <div class="flex justify-between items-center" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <h3 style="font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Connected Printer Performance
          </h3>
          <span class="badge" style="background: rgba(16, 185, 129, 0.12); color: #059669; font-size: 0.75rem;">
            ${connectedPrinters.length} Devices Online
          </span>
        </div>

        <div class="printer-perf-grid">
          ${connectedPrinters.map(pName => {
            const printerJobs = completedJobs.filter(j => j.assignedPrinter === pName || (pName.includes('Laser') && j.colorMode !== 'color') || (pName.includes('EcoTank') && j.colorMode === 'color')).length;
            return `
              <div class="printer-perf-card">
                <div>
                  <div class="font-semibold text-main text-sm">${escapeHtml(pName)}</div>
                  <div class="text-xs text-muted">${printerJobs} jobs fulfilled in period</div>
                </div>
                <span class="badge badge-completed text-xs font-semibold" style="font-size: 0.7rem;">Ready</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- E. Full Detail Analytics Breakdown & Searchable Table -->
    <div class="analytics-detail-panel">
      <div class="flex justify-between items-center" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <h3 style="font-size: 1.05rem; margin-bottom: 0.25rem;">Full Detail Analytics Breakdown</h3>
          <p class="text-xs text-muted">Searchable, filterable, and paginated order transaction records for in-depth audits</p>
        </div>
        <span class="badge" style="background: var(--primary-50); color: var(--primary-700); font-weight: 600;">
          ${tableFiltered.length} Filtered Records
        </span>
      </div>

      <!-- Table Toolbar: Search & Status Filter -->
      <div class="table-toolbar">
        <div class="table-toolbar-left">
          <input type="text" id="analytics-table-search-input" class="form-input analytics-table-search" placeholder="Search reference, token, note..." value="${escapeHtml(currentAnalyticsTableSearch)}" style="width: 240px; padding: 0.4rem 0.75rem; font-size: 0.8125rem;" />
          <select id="analytics-table-status-select" class="form-select analytics-table-status" style="width: 170px; padding: 0.4rem 0.75rem; font-size: 0.8125rem;">
            <option value="all" ${currentAnalyticsTableStatus === 'all' ? 'selected' : ''}>All Statuses</option>
            <option value="completed" ${currentAnalyticsTableStatus === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="approved_awaiting_cash" ${currentAnalyticsTableStatus === 'approved_awaiting_cash' ? 'selected' : ''}>Approved Awaiting Cash</option>
            <option value="pending_confirmation" ${currentAnalyticsTableStatus === 'pending_confirmation' ? 'selected' : ''}>Pending Confirmation</option>
            <option value="rejected" ${currentAnalyticsTableStatus === 'rejected' ? 'selected' : ''}>Rejected / Failed</option>
          </select>
        </div>

        <div class="text-xs text-muted">
          Page ${currentAnalyticsTablePage} of ${totalPagesCount}
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table" id="analytics-detail-table">
          <thead>
            <tr>
              <th>Date / Reference</th>
              <th>Order ID / Token</th>
              <th>Print Service</th>
              <th>Paper</th>
              <th>Copies &amp; Pgs</th>
              <th>Quoted Total</th>
              <th>Confirmed Paid</th>
              <th>Payment</th>
              <th>Job Status</th>
            </tr>
          </thead>
          <tbody>
            ${pagedRecords.length > 0 ? pagedRecords.map(j => {
              const dateStr = j.createdAt ? new Date(j.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
              const isCompleted = j.status === 'completed';
              const isPaid = j.paymentStatus === 'paid' || isCompleted;
              const paidAmount = isPaid ? (Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0) : 0;
              const quotedAmount = Number(j.amountPaise ? j.amountPaise / 100 : j.estimatedAmount) || 0;

              return `
                <tr>
                  <td>
                    <div class="font-medium text-main text-sm">${escapeHtml(dateStr)}</div>
                    <div class="text-xs text-muted">${escapeHtml(j.jobId)}</div>
                  </td>
                  <td>
                    <span class="badge" style="font-family: monospace; background: var(--bg-surface-subtle);">${escapeHtml(j.trackingToken || 'N/A')}</span>
                  </td>
                  <td class="text-xs">
                    <span class="badge" style="background: ${j.colorMode === 'color' ? 'rgba(124, 58, 237, 0.12)' : 'var(--bg-surface-subtle)'};">
                      ${j.colorMode === 'color' ? 'Color' : 'B&W'} &bull; ${j.duplex ? '2-Sided' : '1-Sided'}
                    </span>
                  </td>
                  <td class="text-xs font-semibold">${escapeHtml(j.paperSize || 'A4')}</td>
                  <td class="text-sm">${j.copies || 1} &times; ${j.pageCount || 1} pgs</td>
                  <td class="text-sm font-semibold">${formatCurrencyINR(quotedAmount)}</td>
                  <td class="text-sm font-bold" style="color: ${paidAmount > 0 ? '#059669' : 'var(--text-muted)'};">
                    ${formatCurrencyINR(paidAmount)}
                  </td>
                  <td>
                    <span class="badge ${isPaid ? 'badge-completed' : 'badge-under-review'}" style="font-size: 0.7rem;">
                      ${isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td>
                    <span class="badge ${isCompleted ? 'badge-completed' : j.status === 'rejected' ? 'badge-rejected' : 'badge-submitted'}" style="font-size: 0.7rem;">
                      ${escapeHtml(j.status)}
                    </span>
                  </td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="9" class="text-center text-muted" style="padding: 2rem;">No matching orders found for current search/filter.</td>
              </tr>
            `}
          </tbody>
          <tfoot>
            <tr style="background: var(--bg-surface-subtle); font-weight: 700;">
              <td>Total Summary</td>
              <td>${completedJobs.length} Completed / ${filteredJobs.length} Orders</td>
              <td>${colorPercent}% Color &bull; ${duplexPercent}% Duplex</td>
              <td>${paperSizesList[0]?.size || 'A4'} Top Media</td>
              <td>${totalPages.toLocaleString()} Billable Pgs</td>
              <td>${formatCurrencyINR(grossPotentialRevenue)}</td>
              <td style="color: var(--primary-700);">${formatCurrencyINR(totalRevenue)}</td>
              <td>${completionRate}% Overall</td>
              <td>${rejectedJobs.length} Rejected</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Pagination Bar -->
      <div class="table-pagination-bar">
        <span class="text-xs text-muted" id="analytics-page-indicator">
          Showing ${tableFiltered.length > 0 ? pageStart + 1 : 0} to ${Math.min(pageStart + PAGE_SIZE, tableFiltered.length)} of ${tableFiltered.length} records
        </span>
        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-secondary btn-sm btn-table-prev" id="btn-analytics-prev" ${currentAnalyticsTablePage <= 1 ? 'disabled' : ''}>
            &larr; Previous
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-table-next" id="btn-analytics-next" ${currentAnalyticsTablePage >= totalPagesCount ? 'disabled' : ''}>
            Next &rarr;
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach interactive controls inside the analytics view
  // 1. Metric switcher for Color vs Monochrome
  container.querySelectorAll('.metric-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentAnalyticsPrintTypeMetric = btn.getAttribute('data-metric') || 'jobs';
      renderAnalyticsSection(centerId);
    });
  });

  // 2. Table search input
  const searchInput = container.querySelector('#analytics-table-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentAnalyticsTableSearch = e.target.value;
      currentAnalyticsTablePage = 1;
      renderAnalyticsSection(centerId);
      // Restore focus to input
      const nextInput = document.getElementById('analytics-table-search-input');
      if (nextInput) {
        nextInput.focus();
        nextInput.selectionStart = nextInput.selectionEnd = nextInput.value.length;
      }
    });
  }

  // 3. Table status filter dropdown
  const statusSelect = container.querySelector('#analytics-table-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      currentAnalyticsTableStatus = e.target.value;
      currentAnalyticsTablePage = 1;
      renderAnalyticsSection(centerId);
    });
  }

  // 4. Pagination buttons
  container.querySelector('#btn-analytics-prev')?.addEventListener('click', () => {
    if (currentAnalyticsTablePage > 1) {
      currentAnalyticsTablePage--;
      renderAnalyticsSection(centerId);
    }
  });

  container.querySelector('#btn-analytics-next')?.addEventListener('click', () => {
    if (currentAnalyticsTablePage < totalPagesCount) {
      currentAnalyticsTablePage++;
      renderAnalyticsSection(centerId);
    }
  });
}


function renderSubscription(center) {
  const container = document.getElementById('subscription-content-container');
  if (!container) return;

  if (!center) {
    container.innerHTML = `
      <div class="glass-panel text-center" style="padding: 2.5rem 1.5rem;">
        <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">No Center Provisioned</h3>
        <p class="text-sm text-muted">Please register or provision a center to activate subscriptions.</p>
      </div>
    `;
    return;
  }

  const isSubscribed = !!center.subscriptionId;
  container.innerHTML = `
    <div class="glass-panel" style="padding: 2rem; max-width: 640px;">
      <div class="flex justify-between items-center" style="margin-bottom: 1rem;">
        <span class="badge ${isSubscribed ? 'badge-completed' : 'badge-under-review'}">
          ${isSubscribed ? 'Active Subscription' : 'Trial / Setup Mode'}
        </span>
      </div>
      <h3 style="font-size: 1.5rem; margin-bottom: 0.25rem;">${escapeHtml(center.name)}</h3>
      <p class="text-sm text-muted" style="margin-bottom: 1.25rem;">Public Center ID: <strong>${center.publicId || 'N/A'}</strong></p>
      <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; font-size: 0.875rem;">
        <li>✔ Dedicated customer QR code & web submission</li>
        <li>✔ Automated 24-hr secure document retention</li>
        <li>✔ Direct print queue dispatch</li>
        <li>✔ Real-time status tracker</li>
      </ul>
    </div>
  `;
}
