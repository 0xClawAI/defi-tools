#!/usr/bin/env node
/**
 * Momentum Alerter
 * Sends alerts to configured channels (Telegram, file, etc.)
 * 
 * Can be run standalone or imported as module
 */

const fs = require('fs');
const path = require('path');

// Alert destinations
const ALERT_CONFIG = {
  telegram: {
    enabled: true,
    chatId: '1543261040',  // Deadly's chat
  },
  file: {
    enabled: true,
    path: path.join(__dirname, 'logs', 'alerts.jsonl'),
  },
  // Webhook for future expansion
  webhook: {
    enabled: false,
    url: null,
  }
};

// Rate limiting to avoid spam
const RATE_LIMIT = {
  perToken: 900000,  // 15 min per token
  global: 60000,     // 1 min global cooldown
};

const sentAlerts = new Map();  // token -> lastAlertTime
let lastGlobalAlert = 0;

// Check if we should send alert
function shouldAlert(tokenAddress) {
  const now = Date.now();
  
  // Global rate limit
  if (now - lastGlobalAlert < RATE_LIMIT.global) {
    return false;
  }
  
  // Per-token rate limit
  const lastSent = sentAlerts.get(tokenAddress) || 0;
  if (now - lastSent < RATE_LIMIT.perToken) {
    return false;
  }
  
  return true;
}

function markAlertSent(tokenAddress) {
  sentAlerts.set(tokenAddress, Date.now());
  lastGlobalAlert = Date.now();
}

// Format alert for different channels
function formatForTelegram(signal) {
  let emoji = '📊';
  if (signal.type === 'HIGH_RATIO') emoji = '🔥';
  if (signal.type === 'SUSTAINED_ACCUMULATION') emoji = '🎯';
  if (signal.type === 'DIP_BUY') emoji = '💰';
  
  let msg = `${emoji} <b>${signal.type}</b>: ${signal.token}\n\n`;
  
  if (signal.ratio) msg += `Ratio: <code>${signal.ratio}x</code>`;
  if (signal.buys !== undefined) msg += ` (${signal.buys}B/${signal.sells}S)`;
  if (signal.window) msg += ` [${signal.window}]`;
  msg += '\n';
  
  if (signal.price) msg += `Price: <code>$${parseFloat(signal.price).toFixed(6)}</code>\n`;
  if (signal.volume24h) msg += `Volume: $${Math.round(signal.volume24h).toLocaleString()}\n`;
  if (signal.liquidity) msg += `Liquidity: $${Math.round(signal.liquidity).toLocaleString()}\n`;
  if (signal.priceChange !== undefined) {
    const arrow = signal.priceChange >= 0 ? '📈' : '📉';
    msg += `Change: ${arrow} ${signal.priceChange?.toFixed(1)}%\n`;
  }
  
  if (signal.address) {
    msg += `\n<a href="https://dexscreener.com/base/${signal.address}">DEXScreener</a>`;
    msg += ` | <a href="https://basescan.org/token/${signal.address}">BaseScan</a>`;
  }
  
  return msg;
}

// Send via Telegram (using OpenClaw message action)
async function sendTelegram(signal) {
  if (!ALERT_CONFIG.telegram.enabled) return false;
  
  const message = formatForTelegram(signal);
  
  // Write to a file that OpenClaw can pick up
  // Or use the message action directly via HTTP
  const alertFile = path.join(__dirname, 'data', 'pending-alerts.json');
  let pending = [];
  try {
    if (fs.existsSync(alertFile)) {
      pending = JSON.parse(fs.readFileSync(alertFile, 'utf8'));
    }
  } catch (e) {}
  
  pending.push({
    channel: 'telegram',
    target: ALERT_CONFIG.telegram.chatId,
    message: message,
    signal: signal,
    createdAt: new Date().toISOString(),
  });
  
  fs.writeFileSync(alertFile, JSON.stringify(pending, null, 2));
  return true;
}

// Log to file
function logToFile(signal) {
  if (!ALERT_CONFIG.file.enabled) return;
  
  const dir = path.dirname(ALERT_CONFIG.file.path);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const entry = JSON.stringify({
    ...signal,
    timestamp: new Date().toISOString(),
  }) + '\n';
  
  fs.appendFileSync(ALERT_CONFIG.file.path, entry);
}

// Main alert function
async function sendAlert(signal) {
  if (!shouldAlert(signal.address)) {
    console.log(`⏸️  Rate limited: ${signal.token}`);
    return false;
  }
  
  logToFile(signal);
  await sendTelegram(signal);
  markAlertSent(signal.address);
  
  console.log(`📨 Alert sent: ${signal.type} - ${signal.token}`);
  return true;
}

// Export for use in scanner
module.exports = { sendAlert, formatForTelegram, shouldAlert };

// CLI mode - process pending alerts
if (require.main === module) {
  const alertFile = path.join(__dirname, 'data', 'pending-alerts.json');
  if (fs.existsSync(alertFile)) {
    const pending = JSON.parse(fs.readFileSync(alertFile, 'utf8'));
    console.log(`Found ${pending.length} pending alerts`);
    pending.forEach(a => console.log(formatForTelegram(a.signal)));
  } else {
    console.log('No pending alerts');
  }
}
