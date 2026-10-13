const { io } = require("socket.io-client");
const fs = require("fs");
const path = require("path");
const ptp = require("pdf-to-printer");
const crypto = require("crypto");

// Load or Create Config
const configPath = path.join(__dirname, 'config.json');
let config = { SHOP_ID: "SHOP_1234", ENCRYPTION_KEY: "SuperSecretKey", SERVER_URL: "http://localhost:5000" };

if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} else {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    console.log("Created default config.json. Please edit it if needed.");
}

// Connect to the WebSocket server
const SERVER_URL = config.SERVER_URL || "http://localhost:5000";
console.log(`Connecting to server: ${SERVER_URL} as Shop: ${config.SHOP_ID}`);
const socket = io(SERVER_URL);

// Create a temp directory for downloads if it doesn't exist
const TEMP_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

socket.on("connect", () => {
  console.log(`Connected with ID: ${socket.id}`);
  socket.emit('register-shop', config.SHOP_ID);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server.");
});

// Listen for print jobs
socket.on("print-job", async (data) => {
  console.log("Received print job:", data);

  const fileUrl = data.url || data.fileUrl;
  let filename = data.filename || `print-${Date.now()}.pdf`;
  
  // Remove the .enc extension added by the frontend
  if (filename.endsWith('.enc')) filename = filename.replace(/\.enc$/, '');

  if (!fileUrl) {
    console.error("Error: No file URL provided in the print job.");
    return;
  }

  const tempFilePath = path.join(TEMP_DIR, filename);

  try {
    console.log(`Downloading encrypted file from: ${fileUrl}`);
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const encryptedBuffer = Buffer.from(arrayBuffer);

    console.log("Decrypting file...");
    // --- E2E DECRYPTION LOGIC (AES-256-CBC) ---
    const iv = encryptedBuffer.subarray(0, 16);
    const encryptedContent = encryptedBuffer.subarray(16);
    
    const salt = Buffer.from("QRPrintSalt2026!");
    const key = crypto.pbkdf2Sync(config.ENCRYPTION_KEY, salt, 100000, 32, 'sha256');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedContent);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    // ------------------------------------------

    // Save the decrypted PDF file to disk
    fs.writeFileSync(tempFilePath, decrypted);
    console.log(`Decrypted file saved to: ${tempFilePath}`);

    // Extract print settings if provided
    const options = data.printSettings || {};
    
    // Construct pdf-to-printer options based on UI selections
    const printOptions = {};
    if (options.copies) printOptions.copies = options.copies;
    if (options.monochrome !== undefined) printOptions.monochrome = options.monochrome;
    if (options.orientation) printOptions.orientation = options.orientation;
    if (options.paperSize) printOptions.paperSize = options.paperSize;
    
    // Automatically select a real physical printer to avoid hanging on "Print to PDF"
    try {
        const printers = await ptp.getPrinters();
        const realPrinter = printers.find(p => p.name && !p.name.includes("PDF") && !p.name.includes("OneNote") && !p.name.includes("Fax"));
        if (realPrinter) {
            printOptions.printer = realPrinter.name;
        }
    } catch (e) {
        console.error("Failed to fetch printers, using default.");
    }

    // Print the file
    const ext = path.extname(tempFilePath).toLowerCase();
    if (ext === '.pdf') {
        console.log("Sending PDF to printer with options:", printOptions);
        await ptp.print(tempFilePath, printOptions);
    } else {
        console.log(`Sending ${ext} to printer via PowerShell...`);
        const { exec } = require('child_process');
        
        let printerArg = "";
        if (printOptions.printer) {
            // Unreliable for Start-Process, but we do our best. 
            // It uses default printer normally, so we will attempt to set default.
            exec(`powershell -Command "(New-Object -ComObject WScript.Network).SetDefaultPrinter('${printOptions.printer}')"`);
        }
        
        exec(`powershell -WindowStyle Hidden -Command "Start-Process -FilePath '${tempFilePath}' -Verb Print"`);
        
        // Wait 5 seconds to allow the print spooler to read the file before we delete it in the finally block
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    console.log("Print job submitted successfully.");

  } catch (error) {
    console.error("Error processing print job:", error.message);
  } finally {
    // Delete the temporary file after a 2-minute delay
    // This allows the Windows print spooler enough time to process the file before it's removed.
    if (fs.existsSync(tempFilePath)) {
      setTimeout(() => {
        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log(`Deleted temporary file: ${tempFilePath}`);
          }
        } catch (cleanupError) {
          console.error("Error deleting temporary file:", cleanupError.message);
        }
      }, 120000); // 2 minutes delay
    }
  }
});
