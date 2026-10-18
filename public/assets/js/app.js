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
  if (!storeStatusBtn) return;

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

export function getStoreStatus(centerId = null) {
  if (centerId) {
    const saved = localStorage.getItem(`smartprint_store_status_${centerId}`);
    if (saved === 'closed') return false;
    if (saved === 'open') return true;
  }
  const globalSaved = localStorage.getItem('smartprint_store_status');
  if (globalSaved === 'closed') return false;
  if (globalSaved === 'open') return true;

  if (centerId) {
    const center = stateStore.getCenter(centerId);
    if (center && (center.status === 'closed' || center.status === 'inactive' || center.isOpen === false)) {
      return false;
    }
  }
  return true; // Default is open
}

export async function setStoreStatus(isOpen, centerId = null, showNotification = true) {
  const user = auth.getCurrentUser();
  const effectiveCenterId = centerId || user?.centerId || stateStore.getCenters()[0]?.centerId;

  // 1. Update UI immediately
  updateStoreStatusUI(isOpen);

  // 2. Persist in localStorage
  if (effectiveCenterId) {
    localStorage.setItem(`smartprint_store_status_${effectiveCenterId}`, isOpen ? 'open' : 'closed');
  }
  localStorage.setItem('smartprint_store_status', isOpen ? 'open' : 'closed');

  // 3. Persist in stateStore
  if (effectiveCenterId) {
    const center = stateStore.getCenter(effectiveCenterId) || {};
    stateStore.saveCenter({
      ...center,
      centerId: effectiveCenterId,
      status: isOpen ? 'active' : 'closed',
      isOpen: isOpen
    });
  }

  // 4. Persist in Firestore if online
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

  // 5. Toast feedback
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

      const uniqueId = getOrGenerateUniqueId(user);
      const currentCenter = (centerId ? stateStore.getCenter(centerId) : null) || {};

      let resolvedCenterId = centerId || user?.centerId || currentCenter.centerId;
      if (!resolvedCenterId && user?.uid) {
        resolvedCenterId = "center_" + user.uid.substring(0, 8);
      }
      centerId = resolvedCenterId;
      if (user) user.centerId = resolvedCenterId;

      const publicId = currentCenter.publicId || ("CTR-" + (user?.uid ? user.uid.substring(0, 6).toUpperCase() : "DEMO"));

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
    const qrPayload = JSON.stringify({
      type: "smartprint_user_profile",
      uid: uid,
      store: profileData.storeName || '',
      user: profileData.userName || '',
      phone: profileData.phone || '',
      email: profileData.email || '',
      v: 1
    });
    const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=10&data=${encodeURIComponent(qrPayload)}`;
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
    const publicId = profileData.publicId || ('CTR-' + uid.substring(0, 6));

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

  // Analytics Timeframe Filter Buttons
  document.querySelectorAll('.analytics-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.analytics-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAnalyticsRange = btn.getAttribute('data-range') || 'all';
      renderAnalyticsSection(centerId);
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
    jobs = jobs.filter(j => j.status === currentFilter);
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

function filterJobsByDateRange(jobs, range) {
  const now = new Date();
  const nowMs = now.getTime();

  return jobs.filter(job => {
    const jobDate = new Date(job.createdAt || job.updatedAt || 0);
    if (isNaN(jobDate.getTime()) || jobDate.getTime() === 0) return true;
    const jobMs = jobDate.getTime();
    const diffMs = nowMs - jobMs;

    switch (range) {
      case 'today':
        return jobDate.getFullYear() === now.getFullYear() &&
               jobDate.getMonth() === now.getMonth() &&
               jobDate.getDate() === now.getDate();
      case '7days':
        return diffMs <= 7 * 24 * 60 * 60 * 1000 && diffMs >= 0;
      case '30days':
        return diffMs <= 30 * 24 * 60 * 60 * 1000 && diffMs >= 0;
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
  
  // 1. In-memory check
  if (user && user.uniqueId) {
    return String(user.uniqueId);
  }

  // 2. Local profile store check
  const profiles = JSON.parse(localStorage.getItem('smartprint_user_profiles') || '{}');
  const userKey = (user && (user.uid || user.email)) ? (user.uid || user.email) : 'default_operator';
  
  if (profiles[userKey]?.uniqueId) {
    const existingId = String(profiles[userKey].uniqueId);
    if (user) user.uniqueId = existingId;
    return existingId;
  }

  // 3. Sequence counter starting from 1M (1,000,000) and forwarding +1 for each login/user
  let currentSeq = parseInt(localStorage.getItem('smartprint_next_uid_seq') || `${START_UID}`, 10);
  if (isNaN(currentSeq) || currentSeq < START_UID) {
    currentSeq = START_UID;
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

  const qrTarget = `${window.location.origin}/customer/?center=${encodeURIComponent(profile.publicId || ('CTR-' + uid.substring(0, 6)))}`;
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

  const uniqueId = c.uniqueId || user.uniqueId || getOrGenerateUniqueId(user);

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
    uniqueId
  });
}

function renderActionButtons(job) {
  if (job.status === 'submitted') {
    return `
      <button class="btn btn-secondary btn-sm action-status-btn" data-id="${job.jobId}" data-status="under_review">
        Review
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
        stateStore.updateJobStatus(jobId, newStatus);
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
        const user = auth.getCurrentUser();
        const centerId = user?.centerId || stateStore.getCenters()[0]?.centerId;
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
    submitted: jobs.filter(j => j.status === 'submitted').length,
    under_review: jobs.filter(j => j.status === 'under_review').length,
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

export function renderAnalytics(centerId) {
  return renderAnalyticsSection(centerId);
}

export function renderAnalyticsSection(centerId) {
  const container = document.getElementById('analytics-content-view') || document.getElementById('analytics-content-container');
  if (!container) return;

  const allJobs = stateStore.getJobs(centerId);
  const currentCycle = getYearCycle(new Date());

  // Dynamic Year cycle label in Analytics filter tab
  const yearTabLabel = document.getElementById('analytics-year-tab-label');
  if (yearTabLabel) yearTabLabel.textContent = currentCycle;

  // Filter jobs for selected analytics range
  const filteredJobs = filterJobsByDateRange(allJobs, currentAnalyticsRange);

  // Update badge and subtext
  const totalBadge = document.getElementById('analytics-total-badge');
  if (totalBadge) totalBadge.textContent = `${filteredJobs.length} Orders`;

  const subtextEl = document.getElementById('analytics-filter-subtext');
  if (subtextEl) {
    const rangeNames = {
      all: 'All Time',
      today: 'Today',
      '7days': 'Last 7 Days',
      '30days': 'Last 30 Days',
      '3months': 'Last 3 Months',
      '6months': 'Last 6 Months',
      '1year': `Annual Cycle (${currentCycle})`
    };
    const activeLabel = rangeNames[currentAnalyticsRange] || 'Custom';
    subtextEl.textContent = `Showing analytics for: ${activeLabel} • ${filteredJobs.length} total orders analyzed • Updated in real-time`;
  }

  if (filteredJobs.length === 0) {
    container.innerHTML = `
      <div class="glass-panel text-center" style="padding: 3.5rem 1.5rem;">
        <div class="empty-state-icon" style="font-size: 2.5rem; margin-bottom: 0.75rem;">📊</div>
        <h3 style="font-size: 1.15rem; margin-bottom: 0.5rem; color: var(--text-main);">No Orders Found in Selected Range</h3>
        <p class="text-sm text-muted" style="max-width: 420px; margin: 0 auto 1.25rem;">
          There is no print activity recorded for this timeframe. Select another filter or view all-time analytics.
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

  // 1. Metric Calculations
  const completedJobs = filteredJobs.filter(j => j.status === 'completed');
  const pendingJobs = filteredJobs.filter(j => ['submitted', 'in_queue', 'processing'].includes(j.status));
  const rejectedJobs = filteredJobs.filter(j => j.status === 'rejected');

  const totalRevenue = completedJobs.reduce((sum, j) => sum + (Number(j.estimatedAmount) || 0), 0);
  const pendingRevenue = pendingJobs.reduce((sum, j) => sum + (Number(j.estimatedAmount) || 0), 0);
  const grossPotentialRevenue = totalRevenue + pendingRevenue;

  const totalPages = completedJobs.reduce((sum, j) => sum + ((j.pageCount || 1) * (j.copies || 1)), 0);
  const avgOrderValue = completedJobs.length > 0 ? (totalRevenue / completedJobs.length) : 0;
  const avgPagesPerOrder = completedJobs.length > 0 ? (totalPages / completedJobs.length).toFixed(1) : '0';

  const completionRate = filteredJobs.length > 0 ? Math.round((completedJobs.length / filteredJobs.length) * 100) : 0;
  const rejectionRate = filteredJobs.length > 0 ? Math.round((rejectedJobs.length / filteredJobs.length) * 100) : 0;
  const pendingRate = Math.max(0, 100 - completionRate - rejectionRate);

  // 2. Comparisons (Color vs Mono, Duplex vs Single, Paper Sizes)
  const monoJobs = filteredJobs.filter(j => j.colorMode !== 'color');
  const colorJobs = filteredJobs.filter(j => j.colorMode === 'color');
  const monoPercent = filteredJobs.length > 0 ? Math.round((monoJobs.length / filteredJobs.length) * 100) : 0;
  const colorPercent = 100 - monoPercent;
  const monoRevenue = monoJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (Number(j.estimatedAmount) || 0), 0);
  const colorRevenue = colorJobs.filter(j => j.status === 'completed').reduce((sum, j) => sum + (Number(j.estimatedAmount) || 0), 0);

  const duplexJobs = filteredJobs.filter(j => Boolean(j.duplex));
  const singleJobs = filteredJobs.filter(j => !j.duplex);
  const duplexPercent = filteredJobs.length > 0 ? Math.round((duplexJobs.length / filteredJobs.length) * 100) : 0;
  const singlePercent = 100 - duplexPercent;
  const sheetsSaved = duplexJobs.reduce((sum, j) => sum + Math.max(1, Math.floor(((j.pageCount || 1) * (j.copies || 1)) / 2)), 0);

  const a4Count = filteredJobs.filter(j => (j.paperSize || '').toUpperCase().includes('A4')).length;
  const a3Count = filteredJobs.filter(j => (j.paperSize || '').toUpperCase().includes('A3')).length;
  const legalCount = filteredJobs.filter(j => (j.paperSize || '').toUpperCase().includes('LEGAL')).length;
  const otherSizesCount = Math.max(0, filteredJobs.length - a4Count - a3Count - legalCount);

  // 3. Daily / Timeline Aggregation for SVG Chart & Detail Table
  const dayBuckets = new Map();
  filteredJobs.forEach(job => {
    const rawDate = job.createdAt || job.updatedAt || new Date().toISOString();
    const d = new Date(rawDate);
    const dateKey = isNaN(d.getTime()) ? 'Recent' : d.toISOString().split('T')[0];
    const isCompleted = job.status === 'completed';
    const isRejected = job.status === 'rejected';

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
      b.revenue += Number(job.estimatedAmount) || 0;
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

  // Sort chronologically for chart & table
  const sortedDays = Array.from(dayBuckets.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const maxRevenueDay = Math.max(...sortedDays.map(d => d.revenue), 100);

  // SVG Dimensions
  const svgWidth = 720;
  const svgHeight = 220;
  const chartPadLeft = 45;
  const chartPadRight = 20;
  const chartPadTop = 25;
  const chartPadBottom = 35;
  const plotWidth = svgWidth - chartPadLeft - chartPadRight;
  const plotHeight = svgHeight - chartPadTop - chartPadBottom;

  const barCount = Math.max(sortedDays.length, 1);
  const colWidth = plotWidth / barCount;
  const barWidth = Math.min(Math.max(colWidth * 0.55, 12), 48);

  const barsMarkup = sortedDays.map((day, idx) => {
    const x = chartPadLeft + (idx * colWidth) + ((colWidth - barWidth) / 2);
    const barH = maxRevenueDay > 0 ? (day.revenue / maxRevenueDay) * plotHeight : 4;
    const y = chartPadTop + (plotHeight - Math.max(barH, 4));
    const titleText = `${day.label} (${day.dateKey}): ₹${day.revenue.toFixed(2)} revenue • ${day.completedOrders}/${day.totalOrders} orders completed`;

    return `
      <g class="chart-bar-group">
        <rect class="chart-bar-rect" 
              x="${x.toFixed(1)}" 
              y="${y.toFixed(1)}" 
              width="${barWidth.toFixed(1)}" 
              height="${Math.max(barH, 4).toFixed(1)}" 
              rx="4" 
              ry="4" 
              fill="url(#revenueGrad)">
          <title>${escapeHtml(titleText)}</title>
        </rect>
        <text class="chart-axis-text" 
              x="${(x + barWidth / 2).toFixed(1)}" 
              y="${(y - 6).toFixed(1)}" 
              text-anchor="middle" 
              font-size="10" 
              font-weight="600" 
              fill="var(--text-main)">
          ${day.revenue > 0 ? `₹${Math.round(day.revenue)}` : ''}
        </text>
        <text class="chart-axis-text" 
              x="${(x + barWidth / 2).toFixed(1)}" 
              y="${(svgHeight - 12).toFixed(1)}" 
              text-anchor="middle" 
              font-size="10">
          ${escapeHtml(day.label)}
        </text>
      </g>
    `;
  }).join('');

  // Horizontal Grid Lines
  const gridLinesMarkup = [0.25, 0.5, 0.75, 1].map(ratio => {
    const yVal = chartPadTop + plotHeight * (1 - ratio);
    const amountLabel = Math.round(maxRevenueDay * ratio);
    return `
      <g>
        <line x1="${chartPadLeft}" y1="${yVal.toFixed(1)}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${yVal.toFixed(1)}" class="chart-grid-line" />
        <text x="${(chartPadLeft - 8)}" y="${(yVal + 3).toFixed(1)}" text-anchor="end" class="chart-axis-text" font-size="9">₹${amountLabel}</text>
      </g>
    `;
  }).join('');

  // 4. Render HTML Structure
  container.innerHTML = `
    <!-- A. KPIs Overview Grid -->
    <div class="analytics-kpi-grid">
      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Total Revenue
        </div>
        <div class="analytics-kpi-value" style="color: var(--primary-600);">${formatCurrencyINR(totalRevenue)}</div>
        <div class="analytics-kpi-subtext">
          ${completedJobs.length} completed &bull; Potential: ${formatCurrencyINR(grossPotentialRevenue)}
        </div>
      </div>

      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Average Order Value
        </div>
        <div class="analytics-kpi-value">${formatCurrencyINR(avgOrderValue)}</div>
        <div class="analytics-kpi-subtext">
          Across completed dispatches
        </div>
      </div>

      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Pages Printed
        </div>
        <div class="analytics-kpi-value">${totalPages.toLocaleString()}</div>
        <div class="analytics-kpi-subtext">
          Avg ${avgPagesPerOrder} pages per print order
        </div>
      </div>

      <div class="analytics-kpi-card">
        <div class="analytics-kpi-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Fulfillment Rate
        </div>
        <div class="analytics-kpi-value" style="color: #10b981;">${completionRate}%</div>
        <div class="analytics-kpi-subtext">
          ${completedJobs.length} done &bull; ${rejectedJobs.length} rejected (${rejectionRate}%)
        </div>
      </div>
    </div>

    <!-- B. Revenue Timeline Graph Panel -->
    <div class="analytics-chart-panel">
      <div class="analytics-chart-header">
        <div>
          <h3 style="font-size: 1.05rem; margin-bottom: 0.25rem;">Daily Revenue & Volume Trend</h3>
          <p class="text-xs text-muted">Daily completed earnings and dispatch distribution over the selected period</p>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1 text-xs">
            <span style="width: 10px; height: 10px; border-radius: 2px; background: var(--primary-600);"></span>
            <span>Daily Revenue (₹)</span>
          </div>
          <span class="badge" style="background: var(--primary-50); color: var(--primary-700); font-size: 0.75rem;">
            Peak: ₹${Math.round(maxRevenueDay)}
          </span>
        </div>
      </div>

      <div class="chart-svg-wrapper">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%; overflow: visible;">
          <defs>
            <linearGradient id="revenueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#8b5cf6" />
              <stop offset="100%" stop-color="#6366f1" />
            </linearGradient>
          </defs>

          <!-- Axis Lines -->
          <line x1="${chartPadLeft}" y1="${(svgHeight - chartPadBottom).toFixed(1)}" x2="${(svgWidth - chartPadRight).toFixed(1)}" y2="${(svgHeight - chartPadBottom).toFixed(1)}" stroke="var(--border-subtle)" stroke-width="1" />
          ${gridLinesMarkup}

          <!-- Bars -->
          ${barsMarkup}
        </svg>
      </div>
    </div>

    <!-- C. Comparative Analytics (Comparisms) Grid -->
    <div class="analytics-comparisons-grid">
      <!-- 1. Color vs Monochrome -->
      <div class="comparison-card">
        <div class="comparison-card-header">
          <div class="comparison-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20Z"></path></svg>
            Color vs Monochrome (B&W)
          </div>
          <span class="badge" style="background: var(--bg-surface-subtle); font-size: 0.75rem;">${filteredJobs.length} Jobs</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div class="flex justify-between items-center text-xs">
            <div class="flex items-center gap-2">
              <span style="width: 10px; height: 10px; border-radius: 2px; background: #64748b;"></span>
              <strong>Black & White (B&W)</strong>
            </div>
            <span>${monoPercent}% (${monoJobs.length} orders &bull; ${formatCurrencyINR(monoRevenue)})</span>
          </div>

          <div class="flex justify-between items-center text-xs">
            <div class="flex items-center gap-2">
              <span style="width: 10px; height: 10px; border-radius: 2px; background: var(--primary-600);"></span>
              <strong>Full Color</strong>
            </div>
            <span>${colorPercent}% (${colorJobs.length} orders &bull; ${formatCurrencyINR(colorRevenue)})</span>
          </div>

          <div class="comparison-meter-track" title="B&W: ${monoPercent}% | Color: ${colorPercent}%">
            <div style="width: ${monoPercent}%; background: #64748b;"></div>
            <div style="width: ${colorPercent}%; background: var(--primary-600);"></div>
          </div>
        </div>
      </div>

      <!-- 2. Single-Sided vs Duplex -->
      <div class="comparison-card">
        <div class="comparison-card-header">
          <div class="comparison-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="16" y2="10"></line></svg>
            Paper Efficiency (1-Sided vs Duplex)
          </div>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #059669; font-size: 0.75rem;">
            ~${sheetsSaved} Sheets Saved
          </span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div class="flex justify-between items-center text-xs">
            <div class="flex items-center gap-2">
              <span style="width: 10px; height: 10px; border-radius: 2px; background: #94a3b8;"></span>
              <strong>1-Sided (Single)</strong>
            </div>
            <span>${singlePercent}% (${singleJobs.length} orders)</span>
          </div>

          <div class="flex justify-between items-center text-xs">
            <div class="flex items-center gap-2">
              <span style="width: 10px; height: 10px; border-radius: 2px; background: #10b981;"></span>
              <strong>2-Sided (Duplex)</strong>
            </div>
            <span>${duplexPercent}% (${duplexJobs.length} orders)</span>
          </div>

          <div class="comparison-meter-track" title="1-Sided: ${singlePercent}% | Duplex: ${duplexPercent}%">
            <div style="width: ${singlePercent}%; background: #94a3b8;"></div>
            <div style="width: ${duplexPercent}%; background: #10b981;"></div>
          </div>
        </div>
      </div>

      <!-- 3. Fulfillment & Rejection Breakdown -->
      <div class="comparison-card">
        <div class="comparison-card-header">
          <div class="comparison-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
            Fulfillment & Order Status
          </div>
          <span class="badge" style="background: var(--bg-surface-subtle); font-size: 0.75rem;">
            ${completionRate}% Success
          </span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div class="flex justify-between items-center text-xs">
            <div class="flex items-center gap-2">
              <span style="width: 10px; height: 10px; border-radius: 2px; background: #10b981;"></span>
              <span>Completed</span>
            </div>
            <strong>${completedJobs.length} (${completionRate}%)</strong>
          </div>

          <div class="flex justify-between items-center text-xs">
            <div class="flex items-center gap-2">
              <span style="width: 10px; height: 10px; border-radius: 2px; background: #f59e0b;"></span>
              <span>In Queue / Processing</span>
            </div>
            <strong>${pendingJobs.length} (${pendingRate}%)</strong>
          </div>

          <div class="flex justify-between items-center text-xs">
            <div class="flex items-center gap-2">
              <span style="width: 10px; height: 10px; border-radius: 2px; background: #ef4444;"></span>
              <span>Rejected Prints</span>
            </div>
            <strong>${rejectedJobs.length} (${rejectionRate}%)</strong>
          </div>

          <div class="comparison-meter-track" title="Completed: ${completionRate}% | Pending: ${pendingRate}% | Rejected: ${rejectionRate}%">
            <div style="width: ${completionRate}%; background: #10b981;"></div>
            <div style="width: ${pendingRate}%; background: #f59e0b;"></div>
            <div style="width: ${rejectionRate}%; background: #ef4444;"></div>
          </div>
        </div>
      </div>

      <!-- 4. Paper Size Distribution -->
      <div class="comparison-card">
        <div class="comparison-card-header">
          <div class="comparison-card-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            Paper Size Distribution
          </div>
          <span class="badge" style="background: var(--bg-surface-subtle); font-size: 0.75rem;">Standards</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div class="flex justify-between items-center text-xs">
            <span>A4 Standard Paper</span>
            <strong>${a4Count} (${filteredJobs.length > 0 ? Math.round((a4Count / filteredJobs.length) * 100) : 0}%)</strong>
          </div>

          <div class="flex justify-between items-center text-xs">
            <span>A3 Large Paper</span>
            <strong>${a3Count} (${filteredJobs.length > 0 ? Math.round((a3Count / filteredJobs.length) * 100) : 0}%)</strong>
          </div>

          <div class="flex justify-between items-center text-xs">
            <span>Legal / Other Formats</span>
            <strong>${legalCount + otherSizesCount} (${filteredJobs.length > 0 ? Math.round(((legalCount + otherSizesCount) / filteredJobs.length) * 100) : 0}%)</strong>
          </div>

          <div class="comparison-meter-track">
            <div style="width: ${filteredJobs.length > 0 ? Math.round((a4Count / filteredJobs.length) * 100) : 0}%; background: var(--primary-600);"></div>
            <div style="width: ${filteredJobs.length > 0 ? Math.round((a3Count / filteredJobs.length) * 100) : 0}%; background: #3b82f6;"></div>
            <div style="width: ${filteredJobs.length > 0 ? Math.round(((legalCount + otherSizesCount) / filteredJobs.length) * 100) : 0}%; background: #8b5cf6;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- D. Full Detail Analytics Breakdown Table -->
    <div class="analytics-detail-panel">
      <div class="flex justify-between items-center" style="margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <h3 style="font-size: 1.05rem; margin-bottom: 0.25rem;">Full Detail Analytics Breakdown</h3>
          <p class="text-xs text-muted">Chronological and operational metrics breakdown for in-depth center analysis</p>
        </div>
        <span class="badge" style="background: var(--primary-50); color: var(--primary-700); font-weight: 600;">
          ${sortedDays.length} Active Reporting Dates
        </span>
      </div>

      <div class="table-responsive">
        <table class="data-table" id="analytics-detail-table">
          <thead>
            <tr>
              <th>Date / Period</th>
              <th>Orders (Completed / Total)</th>
              <th>Pages Printed</th>
              <th>Color Share</th>
              <th>Duplex Share</th>
              <th>Fulfillment Success</th>
              <th>Total Revenue</th>
            </tr>
          </thead>
          <tbody>
            ${sortedDays.slice().reverse().map(d => {
              const dayColorPct = d.totalOrders > 0 ? Math.round((d.colorCount / d.totalOrders) * 100) : 0;
              const dayDuplexPct = d.totalOrders > 0 ? Math.round((d.duplexCount / d.totalOrders) * 100) : 0;
              const daySuccessPct = d.totalOrders > 0 ? Math.round((d.completedOrders / d.totalOrders) * 100) : 0;

              return `
                <tr>
                  <td>
                    <div class="font-medium text-main text-sm">${escapeHtml(d.label)}</div>
                    <div class="text-xs text-muted">${escapeHtml(d.dateKey)}</div>
                  </td>
                  <td class="text-sm font-semibold">
                    ${d.completedOrders} <span class="text-xs text-muted font-normal">/ ${d.totalOrders}</span>
                  </td>
                  <td class="text-sm">${d.pages.toLocaleString()} pgs</td>
                  <td class="text-xs">
                    <span class="badge" style="background: ${dayColorPct > 0 ? 'rgba(124, 58, 237, 0.12)' : 'var(--bg-surface-subtle)'}; font-size: 0.75rem;">
                      ${dayColorPct}% Color
                    </span>
                  </td>
                  <td class="text-xs">
                    <span class="badge" style="background: ${dayDuplexPct > 0 ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-surface-subtle)'}; font-size: 0.75rem;">
                      ${dayDuplexPct}% Duplex
                    </span>
                  </td>
                  <td>
                    <span class="badge" style="background: ${daySuccessPct >= 80 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.12)'}; color: ${daySuccessPct >= 80 ? '#059669' : '#dc2626'}; font-size: 0.75rem;">
                      ${daySuccessPct}%
                    </span>
                  </td>
                  <td class="font-bold text-sm" style="color: var(--primary-700);">
                    ${formatCurrencyINR(d.revenue)}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background: var(--bg-surface-subtle); font-weight: 700;">
              <td>Total Summary</td>
              <td>${completedJobs.length} / ${filteredJobs.length} Orders</td>
              <td>${totalPages.toLocaleString()} pgs</td>
              <td>${colorPercent}% Color</td>
              <td>${duplexPercent}% Duplex</td>
              <td>${completionRate}% Overall</td>
              <td style="color: var(--primary-700);">${formatCurrencyINR(totalRevenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
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
