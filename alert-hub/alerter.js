#!/usr/bin/env node
/**
 * Alert Hub - Unified alerting for all defi-tools monitors
 * 
 * Features:
 * - Accepts alerts from any monitor
 * - Deduplicates similar alerts (same type+coin within window)
 * - Priority routing (critical = immediate, warning = batched)
 * - Sends to Telegram
 * - Maintains alert history
 */

const fs = require('fs');
const path = require('path');

// === CONFIG ===
const CONFIG = {
  // Deduplication
  DEDUP_WINDOW_MS: 300000,  // 5 minutes - same alert won't repeat
  
  // Telegram (uses OpenClaw's message tool when available)
  TELEGRAM_CHAT_ID: '1543261040',  // Deadly's chat
  
  // Files
  DATA_DIR: path.join(__dirname, 'data'),
  HISTORY_FILE: path.join(__dirname, 'data', 'history.jsonl'),
  QUEUE_FILE: path.join(__dirname, 'data', 'queue.json'),
};

// Recent alerts for deduplication
let recentAlerts = [];

// === CORE ===
function isDuplicate(alert) {
  const now = Date.now();
  const key = `${alert.source}:${alert.type}:${alert.coin || 'global'}`;
  
  // Clean old entries
  recentAlerts = recentAlerts.filter(a => now - a.timestamp < CONFIG.DEDUP_WINDOW_MS);
  
  // Check for duplicate
  const exists = recentAlerts.some(a => a.key === key);
  
  if (!exists) {
    recentAlerts.push({ key, timestamp: now });
    return false;
  }
  
  return true;
}

function formatAlert(alert) {
  const severityIcon = {
    critical: '🚨',
    warning: '⚠️',
    info: '📊',
  }[alert.severity] || 'ℹ️';
  
  const sourceTag = {
    momentum: '📈',
    anomaly: '🔍',
    liquidation: '🔥',
    funding: '💰',
    custom: '🔔',
  }[alert.source] || '📡';
  
  return `${severityIcon} ${sourceTag} ${alert.message}`;
}

async function sendTelegram(message) {
  // Try direct bot API if token available
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (botToken) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CONFIG.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
        }),
      });
      
      if (response.ok) {
        return { success: true, method: 'direct' };
      }
    } catch (error) {
      console.error('Telegram direct send failed:', error.message);
    }
  }
  
  // Fallback: Write to queue for OpenClaw to pick up
  const queue = loadQueue();
  queue.push({
    timestamp: new Date().toISOString(),
    message,
    pending: true,
  });
  saveQueue(queue);
  
  return { success: true, method: 'queued' };
}

// === MAIN FUNCTIONS ===
async function sendAlert(alert) {
  // Validate
  if (!alert.message) {
    console.error('Alert missing message');
    return { success: false, reason: 'missing_message' };
  }
  
  // Set defaults
  alert.source = alert.source || 'custom';
  alert.severity = alert.severity || 'info';
  alert.timestamp = alert.timestamp || new Date().toISOString();
  
  // Check for duplicate
  if (isDuplicate(alert)) {
    console.log(`[DEDUP] Skipped duplicate: ${alert.source}:${alert.type}:${alert.coin || 'global'}`);
    return { success: true, reason: 'deduplicated' };
  }
  
  // Format and send
  const formatted = formatAlert(alert);
  console.log(`[SEND] ${formatted}`);
  
  const result = await sendTelegram(formatted);
  
  // Log to history
  logAlert(alert);
  
  return result;
}

async function sendBatch(alerts) {
  if (!alerts || alerts.length === 0) return { success: true, count: 0 };
  
  // Filter duplicates
  const unique = alerts.filter(a => !isDuplicate(a));
  
  if (unique.length === 0) {
    console.log('[BATCH] All alerts deduplicated');
    return { success: true, count: 0, deduplicated: alerts.length };
  }
  
  // Format batch message
  const header = `📡 ${unique.length} Alert${unique.length > 1 ? 's' : ''}:\n\n`;
  const body = unique.map(a => formatAlert(a)).join('\n');
  
  console.log(`[BATCH] Sending ${unique.length} alerts`);
  
  const result = await sendTelegram(header + body);
  
  // Log all
  for (const alert of unique) {
    logAlert(alert);
  }
  
  return { ...result, count: unique.length };
}

// === PERSISTENCE ===
function logAlert(alert) {
  const line = JSON.stringify({
    ...alert,
    logged: new Date().toISOString(),
  }) + '\n';
  
  fs.appendFileSync(CONFIG.HISTORY_FILE, line);
}

function loadQueue() {
  try {
    if (fs.existsSync(CONFIG.QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.QUEUE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function saveQueue(queue) {
  fs.writeFileSync(CONFIG.QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function getHistory(limit = 50) {
  if (!fs.existsSync(CONFIG.HISTORY_FILE)) return [];
  
  const lines = fs.readFileSync(CONFIG.HISTORY_FILE, 'utf-8').trim().split('\n');
  return lines.slice(-limit).map(l => JSON.parse(l));
}

// === CLI ===
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Ensure data dir exists
  if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  }
  
  switch (command) {
    case 'send':
      // node alerter.js send "message" [severity] [source] [coin]
      const message = args[1];
      if (!message) {
        console.error('Usage: node alerter.js send "message" [severity] [source] [coin]');
        process.exit(1);
      }
      
      await sendAlert({
        message,
        severity: args[2] || 'info',
        source: args[3] || 'custom',
        coin: args[4],
        type: 'manual',
      });
      break;
      
    case 'test':
      // Send test alert
      await sendAlert({
        message: '🧪 Test alert from Alert Hub',
        severity: 'info',
        source: 'custom',
        type: 'test',
      });
      break;
      
    case 'history':
      const limit = parseInt(args[1]) || 20;
      const history = getHistory(limit);
      console.log(`📜 Alert History (last ${history.length}):\n`);
      for (const h of history) {
        console.log(`[${h.timestamp}] ${h.severity.toUpperCase()} ${h.source}: ${h.message}`);
      }
      break;
      
    case 'queue':
      const queue = loadQueue();
      if (queue.length === 0) {
        console.log('Queue is empty');
      } else {
        console.log(`📬 Queued messages: ${queue.length}`);
        for (const q of queue) {
          console.log(`  [${q.timestamp}] ${q.message.substring(0, 50)}...`);
        }
      }
      break;
      
    case 'clear-queue':
      saveQueue([]);
      console.log('Queue cleared');
      break;
      
    default:
      console.log(`
Alert Hub - Unified alerting for defi-tools

Usage:
  node alerter.js send "message" [severity] [source] [coin]
  node alerter.js test       Send test alert
  node alerter.js history    Show recent alerts
  node alerter.js queue      Show pending messages
  node alerter.js clear-queue Clear pending messages

From code:
  const { sendAlert, sendBatch } = require('./alerter');
  
  await sendAlert({
    message: 'ETH funding at -44% APR',
    severity: 'warning',  // critical | warning | info
    source: 'funding',    // momentum | anomaly | liquidation | funding | custom
    coin: 'ETH',
    type: 'extreme_funding',
  });
`);
  }
}

// Export for programmatic use
module.exports = { sendAlert, sendBatch, getHistory };

// Run CLI
if (require.main === module) {
  main().catch(console.error);
}
