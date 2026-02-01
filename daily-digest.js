#!/usr/bin/env node
/**
 * Daily Digest - Summary of trading activity and market status
 * 
 * Usage:
 *   node daily-digest.js              # Full digest
 *   node daily-digest.js --telegram   # Format for Telegram
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function loadJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

async function generateDigest(forTelegram = false) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  
  const lines = [];
  const add = (text) => lines.push(text);
  
  // Header
  if (forTelegram) {
    add(`🦞 <b>Daily Digest</b> - ${today}`);
    add('');
  } else {
    add(`\n🦞 Daily Digest - ${today}`);
    add('═'.repeat(40));
  }
  
  // Paper trades
  const paperTrades = loadJson(path.join(__dirname, 'paper-trades.json'));
  if (paperTrades) {
    add(forTelegram ? '<b>📈 Paper Trading</b>' : '\n📈 Paper Trading');
    add(`   Balance: $${paperTrades.currentBalance}`);
    add(`   Trades today: ${paperTrades.trades?.length || 0}`);
  }
  
  // Price alerts
  const priceAlerts = loadJson(path.join(DATA_DIR, 'price-alerts.json'));
  if (priceAlerts?.alerts?.length > 0) {
    add(forTelegram ? '\n<b>⏰ Active Alerts</b>' : '\n⏰ Active Alerts');
    add(`   ${priceAlerts.alerts.length} token(s) being watched`);
  }
  
  // Recent signals
  const signalLog = path.join(__dirname, 'logs', `${today}.json`);
  if (fs.existsSync(signalLog)) {
    try {
      const signals = JSON.parse(fs.readFileSync(signalLog, 'utf-8'));
      if (signals.length > 0) {
        add(forTelegram ? '\n<b>📊 Signals Today</b>' : '\n📊 Signals Today');
        add(`   ${signals.length} signal(s) detected`);
      }
    } catch {}
  }
  
  // Alert history (last 24h)
  const alertHistory = loadJsonl(path.join(__dirname, 'alert-hub', 'data', 'history.jsonl'));
  const recentAlerts = alertHistory.filter(a => a.timestamp >= dayAgo);
  if (recentAlerts.length > 0) {
    add(forTelegram ? '\n<b>🔔 Alerts (24h)</b>' : '\n🔔 Alerts (24h)');
    add(`   ${recentAlerts.length} alert(s) sent`);
    
    // Count by severity
    const bySeverity = {};
    recentAlerts.forEach(a => {
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    });
    Object.entries(bySeverity).forEach(([sev, count]) => {
      add(`   - ${sev}: ${count}`);
    });
  }
  
  // Footer
  add('');
  add(forTelegram 
    ? `<i>Generated ${now.toISOString()}</i>` 
    : `Generated: ${now.toISOString()}`);
  
  return lines.join('\n');
}

async function main() {
  const forTelegram = process.argv.includes('--telegram');
  const digest = await generateDigest(forTelegram);
  console.log(digest);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
