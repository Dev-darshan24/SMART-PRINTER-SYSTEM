/**
 * Public Customer Flow Controller
 */

import { api } from './api.js';
import { 
  ICONS, 
  showToast, 
  formatCurrencyINR, 
  formatBytes, 
  escapeHtml 
} from './ui.js';

let selectedMaterials = [];
let currentCenter = null;

const printOptions = {
  copies: 1,
  colorMode: 'monochrome',
  duplex: false,
  paperSize: 'A4',
  customerNote: ''
};

document.addEventListener('DOMContentLoaded', async () => {
  // Extract center identifier from URL (?center=... or /c/:id)
  const params = new URLSearchParams(window.location.search);
  let centerQuery = params.get('center');
  if (!centerQuery && window.location.pathname.startsWith('/c/')) {
    centerQuery = window.location.pathname.replace(/^\/c\//, '').split('/')[0];
  }

  try {
    currentCenter = await api.getPublicCenter(centerQuery || 'default');
    populateCenterInfo(currentCenter);
  } catch (err) {
    showToast("Selected Xerox center not found or unavailable", "error");
    const nameEl = document.getElementById('center-name-display');
    if (nameEl) nameEl.textContent = "Center Unavailable";
    return;
  }

  setupUploadAndScanner();
  setupOptionsControls();
  recalculateTotal();
  startLiveStoreStatusWatcher(centerQuery || 'default');

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

  // Handle Form Submission
  const form = document.getElementById('print-submit-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!selectedMaterials || selectedMaterials.length === 0) {
        showToast("Please upload or scan at least one printing material", "warning");
        return;
      }

      const submitBtn = document.getElementById('btn-submit-job');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `Submitting ${selectedMaterials.length} Material${selectedMaterials.length > 1 ? 's' : ''}...`;

      try {
        const totalPages = getTotalPages();
        const result = await api.submitPrintJob({
          centerId: currentCenter.publicId,
          files: selectedMaterials,
          pageCount: totalPages,
          copies: printOptions.copies,
          colorMode: printOptions.colorMode,
          duplex: printOptions.duplex,
          paperSize: printOptions.paperSize,
          estimatedAmount: calculateCost(),
          customerNote: document.getElementById('customer-note')?.value || ''
        });

        showToast("Documents submitted successfully to Xerox Queue!", "success");
        setTimeout(() => {
          window.location.href = `/customer/track.html?token=${encodeURIComponent(result.trackingToken)}`;
        }, 600);
      } catch (err) {
        showToast(err.message, "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${ICONS.printer} Send to Xerox Queue`;
      }
    });
  }
});

