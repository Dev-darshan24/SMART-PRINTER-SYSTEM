const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// Load .env automatically if available
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envPath);
    console.log("Loaded environment variables from .env");
  } catch (err) {
    console.warn("Could not load .env:", err.message);
  }
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf"
};

/**
 * Determine if a printer is a virtual software spooler/driver rather than an external physical device
 */
function isVirtualPrinterDevice(name, driver, port) {
  const n = (name || "").toLowerCase();
  const d = (driver || "").toLowerCase();
  const p = (port || "").toLowerCase();

  // Virtual / software ports
  if (/^(nul:|portprompt:|file:|shrfax:|cpw\d*:|foxit.*|documents\\.*|anydesk.*)/i.test(p)) {
    return true;
  }

  // Known virtual printer software signatures
  const virtualSignatures = [
    "print to pdf", "microsoft print to pdf", "pdf writer", "pdf printer", "pdf creator",
    "adobe pdf", "cutepdf", "bullzip", "dopdf", "pdf24", "nitro pdf", "novapdf", "foxit",
    "onenote", "send to microsoft onenote",
    "microsoft xps", "xps document writer", "openxps",
    "fax", "microsoft shared fax",
    "remote desktop easy print", "anydesk printer", "snagit", "root print queue"
  ];

  if (virtualSignatures.some(sig => n.includes(sig) || d.includes(sig))) {
    return true;
  }

  // Standalone PDF or XPS virtual device (unless it has a recognized physical brand like Canon, HP, etc.)
  if (/\b(pdf|xps)\b/i.test(n) && !/(canon|epson|hp|brother|xerox|ricoh|konica|kyocera|sharp|toshiba|pantum|samsung|tvs|zebra|tsc)/i.test(n)) {
    return true;
  }

  return false;
}

/**
 * Classify external hardware printer device into Xerox center & print store categories
 */
function classifyPrinterDevice(name, driver) {
  const text = `${name} ${driver}`.toLowerCase();

  // 1. Heavy-Duty Multi-Function Copier / Digital Xerox machine
  if (/(imagerunner|image_runner|\bir[- ]|\badv[- ]|workcentre|versalink|altalink|docucentre|bizhub|aficio|\bmp\s?\d{3,4}|taskalfa|ecosys|\bmx[- ]\d|\bar[- ]\d|e-studio|gestetner)/i.test(text)) {
    return {
      category: "Heavy-Duty Copier / Xerox",
      categoryBadge: "Xerox / Copier",
      iconType: "copier"
    };
  }

  // 2. High-Speed Monochrome Laser Printer
  if (/(laserjet|laser|\blbp[- ]?\d+|\bdcp[- ]?l|\bmfc[- ]?l|\bhl[- ]?l|pantum|proexpress|xpress)/i.test(text)) {
    return {
      category: "Laser Printer (B&W)",
      categoryBadge: "Laser (B&W)",
      iconType: "laser"
    };
  }

  // 3. Color Ink Tank & Photo Printer
  if (/(ecotank|ink\s?tank|smart\s?tank|pixma|\bg\d{3,4}\b|\bl\d{3,4}\b|photo|inkjet|deskjet|color|colour)/i.test(text)) {
    return {
      category: "Color Ink Tank / Inkjet",
      categoryBadge: "Color Ink Tank",
      iconType: "color"
    };
  }

  // 4. POS / Thermal Receipt & Token Printer
  if (/(thermal|receipt|pos[- ]?\d+|rp[- ]?\d+|tm[- ]?t\d+|te\d{3}|zd\d{3}|zebra|tsc|rongta|xprinter|citizen|star\s?micronics)/i.test(text)) {
    return {
      category: "Thermal Receipt / Slip Printer",
      categoryBadge: "POS / Receipt",
      iconType: "receipt"
    };
  }

  // 5. Dot Matrix Printer
  if (/(dot matrix|\blq[- ]?\d+|\blx[- ]?\d+|\bmsp[- ]?\d+)/i.test(text)) {
    return {
      category: "Dot Matrix Printer",
      categoryBadge: "Dot Matrix",
      iconType: "matrix"
    };
  }

  // 6. Large Format Plotter / CAD / Banner
  if (/(designjet|imageprograf|surecolor|plotter)/i.test(text)) {
    return {
      category: "Large Format Plotter",
      categoryBadge: "Plotter / CAD",
      iconType: "plotter"
    };
  }

  // 7. General External Hardware Printer
  return {
    category: "External Hardware Printer",
    categoryBadge: "Hardware Printer",
    iconType: "printer"
  };
}

/**
 * Detect connection interface (USB, Wi-Fi/LAN, WSD, Bluetooth, Serial/Parallel)
 */
function detectConnectionInterface(port, isNetwork) {
  const p = (port || "").toLowerCase();
  if (/usb|dot4/i.test(p)) return "USB Direct Cable";
  if (/^wsd/i.test(p)) return "Wi-Fi / LAN (WSD)";
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|ip_|tcp/i.test(p) || isNetwork) return "Ethernet / Wi-Fi (IP)";
  if (/bth|bluetooth/i.test(p)) return "Bluetooth Wireless";
  if (/lpt|com/i.test(p)) return "Serial / Parallel Port";
  return "Local Hardware Port";
}

