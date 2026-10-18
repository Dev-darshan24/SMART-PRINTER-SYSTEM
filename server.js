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

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

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