function populateCenterInfo(center) {
  const nameEl = document.getElementById('center-name-display');
  if (nameEl) nameEl.textContent = center.name;

  const addrEl = document.getElementById('center-address-display');
  if (addrEl) addrEl.textContent = center.address || "Counter pickup";

  const avatarEl = document.getElementById('center-avatar-initials');
  if (avatarEl && center.name) {
    const parts = center.name.trim().split(/\s+/).filter(Boolean);
    const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
    avatarEl.textContent = initials;
  }

  const ratesBadge = document.getElementById('rates-badge');
  if (ratesBadge && center.rates) {
    ratesBadge.textContent = `B&W: ₹${center.rates.bwSingle}/pg (Single), ₹${center.rates.bwDouble}/pg (Double) • Color: ₹${center.rates.colorSingle}/pg`;
  }

  // Hide initial detecting loader
  const detectingEl = document.getElementById('store-status-detecting');
  if (detectingEl) detectingEl.style.display = 'none';

  // Check store status (open vs closed)
  const isStoreClosed = center.status === 'closed' || center.status === 'inactive' || center.isOpen === false;
  const storePill = document.getElementById('store-live-status-pill');
  const printForm = document.getElementById('print-submit-form');
  const closedView = document.getElementById('store-closed-view');

  if (isStoreClosed) {
    // 1. Update status pill
    if (storePill) {
      storePill.textContent = "🔴 Store Closed";
      storePill.className = "badge badge-rejected text-xs font-semibold";
    }

    // 2. Hide upload & print options form completely (options only visible if store is open)
    if (printForm) {
      printForm.style.display = 'none';
    }

    // 3. Show friendly Store Closed Card with visit later message
    if (closedView) {
      closedView.style.display = 'block';
      const closedStoreName = document.getElementById('closed-store-name');
      const closedStoreAddress = document.getElementById('closed-store-address');
      const closedStorePhone = document.getElementById('closed-store-phone');
      const closedStorePhoneRow = document.getElementById('closed-store-phone-row');

      if (closedStoreName) closedStoreName.textContent = `${center.name || 'Store'} is Currently Closed`;
      if (closedStoreAddress) closedStoreAddress.textContent = center.address || 'Counter Pickup';
      if (center.phone && closedStorePhone && closedStorePhoneRow) {
        closedStorePhone.textContent = center.phone;
        closedStorePhoneRow.style.display = 'flex';
      }
    }
  } else {
    // 1. Update status pill
    if (storePill) {
      storePill.textContent = "🟢 Store Open";
      storePill.className = "badge badge-completed text-xs font-semibold";
    }

    // 2. Show upload & print options form
    if (printForm) {
      printForm.style.display = 'block';
    }

    // 3. Hide Store Closed Card
    if (closedView) {
      closedView.style.display = 'none';
    }
  }

  // Wire Check Again button
  const checkStatusBtn = document.getElementById('btn-check-store-status');
  if (checkStatusBtn && !checkStatusBtn.__boundClick) {
    checkStatusBtn.__boundClick = true;
    checkStatusBtn.addEventListener('click', async () => {
      checkStatusBtn.disabled = true;
      const originalText = checkStatusBtn.innerHTML;
      checkStatusBtn.innerHTML = `<span>Checking status...</span>`;
      try {
        const params = new URLSearchParams(window.location.search);
        let centerQuery = params.get('center');
        if (!centerQuery && window.location.pathname.startsWith('/c/')) {
          centerQuery = window.location.pathname.replace(/^\/c\//, '').split('/')[0];
        }
        const refreshedCenter = await api.getPublicCenter(centerQuery || 'default');
        currentCenter = refreshedCenter;
        populateCenterInfo(refreshedCenter);
        if (refreshedCenter.isOpen) {
          showToast("Store is now OPEN! You can upload and print your documents.", "success");
        } else {
          showToast("Store is still closed. Please check back after some time.", "info");
        }
      } catch (e) {
        showToast("Could not refresh store status. Please try again.", "error");
      } finally {
        checkStatusBtn.disabled = false;
        checkStatusBtn.innerHTML = originalText;
      }
    });
  }
}

/**
 * Automatically detects whether store is open or closed in real-time
 * Polling server every 4 seconds so that when the store owner flips the toggle on counter PC,
 * any customer phone scanning the QR code updates automatically without refreshing.
 */
let lastDetectedIsOpen = null;
function startLiveStoreStatusWatcher(centerQuery) {
  async function checkLiveStatus() {
    try {
      const res = await fetch(`/api/store/status?center=${encodeURIComponent(centerQuery || '')}`, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.isOpen === 'boolean') {
          const nextIsOpen = data.isOpen;
          if (lastDetectedIsOpen !== null && lastDetectedIsOpen !== nextIsOpen) {
            if (currentCenter) {
              currentCenter.isOpen = nextIsOpen;
              currentCenter.status = nextIsOpen ? 'active' : 'closed';
              populateCenterInfo(currentCenter);
            }
            if (nextIsOpen) {
              showToast("🟢 Store has opened! Upload & printing options are now available.", "success");
            } else {
              showToast("🔴 Store has closed. New order submissions are currently paused.", "info");
            }
          }
          lastDetectedIsOpen = nextIsOpen;
        }
      }
    } catch (e) {
      // Ignore network blips during silent background polling
    }
  }

  // Periodic automatic polling
  setInterval(checkLiveStatus, 4000);

  // Instant check when mobile phone screen is awakened or tab regained focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkLiveStatus();
    }
  });
}