/**
 * Query real external hardware printers installed and connected to this device/operating system
 */
function getSystemPrinters(callback) {
  const isWin = process.platform === "win32";
  if (isWin) {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, DeviceID, DriverName, PortName, PrinterStatus, Default, WorkOffline, Local, Network | ConvertTo-Json"`;
    exec(cmd, { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) {
        return callback(null, [], []);
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        const formatted = list.map(p => {
          const name = p.Name || p.DeviceID || "Unknown Device";
          const port = p.PortName || "Local";
          const driver = p.DriverName || "Standard Driver";
          const isVirtual = isVirtualPrinterDevice(name, driver, port);
          const isExternal = !isVirtual;
          const classification = classifyPrinterDevice(name, driver);
          const connInterface = detectConnectionInterface(port, !!p.Network);

          return {
            id: (p.DeviceID || name).replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase(),
            name: name,
            driver: driver,
            port: port,
            isDefault: !!p.Default,
            isOffline: !!p.WorkOffline,
            isLocal: !!p.Local,
            isNetwork: !!p.Network,
            isVirtual: isVirtual,
            isExternal: isExternal,
            category: classification.category,
            categoryBadge: classification.categoryBadge,
            iconType: classification.iconType,
            connectionInterface: connInterface,
            type: isExternal ? classification.category : "Virtual Spooler",
            status: p.WorkOffline ? "Offline" : "Online / Ready"
          };
        });

        // Filter: show ONLY real external hardware printer devices
        const externalOnly = formatted.filter(p => p.isExternal);
        callback(null, externalOnly, formatted);
      } catch (e) {
        callback(null, [], []);
      }
    });
  } else {
    exec("lpstat -p 2>/dev/null", { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout) return callback(null, [], []);
      const lines = stdout.split("\n");
      const list = [];
      lines.forEach(l => {
        const m = l.match(/printer\s+([^\s]+)\s+is\s+(idle|printing|disabled)/i);
        if (m) {
          const name = m[1];
          const isVirtual = isVirtualPrinterDevice(name, "CUPS Driver", "Network / Local");
          if (!isVirtual) {
            const classification = classifyPrinterDevice(name, "CUPS Driver");
            list.push({
              id: name.toLowerCase(),
              name: name,
              driver: "CUPS Driver",
              port: "Network / Local",
              isDefault: false,
              isOffline: m[2] === "disabled",
              isLocal: true,
              isNetwork: true,
              isVirtual: false,
              isExternal: true,
              category: classification.category,
              categoryBadge: classification.categoryBadge,
              iconType: classification.iconType,
              connectionInterface: "Ethernet / Wi-Fi (IP)",
              type: classification.category,
              status: m[2] === "disabled" ? "Offline" : "Online / Ready"
            });
          }
        }
      });
      callback(null, list, list);
    });
  }
}

// In-memory and file-persisted store status store
const STORE_STATUS_FILE = path.join(__dirname, "store_status.json");
let storeStatusMap = {};
try {
  if (fs.existsSync(STORE_STATUS_FILE)) {
    storeStatusMap = JSON.parse(fs.readFileSync(STORE_STATUS_FILE, "utf-8"));
  }
} catch (e) {
  storeStatusMap = {};
}

// In-memory heartbeat tracker for presence detection (auto-close on exit / inactivity)
const storeHeartbeats = {}; // centerKey (lower) -> timestamp (ms)

// Centralized persistent Unique ID registry (Starting at 1,000,000 / 1M)
const UNIQUE_IDS_FILE = path.join(__dirname, "unique_ids.json");
let uniqueIdsData = { nextUid: 1000000, mappings: {} };
try {
  if (fs.existsSync(UNIQUE_IDS_FILE)) {
    uniqueIdsData = JSON.parse(fs.readFileSync(UNIQUE_IDS_FILE, "utf-8"));
  }
} catch (e) {
  uniqueIdsData = { nextUid: 1000000, mappings: {} };
}
if (!uniqueIdsData.nextUid || uniqueIdsData.nextUid < 1000000) {
  uniqueIdsData.nextUid = 1000000;
}
if (!uniqueIdsData.mappings) {
  uniqueIdsData.mappings = {};
}

