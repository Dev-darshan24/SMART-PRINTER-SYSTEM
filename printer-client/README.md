# SmartPrint — Physical Printer Bridge Agent

This optional local agent runs on the Xerox shop's Windows PC connected to physical USB/Network printers. It connects securely to the SmartPrint cloud server or local spooler, receives print jobs, and dispatches them directly via `pdf-to-printer` or PowerShell print verbs without dialog prompts.

## Quick Start
```bash
npm install
npm start
```

## Configuration (`config.json`)
```json
{
  "SHOP_ID": "KOR-7721",
  "ENCRYPTION_KEY": "SuperSecretKey",
  "SERVER_URL": "http://localhost:5000"
}
```
