const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function powershell(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script], { windowsHide:true, maxBuffer:1024*1024 }, (error,stdout,stderr)=>{
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout.trim());
    });
  });
}

function machineId() {
  const macs=[];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list||[]) if (!n.internal && n.mac && n.mac!=='00:00:00:00:00:00') macs.push(n.mac);
  return crypto.createHash('sha256').update([os.hostname(),process.platform,process.arch,...macs.sort()].join('|')).digest('hex');
}

async function listPrinters() {
  if (process.platform !== 'win32') return [];
  const out=await powershell("Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | ConvertTo-Json -Compress");
  if (!out) return [];
  const parsed=JSON.parse(out); return Array.isArray(parsed)?parsed:[parsed];
}

async function listSerialPorts() {
  if (process.platform !== 'win32') return [];
  const out=await powershell("Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name,Description | ConvertTo-Json -Compress");
  if (!out) return [];
  const parsed=JSON.parse(out); return Array.isArray(parsed)?parsed:[parsed];
}

async function printText(printerName,text) {
  if (process.platform !== 'win32') throw new Error('printing_requires_windows');
  if (!printerName) throw new Error('printer_not_configured');
  const file=path.join(os.tmpdir(),`thorpdv-${Date.now()}.txt`); fs.writeFileSync(file,text,'utf8');
  const q=(s)=>String(s).replace(/'/g,"''");
  try { await powershell(`Get-Content -Raw -LiteralPath '${q(file)}' | Out-Printer -Name '${q(printerName)}'`); }
  finally { try{fs.unlinkSync(file);}catch{} }
  return true;
}

module.exports={ machineId,listPrinters,listSerialPorts,printText };