function getOrAssignUniqueId(identifier, details = {}) {
  const cleanKey = String(identifier || "").trim().toLowerCase();
  const emailKey = details.email ? String(details.email).trim().toLowerCase() : "";
  const uidKey = details.uid ? String(details.uid).trim() : "";
  const centerIdKey = details.centerId ? String(details.centerId).trim() : "";
  const nameKey = (details.displayName || details.storeName || details.userName || "").trim().toLowerCase();
  const phoneKey = details.phone ? String(details.phone).replace(/\D/g, '') : "";

  // 1. Look for existing mapping across any provided key
  const searchKeys = [cleanKey, emailKey, uidKey, centerIdKey, nameKey, phoneKey].filter(Boolean);
  for (const k of searchKeys) {
    if (uniqueIdsData.mappings[k]) {
      const existingUid = String(uniqueIdsData.mappings[k]);
      for (const sk of searchKeys) {
        uniqueIdsData.mappings[sk] = existingUid;
      }
      return existingUid;
    }
  }

  // 2. Check storeRegistryMap for existing store record
  for (const store of Object.values(storeRegistryMap)) {
    if (store && store.uniqueId && Number(store.uniqueId) >= 1000000) {
      const match = searchKeys.some(k => 
        (store.centerId && store.centerId.toLowerCase() === k.toLowerCase()) ||
        (store.publicId && store.publicId.toLowerCase() === k.toLowerCase()) ||
        (store.phone && store.phone.replace(/\D/g, '') === k.replace(/\D/g, '')) ||
        (store.storeName && store.storeName.toLowerCase() === k.toLowerCase()) ||
        (store.name && store.name.toLowerCase() === k.toLowerCase())
      );
      if (match) {
        const storeUid = String(store.uniqueId);
        for (const sk of searchKeys) {
          uniqueIdsData.mappings[sk] = storeUid;
        }
        return storeUid;
      }
    }
  }

  // 3. Assign next sequential unique ID starting from 1M (1,000,000)
  let currentSeq = parseInt(uniqueIdsData.nextUid, 10);
  if (isNaN(currentSeq) || currentSeq < 1000000) {
    currentSeq = 1000000;
  }

  const existingValues = new Set(Object.values(uniqueIdsData.mappings));
  while (existingValues.has(String(currentSeq))) {
    currentSeq++;
  }

  const assignedUid = String(currentSeq);
  uniqueIdsData.nextUid = currentSeq + 1;

  for (const sk of searchKeys) {
    uniqueIdsData.mappings[sk] = assignedUid;
  }

  try {
    fs.writeFileSync(UNIQUE_IDS_FILE, JSON.stringify(uniqueIdsData, null, 2), "utf-8");
  } catch (e) {
    console.warn("Could not save unique_ids.json:", e.message);
  }

  return assignedUid;
}

// In-memory and file-persisted store registry (for instant <1s QR scan resolution)
const STORE_REGISTRY_FILE = path.join(__dirname, "store_registry.json");
let storeRegistryMap = {};
try {
  if (fs.existsSync(STORE_REGISTRY_FILE)) {
    storeRegistryMap = JSON.parse(fs.readFileSync(STORE_REGISTRY_FILE, "utf-8"));
  }
} catch (e) {
  storeRegistryMap = {};
}

// In-memory and file-persisted store jobs repository (without storing raw customer files)
const STORE_JOBS_FILE = path.join(__dirname, "store_jobs.json");
let storeJobsList = [];
try {
  if (fs.existsSync(STORE_JOBS_FILE)) {
    storeJobsList = JSON.parse(fs.readFileSync(STORE_JOBS_FILE, "utf-8"));
    if (!Array.isArray(storeJobsList)) storeJobsList = [];
  }
} catch (e) {
  storeJobsList = [];
}

