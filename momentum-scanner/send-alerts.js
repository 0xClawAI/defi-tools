#!/usr/bin/env node
/**
 * Send Pending Alerts
 * Reads pending-alerts.json and outputs messages for OpenClaw to send
 * 
 * Usage:
 *   node send-alerts.js           # Output pending alerts
 *   node send-alerts.js --clear   # Clear after reading
 */

const fs = require('fs');
const path = require('path');

const ALERT_FILE = path.join(__dirname, 'data', 'pending-alerts.json');

function loadAlerts() {
  if (!fs.existsSync(ALERT_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ALERT_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function clearAlerts() {
  fs.writeFileSync(ALERT_FILE, '[]');
}

function main() {
  const args = process.argv.slice(2);
  const alerts = loadAlerts();
  
  if (alerts.length === 0) {
    console.log('No pending alerts');
    return;
  }
  
  console.log(`Found ${alerts.length} pending alerts:\n`);
  
  for (const alert of alerts) {
    console.log('---');
    console.log(`Channel: ${alert.channel}`);
    console.log(`Target: ${alert.target}`);
    console.log(`Message:\n${alert.message}`);
    console.log('---\n');
  }
  
  // Output in a format OpenClaw can parse
  console.log('\n=== ALERT_PAYLOAD_START ===');
  console.log(JSON.stringify(alerts, null, 2));
  console.log('=== ALERT_PAYLOAD_END ===');
  
  if (args.includes('--clear')) {
    clearAlerts();
    console.log('\nAlerts cleared.');
  }
}

main();