function setupUploadAndScanner() {
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('file-input');
  const cameraInput = document.getElementById('camera-input');
  const btnMobileScan = document.getElementById('btn-mobile-scan');
  const btnBrowseTrigger = document.getElementById('btn-browse-trigger');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', (e) => {
      // Avoid retriggering if child buttons were clicked
      if (e.target.closest('button')) return;
      fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) handleFilesAddition(files);
    });

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) handleFilesAddition(files);
      fileInput.value = ''; // Reset so the same file can be re-selected if removed
    });
  }

  if (btnBrowseTrigger && fileInput) {
    btnBrowseTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  // Mobile Camera Scan
  if (btnMobileScan && cameraInput) {
    btnMobileScan.addEventListener('click', (e) => {
      e.stopPropagation();
      cameraInput.click();
    });

    cameraInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        files.forEach(file => {
          handleCameraScanFile(file);
        });
      }
      cameraInput.value = '';
    });
  }
}

function handleCameraScanFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const scanNumber = selectedMaterials.filter(m => m.isCameraScan).length + 1;
    const material = {
      id: `scan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `Scanned Page #${scanNumber} (${file.name || 'Camera'})`,
      size: file.size,
      type: file.type || 'image/jpeg',
      estimatedPages: 1,
      isCameraScan: true,
      dataUrl: e.target.result,
      rawFile: file
    };
    selectedMaterials.push(material);
    renderMaterialsList();
    recalculateTotal();
    showToast(`Page #${scanNumber} captured via mobile camera!`, "success");
  };
  reader.readAsDataURL(file);
}

function handleFilesAddition(files) {
  const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.docx'];
  let addedCount = 0;

  files.forEach(file => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      showToast(`Skipped ${file.name}: unsupported format.`, "warning");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      showToast(`Skipped ${file.name}: exceeds 25 MB.`, "error");
      return;
    }

    let pages = 1;
    if (ext === '.pdf') {
      pages = Math.max(1, Math.min(50, Math.round(file.size / (150 * 1024))));
    }

    const material = {
      id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/pdf',
      estimatedPages: pages,
      isCameraScan: false,
      dataUrl: null,
      rawFile: file
    };

    selectedMaterials.push(material);
    addedCount++;
  });

  if (addedCount > 0) {
    renderMaterialsList();
    recalculateTotal();
    showToast(`Added ${addedCount} printing material${addedCount > 1 ? 's' : ''}!`, "success");
  }
}

function renderMaterialsList() {
  const previewContainer = document.getElementById('file-preview-container');
  const badgeEl = document.getElementById('materials-count-badge');
  if (!previewContainer) return;

  if (selectedMaterials.length === 0) {
    previewContainer.innerHTML = '';
    if (badgeEl) {
      badgeEl.textContent = "Multiple Files Supported";
      badgeEl.className = "badge badge-submitted text-xs font-semibold";
    }
    return;
  }

  const totalPages = getTotalPages();
  if (badgeEl) {
    badgeEl.textContent = `${selectedMaterials.length} File${selectedMaterials.length > 1 ? 's' : ''} Selected (${totalPages} Total Pgs)`;
    badgeEl.className = "badge badge-completed text-xs font-semibold";
  }

  previewContainer.innerHTML = `
    <div class="materials-container">
      <div class="materials-header">
        <span class="text-xs font-semibold text-main">Selected Materials (${selectedMaterials.length}):</span>
        <span class="text-xs text-muted">Approx. ${totalPages} pages before copies</span>
      </div>
      <div class="materials-list">
        ${selectedMaterials.map((m, idx) => `
          <div class="material-item-card" data-material-id="${m.id}">
            <div class="material-item-left">
              ${m.isCameraScan && m.dataUrl 
                ? `<img src="${m.dataUrl}" alt="Scan thumb" class="material-thumb-preview" />` 
                : `<div class="file-type-icon">${m.name.endsWith('.pdf') ? ICONS.fileText : ICONS.printer}</div>`}
              <div style="min-width: 0; overflow: hidden;">
                <div class="font-semibold text-main text-sm" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(m.name)}
                </div>
                <div class="text-xs text-muted" style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
                  <span>${formatBytes(m.size)}</span>
                  <span>&bull;</span>
                  <span>${m.estimatedPages} ${m.estimatedPages === 1 ? 'page' : 'pages'}</span>
                  ${m.isCameraScan ? '<span class="badge badge-submitted text-xs" style="font-size: 0.65rem; padding: 0.05rem 0.35rem;">Mobile Scan</span>' : ''}
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm btn-remove-material" data-index="${idx}" title="Remove file" style="color: var(--error-solid); padding: 0.25rem 0.5rem;">
              ${ICONS.x}
            </button>
          </div>
        `).join('')}
      </div>
      <div class="flex justify-between items-center" style="margin-top: 0.25rem;">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-clear-all-materials" style="color: var(--error-solid); font-size: 0.75rem;">
          Clear All
        </button>
        <span class="text-xs text-muted">Ready to configure options below &darr;</span>
      </div>
    </div>
  `;

  // Attach individual remove handlers
  previewContainer.querySelectorAll('.btn-remove-material').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      if (!isNaN(idx) && idx >= 0 && idx < selectedMaterials.length) {
        const removed = selectedMaterials.splice(idx, 1);
        renderMaterialsList();
        recalculateTotal();
        showToast(`Removed ${removed[0]?.name}`, "info");
      }
    });
  });

  // Clear all button
  previewContainer.querySelector('#btn-clear-all-materials')?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedMaterials = [];
    renderMaterialsList();
    recalculateTotal();
    showToast("Cleared all selected materials", "info");
  });
}

