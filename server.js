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

// Default store initialization if registry is empty
if (!storeRegistryMap["default"] && Object.keys(storeRegistryMap).length === 0) {
  const defaultStore = {
    centerId: "center_default",
    publicId: "CTR-100000",
    uniqueId: "1000000",
    name: "SmartPrint Xerox & Digital Store",
    storeName: "SmartPrint Xerox & Digital Store",
    address: "Counter Pickup, Main Branch",
    phone: "+91 98765 43210",
    rates: { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
    isOpen: true,
    status: "active",
    updatedAt: new Date().toISOString()
  };
  storeRegistryMap["default"] = defaultStore;
  storeRegistryMap["center_default"] = defaultStore;
  storeRegistryMap["CTR-100000"] = defaultStore;
  storeRegistryMap["1000000"] = defaultStore;
  try {
    fs.writeFileSync(STORE_REGISTRY_FILE, JSON.stringify(storeRegistryMap, null, 2), "utf-8");
  } catch(e) {}
}

function getStoreStatusRecord(centerId) {
  if (centerId && centerId !== "default" && centerId !== "_default" && centerId !== "all") {
    const cleanId = String(centerId).trim().toLowerCase();
    const key = Object.keys(storeStatusMap).find(k => k.toLowerCase() === cleanId);
    if (key && storeStatusMap[key]) return storeStatusMap[key];

    // Check alias matching in storeRegistryMap
    const regStore = Object.values(storeRegistryMap).find(c => 
      (c.centerId && c.centerId.toLowerCase() === cleanId) ||
      (c.publicId && c.publicId.toLowerCase() === cleanId) ||
      (c.uniqueId && String(c.uniqueId).toLowerCase() === cleanId) ||
      (c.storeName && c.storeName.toLowerCase() === cleanId) ||
      (c.name && c.name.toLowerCase() === cleanId)
    );
    if (regStore) {
      if (regStore.publicId && storeStatusMap[regStore.publicId]) return storeStatusMap[regStore.publicId];
      if (regStore.centerId && storeStatusMap[regStore.centerId]) return storeStatusMap[regStore.centerId];
      if (regStore.uniqueId && storeStatusMap[String(regStore.uniqueId)]) return storeStatusMap[String(regStore.uniqueId)];
      if (typeof regStore.isOpen === 'boolean') {
        return {
          isOpen: regStore.isOpen,
          status: regStore.status || (regStore.isOpen ? "active" : "closed"),
          updatedAt: regStore.updatedAt || new Date().toISOString()
        };
      }
    }

    // A specific center was queried that is not recorded yet: return default open for this center
    return { isOpen: true, status: "active", updatedAt: new Date().toISOString() };
  }

  // Fallback for default / unassigned query only
  if (storeStatusMap["_default"]) return storeStatusMap["_default"];
  if (storeStatusMap["default"]) return storeStatusMap["default"];
  const defaultStore = storeRegistryMap["default"] || storeRegistryMap["center_default"];
  if (defaultStore && typeof defaultStore.isOpen === 'boolean') {
    return {
      isOpen: defaultStore.isOpen,
      status: defaultStore.status || (defaultStore.isOpen ? "active" : "closed"),
      updatedAt: defaultStore.updatedAt || new Date().toISOString()
    };
  }

  return { isOpen: true, status: "active", updatedAt: new Date().toISOString() };
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
  const publicId = centerData.publicId || centerData.centerId || ('CTR-' + String(centerData.uniqueId || '100000').substring(0, 6));
  const record = {
    centerId: centerData.centerId || publicId,
    publicId: publicId,
    uniqueId: String(centerData.uniqueId || '1000000'),
    name: centerData.storeName || centerData.name || 'SmartPrint Xerox Center',
    storeName: centerData.storeName || centerData.name || 'SmartPrint Xerox Center',
    address: centerData.address || 'Counter Pickup',
    phone: centerData.phone || '',
    rates: centerData.rates || { bwSingle: 2.0, bwDouble: 3.5, colorSingle: 10.0, colorDouble: 18.0 },
    isOpen: centerData.isOpen !== false && centerData.status !== 'closed',
    status: (centerData.isOpen !== false && centerData.status !== 'closed') ? 'active' : 'closed',
    updatedAt: new Date().toISOString()
  };

  storeRegistryMap[record.centerId] = record;
  storeRegistryMap[record.publicId] = record;
  if (!storeRegistryMap[record.uniqueId] || storeRegistryMap[record.uniqueId].centerId === record.centerId) {
    storeRegistryMap[record.uniqueId] = record;
  }
  if (!storeRegistryMap["default"] || record.centerId === "center_default" || record.publicId === "CTR-100000") {
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
  if (cleanId) {
    storeStatusMap[cleanId] = record;
    storeStatusMap[cleanId.toLowerCase()] = record;

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
      }
      if (regStore.publicId) {
        storeStatusMap[regStore.publicId] = record;
        storeStatusMap[regStore.publicId.toLowerCase()] = record;
      }
      if (regStore.uniqueId) {
        storeStatusMap[String(regStore.uniqueId)] = record;
      }
      regStore.isOpen = record.isOpen;
      regStore.status = record.status;
      regStore.updatedAt = record.updatedAt;

      // Only if this specific store is the default center, update default keys
      if (regStore.centerId === "center_default" || regStore.publicId === "CTR-100000" || cleanId.toLowerCase() === "default") {
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
