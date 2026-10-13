/**
 * Vercel Serverless Function: System Printers Endpoint Fallback
 * Returns clean hardware status response for cloud-hosted environments
 */
module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  res.status(200).json({
    success: true,
    filter: "external_hardware_only",
    count: 0,
    printers: [],
    totalPrintersDetected: 0,
    virtualSpoolersExcluded: [],
    isCloudHost: true,
    message: "Cloud environment (Vercel). Connect printers via SmartPrint Desktop Client or run server.js locally on your shop counter PC.",
    timestamp: new Date().toISOString()
  });
};