function saveStoreJobsFile() {
  try {
    fs.writeFileSync(STORE_JOBS_FILE, JSON.stringify(storeJobsList, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not save store_jobs.json:", err.message);
  }
}

function getJobsForCenter(centerId) {
  if (!centerId) return [];
  const cleanId = String(centerId).trim().toLowerCase();

  // Find all alias IDs for this store from storeRegistryMap
  const targetIds = new Set([cleanId]);
  const regStore = Object.values(storeRegistryMap).find(c =>
    (c.centerId && c.centerId.toLowerCase() === cleanId) ||
    (c.publicId && c.publicId.toLowerCase() === cleanId) ||
    (c.uniqueId && String(c.uniqueId).toLowerCase() === cleanId)
  );

  if (regStore) {
    if (regStore.centerId) targetIds.add(regStore.centerId.toLowerCase());
    if (regStore.publicId) targetIds.add(regStore.publicId.toLowerCase());
    if (regStore.uniqueId) targetIds.add(String(regStore.uniqueId).toLowerCase());
  }

  // Filter jobs strictly matching this store's identifiers (Store 1 only sees Store 1)
  return storeJobsList.filter(job => {
    if (!job.centerId) return false;
    return targetIds.has(String(job.centerId).trim().toLowerCase());
  });
}

// Default store initialization if registry is empty (default starts CLOSED)
if (!storeRegistryMap["default"] && Object.keys(storeRegistryMap).length === 0) {
  const defaultStore = {
    centerId: "center_default",
    publicId: "CTR-1000000",
    uniqueId: "1000000",
    name: "SmartPrint Xerox & Digital Store",
    storeName: "SmartPrint Xerox & Digital Store",
    address: "Counter Pickup, Main Branch",
    phone: "+91 98765 43210",
    rates: { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
    isOpen: false,
    status: "closed",
    updatedAt: new Date().toISOString()
  };
  storeRegistryMap["default"] = defaultStore;
  storeRegistryMap["center_default"] = defaultStore;
  storeRegistryMap["CTR-1000000"] = defaultStore;
  storeRegistryMap["1000000"] = defaultStore;
  try {
    fs.writeFileSync(STORE_REGISTRY_FILE, JSON.stringify(storeRegistryMap, null, 2), "utf-8");
  } catch(e) {}
}

// Active Server-Sent Events (SSE) subscribers map for real-time 0ms status push
const sseSubscribers = new Map();

function addSseSubscriber(cleanCenterId, res) {
  if (!cleanCenterId) return;
  const key = String(cleanCenterId).trim().toLowerCase();
  if (!sseSubscribers.has(key)) {
    sseSubscribers.set(key, new Set());
  }
  sseSubscribers.get(key).add(res);
}

function removeSseSubscriber(cleanCenterId, res) {
  if (!cleanCenterId) return;
  const key = String(cleanCenterId).trim().toLowerCase();
  if (sseSubscribers.has(key)) {
    sseSubscribers.get(key).delete(res);
    if (sseSubscribers.get(key).size === 0) {
      sseSubscribers.delete(key);
    }
  }
}

function broadcastStoreStatusSse(centerId, isOpen, status, updatedAt) {
  const cleanId = String(centerId || "").trim().toLowerCase();
  const payload = JSON.stringify({
    centerId: centerId,
    isOpen: !!isOpen,
    status: isOpen ? "active" : "closed",
    updatedAt: updatedAt || new Date().toISOString()
  });
  const sseMsg = `data: ${payload}\n\n`;

  const targetKeys = new Set();
  if (cleanId) targetKeys.add(cleanId);

  // Link aliases from store registry for this store
  const regStore = Object.values(storeRegistryMap).find(c =>
    (c.centerId && c.centerId.toLowerCase() === cleanId) ||
    (c.publicId && c.publicId.toLowerCase() === cleanId) ||
    (c.uniqueId && String(c.uniqueId).toLowerCase() === cleanId)
  );

  if (regStore) {
    if (regStore.centerId) targetKeys.add(regStore.centerId.toLowerCase());
    if (regStore.publicId) targetKeys.add(regStore.publicId.toLowerCase());
    if (regStore.uniqueId) targetKeys.add(String(regStore.uniqueId).toLowerCase());
  }

  targetKeys.forEach(k => {
    const clients = sseSubscribers.get(k);
    if (clients) {
      clients.forEach(clientRes => {
        try {
          clientRes.write(sseMsg);
        } catch (e) {
          clients.delete(clientRes);
        }
      });
    }
  });
}

function getStoreStatusRecord(centerId) {
  const now = Date.now();
  if (centerId && centerId !== "default" && centerId !== "_default" && centerId !== "all") {
    const cleanId = String(centerId).trim().toLowerCase();
    const key = Object.keys(storeStatusMap).find(k => k.toLowerCase() === cleanId);
    let record = (key && storeStatusMap[key]) ? { ...storeStatusMap[key] } : null;

    if (!record) {
      // Check alias matching in storeRegistryMap
      const regStore = Object.values(storeRegistryMap).find(c => 
        (c.centerId && c.centerId.toLowerCase() === cleanId) ||
        (c.publicId && c.publicId.toLowerCase() === cleanId) ||
        (c.uniqueId && String(c.uniqueId).toLowerCase() === cleanId) ||
        (c.storeName && c.storeName.toLowerCase() === cleanId) ||
        (c.name && c.name.toLowerCase() === cleanId)
      );
      if (regStore) {
        if (regStore.publicId && storeStatusMap[regStore.publicId]) record = { ...storeStatusMap[regStore.publicId] };
        else if (regStore.centerId && storeStatusMap[regStore.centerId]) record = { ...storeStatusMap[regStore.centerId] };
        else if (regStore.uniqueId && storeStatusMap[String(regStore.uniqueId)]) record = { ...storeStatusMap[String(regStore.uniqueId)] };
        else if (typeof regStore.isOpen === 'boolean') {
          record = {
            isOpen: regStore.isOpen,
            status: regStore.status || (regStore.isOpen ? "active" : "closed"),
            updatedAt: regStore.updatedAt || new Date().toISOString()
          };
        }
      }
    }

    // Default is strictly CLOSED if never registered or recorded
    if (!record) {
      return { isOpen: false, status: "closed", updatedAt: new Date().toISOString() };
    }

    // Auto-close check: If store was marked open, verify active presence heartbeat
    if (record.isOpen) {
      const lastBeat = storeHeartbeats[cleanId] || 
        (storeRegistryMap[cleanId]?.centerId && storeHeartbeats[storeRegistryMap[cleanId].centerId.toLowerCase()]) ||
        (storeRegistryMap[cleanId]?.publicId && storeHeartbeats[storeRegistryMap[cleanId].publicId.toLowerCase()]) ||
        (storeRegistryMap[cleanId]?.uniqueId && storeHeartbeats[String(storeRegistryMap[cleanId].uniqueId).toLowerCase()]);
      
      // If heartbeats were not sent or last beat was >30 seconds ago, store is CLOSED
      if (!lastBeat || (now - lastBeat > 30000)) {
        record.isOpen = false;
        record.status = "closed";
        record.autoClosed = true;
        record.updatedAt = new Date().toISOString();
        saveStoreStatusRecord(cleanId, false, "closed");
      }
    }

    return record;
  }

  // Fallback for default / unassigned query only (strictly closed by default)
  let defRecord = storeStatusMap["_default"] || storeStatusMap["default"];
  if (!defRecord) {
    const defaultStore = storeRegistryMap["default"] || storeRegistryMap["center_default"];
    if (defaultStore && typeof defaultStore.isOpen === 'boolean') {
      defRecord = {
        isOpen: defaultStore.isOpen,
        status: defaultStore.status || (defaultStore.isOpen ? "active" : "closed"),
        updatedAt: defaultStore.updatedAt || new Date().toISOString()
      };
    } else {
      defRecord = { isOpen: false, status: "closed", updatedAt: new Date().toISOString() };
    }
  }

  if (defRecord && defRecord.isOpen) {
    const lastBeat = storeHeartbeats["default"] || storeHeartbeats["_default"] || storeHeartbeats["center_default"];
    if (!lastBeat || (now - lastBeat > 30000)) {
      defRecord = {
        ...defRecord,
        isOpen: false,
        status: "closed",
        autoClosed: true,
        updatedAt: new Date().toISOString()
      };
      saveStoreStatusRecord("default", false, "closed");
    }
  }

  return defRecord;
}

function getStoreRecord(centerQuery) {
  const query = (centerQuery || "").trim().toLowerCase();
  let found = null;
  if (query && query !== "default" && query !== "_default") {
    const key = Object.keys(storeRegistryMap).find(k => k.toLowerCase() === query);
    if (key) found = storeRegistryMap[key];

    if (!found) {
      found = Object.values(storeRegistryMap).find(c => 
        (c.centerId && c.centerId.toLowerCase() === query) ||
        (c.publicId && c.publicId.toLowerCase() === query) ||
        (c.uniqueId && String(c.uniqueId).toLowerCase() === query) ||
        (c.storeName && c.storeName.toLowerCase() === query) ||
        (c.name && c.name.toLowerCase() === query)
      );
    }
  }

  // Fallback only if query is empty or explicitly 'default'
  if (!found && (!query || query === 'default' || query === '_default')) {
    found = storeRegistryMap["default"] || storeRegistryMap["center_default"] || null;
  }

  if (found) {
    const statusRecord = getStoreStatusRecord(found.publicId || found.centerId || centerQuery);
    return {
      ...found,
      isOpen: statusRecord.isOpen,
      status: statusRecord.status
    };
  }

  return null;
}

function saveStoreRecord(centerData) {
  if (!centerData) return null;
  const rawUid = centerData.uniqueId;
  const assignedUid = (rawUid && Number(rawUid) >= 1000000 && String(rawUid) !== "1000000")
    ? String(rawUid)
    : getOrAssignUniqueId(centerData.centerId || centerData.publicId, {
        uid: centerData.ownerUid || centerData.uid,
        email: centerData.email || centerData.ownerEmail,
        centerId: centerData.centerId,
        storeName: centerData.storeName || centerData.name,
        userName: centerData.userName,
        phone: centerData.phone
      });

  const publicId = centerData.publicId || ('CTR-' + assignedUid);
  const record = {
    centerId: centerData.centerId || publicId,
    publicId: publicId,
    uniqueId: assignedUid,
    name: centerData.storeName || centerData.name || 'SmartPrint Xerox Center',
    storeName: centerData.storeName || centerData.name || 'SmartPrint Xerox Center',
    userName: centerData.userName || '',
    address: centerData.address || 'Counter Pickup',
    phone: centerData.phone || '',
    email: centerData.email || centerData.ownerEmail || '',
    rates: centerData.rates || { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
    isOpen: centerData.isOpen !== false && centerData.status !== 'closed',
    status: (centerData.isOpen !== false && centerData.status !== 'closed') ? 'active' : 'closed',
    updatedAt: new Date().toISOString()
  };

  storeRegistryMap[record.centerId] = record;
  storeRegistryMap[record.publicId] = record;
  storeRegistryMap[record.uniqueId] = record;
  storeRegistryMap[record.centerId.toLowerCase()] = record;
  storeRegistryMap[record.publicId.toLowerCase()] = record;
  
  if (record.storeName) {
    storeRegistryMap[record.storeName.toLowerCase()] = record;
  }

  if (!storeRegistryMap["default"] || record.centerId === "center_default" || record.publicId === "CTR-1000000" || record.publicId === "CTR-100000") {
    storeRegistryMap["default"] = record;
  }

  try {
    fs.writeFileSync(STORE_REGISTRY_FILE, JSON.stringify(storeRegistryMap, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not save store_registry.json:", err.message);
  }

  saveStoreStatusRecord(record.publicId, record.isOpen, record.status);
  return record;
}

function saveStoreStatusRecord(centerId, isOpen, status) {
  const record = {
    isOpen: !!isOpen,
    status: isOpen ? "active" : "closed",
    updatedAt: new Date().toISOString()
  };

  const cleanId = centerId ? String(centerId).trim() : "";
  const now = Date.now();

  if (cleanId) {
    storeStatusMap[cleanId] = record;
    storeStatusMap[cleanId.toLowerCase()] = record;

    if (isOpen) {
      storeHeartbeats[cleanId.toLowerCase()] = now;
      storeHeartbeats[cleanId] = now;
    } else {
      delete storeHeartbeats[cleanId.toLowerCase()];
      delete storeHeartbeats[cleanId];
    }

    // Link aliases from store registry for THIS store only
    const regStore = Object.values(storeRegistryMap).find(c => 
      (c.centerId && c.centerId.toLowerCase() === cleanId.toLowerCase()) ||
      (c.publicId && c.publicId.toLowerCase() === cleanId.toLowerCase()) ||
      (c.uniqueId && String(c.uniqueId).toLowerCase() === cleanId.toLowerCase())
    );
    if (regStore) {
      if (regStore.centerId) {
        storeStatusMap[regStore.centerId] = record;
        storeStatusMap[regStore.centerId.toLowerCase()] = record;
        if (isOpen) storeHeartbeats[regStore.centerId.toLowerCase()] = now;
        else delete storeHeartbeats[regStore.centerId.toLowerCase()];
      }
      if (regStore.publicId) {
        storeStatusMap[regStore.publicId] = record;
        storeStatusMap[regStore.publicId.toLowerCase()] = record;
        if (isOpen) storeHeartbeats[regStore.publicId.toLowerCase()] = now;
        else delete storeHeartbeats[regStore.publicId.toLowerCase()];
      }
      if (regStore.uniqueId) {
        storeStatusMap[String(regStore.uniqueId)] = record;
        if (isOpen) storeHeartbeats[String(regStore.uniqueId).toLowerCase()] = now;
        else delete storeHeartbeats[String(regStore.uniqueId).toLowerCase()];
      }
      regStore.isOpen = record.isOpen;
      regStore.status = record.status;
      regStore.updatedAt = record.updatedAt;

      // Only if this specific store is the default center, update default keys
      if (regStore.centerId === "center_default" || regStore.publicId === "CTR-1000000" || regStore.publicId === "CTR-100000" || cleanId.toLowerCase() === "default") {
        storeStatusMap["default"] = record;
        storeStatusMap["_default"] = record;
      }
    } else if (cleanId.toLowerCase() === "default" || cleanId.toLowerCase() === "_default") {
      storeStatusMap["default"] = record;
      storeStatusMap["_default"] = record;
    }
  } else {
    storeStatusMap["_default"] = record;
    storeStatusMap["default"] = record;
  }

  try {
    fs.writeFileSync(STORE_STATUS_FILE, JSON.stringify(storeStatusMap, null, 2), "utf-8");
  } catch (err) {
    console.warn("Could not save store_status.json:", err.message);
  }
  try {
    fs.writeFileSync(STORE_REGISTRY_FILE, JSON.stringify(storeRegistryMap, null, 2), "utf-8");
  } catch (err) {}

  // Instant 0ms Server-Sent Events (SSE) broadcast to all listening customer devices and QR scanners
  broadcastStoreStatusSse(cleanId, record.isOpen, record.status, record.updatedAt);

  return record;
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    });
    res.end();
    return;
  }

  // Dynamic /__env.js endpoint delivering client-safe environment variables
  if (pathname === "/__env.js") {
    const clientEnv = {
      FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "",
      FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || "smartprint-idea.firebaseapp.com",
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "smartprint-idea",
      FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || "smartprint-idea.appspot.com",
      FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || "",
      SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL || "admin@smartprint.io",
      SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD || "",
      NODE_ENV: process.env.NODE_ENV || "production"
    };

    const jsContent = `window.__ENV__ = ${JSON.stringify(clientEnv, null, 2)};`;
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache"
    });
    res.end(jsContent);
    return;
  }

  // Dynamic API endpoint: Authoritative Unique ID assignment starting from 1M (1,000,000)
  if (pathname === "/api/user/unique-id") {
    let uidQuery = parsedUrl.searchParams.get("uid") || "";
    let emailQuery = parsedUrl.searchParams.get("email") || "";
    let centerQuery = parsedUrl.searchParams.get("centerId") || "";
    let nameQuery = parsedUrl.searchParams.get("displayName") || parsedUrl.searchParams.get("storeName") || "";
    let phoneQuery = parsedUrl.searchParams.get("phone") || "";

    const handleUidRequest = (data = {}) => {
      const uid = data.uid || uidQuery;
      const email = data.email || emailQuery;
      const centerId = data.centerId || centerQuery;
      const displayName = data.displayName || data.storeName || nameQuery;
      const phone = data.phone || phoneQuery;

      const primaryKey = uid || email || centerId || phone || displayName || "default_operator";
      const assignedUniqueId = getOrAssignUniqueId(primaryKey, {
        uid,
        email,
        centerId,
        displayName,
        phone
      });

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      });
      res.end(JSON.stringify({
        success: true,
        uniqueId: assignedUniqueId,
        publicId: "CTR-" + assignedUniqueId
      }));
    };

    if (req.method === "POST") {
      let bodyData = "";
      req.on("data", chunk => { bodyData += chunk; if (bodyData.length > 1e5) req.destroy(); });
      req.on("end", () => {
        let b = {};
        try { b = JSON.parse(bodyData || "{}"); } catch(e) {}
        handleUidRequest(b);
      });
    } else {
      handleUidRequest();
    }
    return;
  }

  // Dynamic API endpoint: Live Store Presence Heartbeat (Keepalive for Open Stores)
  if (pathname === "/api/store/heartbeat") {
    const centerQuery = parsedUrl.searchParams.get("center") || "";
    const uidQuery = parsedUrl.searchParams.get("uniqueId") || "";
    let bodyData = "";
    req.on("data", chunk => { bodyData += chunk; if (bodyData.length > 1e5) req.destroy(); });
    req.on("end", () => {
      let parsedBody = {};
      try { parsedBody = JSON.parse(bodyData || "{}"); } catch(e) {}
      const cid = parsedBody.centerId || centerQuery;
      const uid = parsedBody.uniqueId || uidQuery;
      const now = Date.now();
      if (cid) {
        storeHeartbeats[cid.toLowerCase()] = now;
        storeHeartbeats[cid] = now;
      }
      if (uid) {
        storeHeartbeats[String(uid).toLowerCase()] = now;
        storeHeartbeats[String(uid)] = now;
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      });
      res.end(JSON.stringify({ success: true, timestamp: now }));
    });
    return;
  }

  // Dynamic Server-Sent Events (SSE) Live Store Status Stream (0ms real-time push for QR customers)
  if (pathname === "/api/store/live-status") {
    const centerQuery = (parsedUrl.searchParams.get("center") || "").trim();
    const cleanCenter = centerQuery.toLowerCase();

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no"
    });

    // Send immediate initial authoritative status
    const currentStatus = getStoreStatusRecord(centerQuery);
    res.write(`data: ${JSON.stringify({
      centerId: centerQuery || "default",
      isOpen: currentStatus.isOpen,
      status: currentStatus.status,
      updatedAt: currentStatus.updatedAt
    })}\n\n`);

    // Register subscriber for cleanCenter and any known aliases
    const regStore = Object.values(storeRegistryMap).find(c =>
      (c.centerId && c.centerId.toLowerCase() === cleanCenter) ||
      (c.publicId && c.publicId.toLowerCase() === cleanCenter) ||
      (c.uniqueId && String(c.uniqueId).toLowerCase() === cleanCenter)
    );

    const keysToSubscribe = [cleanCenter];
    if (regStore) {
      if (regStore.centerId) keysToSubscribe.push(regStore.centerId.toLowerCase());
      if (regStore.publicId) keysToSubscribe.push(regStore.publicId.toLowerCase());
      if (regStore.uniqueId) keysToSubscribe.push(String(regStore.uniqueId).toLowerCase());
    }

    keysToSubscribe.forEach(k => {
      if (k) addSseSubscriber(k, res);
    });

    // Keepalive ping every 15s to keep connection alive
    const pingInterval = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch (e) {
        clearInterval(pingInterval);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(pingInterval);
      keysToSubscribe.forEach(k => {
        if (k) removeSseSubscriber(k, res);
      });
    });

    return;
  }

  // Dynamic API endpoint: Live Store Status (Open / Closed)
  if (pathname === "/api/store/status") {
    if (req.method === "GET") {
      const centerQuery = parsedUrl.searchParams.get("center") || "";
      const record = getStoreStatusRecord(centerQuery);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      });
      res.end(JSON.stringify({
        success: true,
        centerId: centerQuery || "default",
        isOpen: record.isOpen,
        status: record.status,
        updatedAt: record.updatedAt
      }));
      return;
    }

    if (req.method === "POST") {
      let bodyData = "";
      req.on("data", chunk => {
        bodyData += chunk;
        if (bodyData.length > 1e6) {
          req.destroy();
        }
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(bodyData || "{}");
          const isOpen = body.isOpen !== false && body.status !== "closed";
          const status = isOpen ? "active" : "closed";
          const centerId = body.centerId || body.publicId || "";
          const saved = saveStoreStatusRecord(centerId, isOpen, status);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
          });
          res.end(JSON.stringify({
            success: true,
            centerId: centerId || "all",
            isOpen: saved.isOpen,
            status: saved.status,
            updatedAt: saved.updatedAt
          }));
        } catch (err) {
          res.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // Dynamic API endpoint: Live Store Center Profile & Info (For instant <1s QR scan resolution across devices)
  if (pathname === "/api/store/center" || pathname === "/api/store/sync") {
    if (req.method === "GET") {
      const centerQuery = parsedUrl.searchParams.get("center") || "";
      const center = getStoreRecord(centerQuery);
      if (center) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        });
        res.end(JSON.stringify({ success: true, center }));
      } else {
        res.writeHead(404, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        });
        res.end(JSON.stringify({ success: false, error: "CENTER_NOT_FOUND" }));
      }
      return;
    }

    if (req.method === "POST") {
      let bodyData = "";
      req.on("data", chunk => {
        bodyData += chunk;
        if (bodyData.length > 1e6) req.destroy();
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(bodyData || "{}");
          const saved = saveStoreRecord(body);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
          });
          res.end(JSON.stringify({ success: true, center: saved }));
        } catch (err) {
          res.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // Dynamic API endpoint: Store-isolated Customer Jobs & History (Metadata only - files are never stored)
  if (pathname === "/api/jobs") {
    if (req.method === "GET") {
      const centerQuery = parsedUrl.searchParams.get("center") || "";
      const jobs = getJobsForCenter(centerQuery);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      });
      res.end(JSON.stringify({ success: true, count: jobs.length, jobs }));
      return;
    }

    if (req.method === "POST") {
      let bodyData = "";
      req.on("data", chunk => {
        bodyData += chunk;
        if (bodyData.length > 2e6) req.destroy();
      });
      req.on("end", () => {
        try {
          const body = JSON.parse(bodyData || "{}");
          if (!body.centerId) {
            res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ success: false, error: "centerId is required" }));
            return;
          }

          // Random customer ID generation: e.g. CUST-682941
          const randomCustNum = Math.floor(100000 + Math.random() * 900000);
          const customerId = body.customerId || `CUST-${randomCustNum}`;

          // File privacy: Ensure NO file binary, base64 dataUrl, or raw file blob is saved
          delete body.dataUrl;
          delete body.fileData;
          delete body.rawFile;

          const newJob = {
            jobId: body.jobId || `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            customerId: customerId,
            centerId: body.centerId,
            trackingToken: body.trackingToken || `XP-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
            createdAt: body.createdAt || new Date().toISOString(),
            submittedAt: body.submittedAt || body.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            pageCount: Number(body.pageCount) || 1,
            copies: Number(body.copies) || 1,
            estimatedAmount: Number(body.estimatedAmount) || 0,
            paidAmount: Number(body.paidAmount != null ? body.paidAmount : body.estimatedAmount) || 0,
            amountPaise: Number(body.amountPaise) || Math.round((Number(body.paidAmount != null ? body.paidAmount : body.estimatedAmount) || 0) * 100),
            originalFileName: body.originalFileName || "Document",
            fileCount: Number(body.fileCount) || 1,
            files: (body.files || []).map(f => ({
              name: f.name || "Document",
              size: f.size || 0,
              type: f.type || "application/pdf",
              estimatedPages: f.estimatedPages || 1,
              isCameraScan: !!f.isCameraScan
            })),
            storagePath: null, // Files are NEVER stored in database or storage
            paperSize: body.paperSize || "A4",
            colorMode: body.colorMode || "monochrome",
            duplex: !!body.duplex,
            paymentMethod: body.paymentMethod || "cash",
            paymentStatus: body.paymentStatus || "pending",
            status: body.status || "pending_confirmation",
            customerNote: body.customerNote ? String(body.customerNote).substring(0, 200) : "",
            routedPrinter: body.routedPrinter || null
          };

          // Tenant isolation: Save job into storeJobsList
          storeJobsList.unshift(newJob);
          saveStoreJobsFile();

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
          });
          res.end(JSON.stringify({ success: true, job: newJob }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // Dynamic API endpoint: Update Job Status (Order progression by Center Owner)
  if (pathname === "/api/jobs/update-status" && req.method === "POST") {
    let bodyData = "";
    req.on("data", chunk => {
      bodyData += chunk;
      if (bodyData.length > 1e5) req.destroy();
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(bodyData || "{}");
        const { jobId, status, centerId, routedPrinter } = body;
        const job = storeJobsList.find(j => j.jobId === jobId);
        if (!job) {
          res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ success: false, error: "Job not found" }));
          return;
        }

        if (status) job.status = status;
        if (status === "completed") job.completedAt = new Date().toISOString();
        if (status === "payment_confirmed") job.paymentStatus = "paid";
        if (routedPrinter) job.routedPrinter = routedPrinter;
        job.updatedAt = new Date().toISOString();

        saveStoreJobsFile();

        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ success: true, job }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Dynamic API endpoint: Real connected external printers on this device
  if (pathname === "/api/system/printers") {
    getSystemPrinters((err, externalPrinters, allPrinters) => {
      const list = externalPrinters || [];
      const all = allPrinters || [];
      const virtualFiltered = all.filter(p => p.isVirtual).map(p => p.name);

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      });
      res.end(JSON.stringify({
        success: true,
        filter: "external_hardware_only",
        count: list.length,
        printers: list,
        totalPrintersDetected: all.length,
        virtualSpoolersExcluded: virtualFiltered,
        timestamp: new Date().toISOString()
      }));
    });
    return;
  }

  // Routing rewrites matching firebase.json
  if (pathname.startsWith("/c/")) {
    pathname = `/customer/index.html`;
  } else if (pathname === "/track") {
    pathname = "/customer/track.html";
  } else if (pathname === "/expired") {
    pathname = "/customer/expired.html";
  } else if (pathname === "/app" || pathname.startsWith("/app/")) {
    const directFile = path.join(PUBLIC_DIR, pathname.endsWith(".html") ? pathname : `${pathname}.html`);
    if (!fs.existsSync(directFile)) {
      pathname = "/app/index.html";
    }
  } else if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const directFile = path.join(PUBLIC_DIR, pathname.endsWith(".html") ? pathname : `${pathname}.html`);
    if (!fs.existsSync(directFile)) {
      pathname = "/admin/index.html";
    }
  } else if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  // Resolve file path
  let filePath = path.join(PUBLIC_DIR, pathname);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/html" });
    res.end("<h1>404 Not Found</h1><p><a href='/'>Return to Home</a></p>");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache"
  });

  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Server running at: http://localhost:${PORT}/`);
});