function getTotalPages() {
  return selectedMaterials.reduce((sum, m) => sum + (m.estimatedPages || 1), 0);
}

function setupOptionsControls() {
  // Copies Counter
  const btnMinus = document.getElementById('btn-copies-minus');
  const btnPlus = document.getElementById('btn-copies-plus');
  const valCopies = document.getElementById('copies-display');

  if (btnMinus && btnPlus && valCopies) {
    btnMinus.addEventListener('click', () => {
      if (printOptions.copies > 1) {
        printOptions.copies--;
        valCopies.textContent = printOptions.copies;
        recalculateTotal();
      }
    });

    btnPlus.addEventListener('click', () => {
      if (printOptions.copies < 50) {
        printOptions.copies++;
        valCopies.textContent = printOptions.copies;
        recalculateTotal();
      }
    });
  }

  // Color Mode Segment (B&W or Color)
  document.querySelectorAll('[data-color-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-color-mode]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      printOptions.colorMode = btn.getAttribute('data-color-mode');
      recalculateTotal();
    });
  });

  // Duplex Segment (1-Sided or 2-Sided)
  document.querySelectorAll('[data-duplex]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-duplex]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      printOptions.duplex = btn.getAttribute('data-duplex') === 'true';
      recalculateTotal();
    });
  });

  // Paper Size Select
  const selectSize = document.getElementById('paper-size-select');
  if (selectSize) {
    selectSize.addEventListener('change', (e) => {
      printOptions.paperSize = e.target.value;
      recalculateTotal();
    });
  }
}

function calculateCost() {
  const rates = currentCenter?.rates || {
    bwSingle: 2.0,
    bwDouble: 3.5,
    colorSingle: 10.0,
    colorDouble: 18.0
  };

  let perPageRate = rates.bwSingle;
  if (printOptions.colorMode === 'color') {
    perPageRate = printOptions.duplex ? (rates.colorDouble || 18.0) : (rates.colorSingle || 10.0);
  } else {
    perPageRate = printOptions.duplex ? (rates.bwDouble || 3.5) : (rates.bwSingle || 2.0);
  }

  if (printOptions.paperSize === 'A3') perPageRate *= 2;

  const totalPages = Math.max(1, getTotalPages());
  const total = perPageRate * totalPages * printOptions.copies;
  return Math.max(1, total);
}

function recalculateTotal() {
  const total = calculateCost();
  const el = document.getElementById('estimated-cost-display');
  if (el) el.textContent = formatCurrencyINR(total);
}

