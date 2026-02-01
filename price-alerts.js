#!/usr/bin/env node
/**
 * Price Alert System - Watch tokens and alert on price changes
 * 
 * Usage:
 *   node price-alerts.js add MOLTBOOK base 0.001 0.002  # Alert below/above
 *   node price-alerts.js add ETH base percent 5        # Alert on 5% move
 *   node price-alerts.js list                          # Show all alerts
 *   node price-alerts.js check                         # Check all alerts
 *   node price-alerts.js remove <id>                   # Remove an alert
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, 'data', 'price-alerts.json');
const ALERT_HISTORY = path.join(__dirname, 'data', 'price-alert-history.jsonl');

// === DATA ===

function loadAlerts() {
  if (!fs.existsSync(DATA_FILE)) {
    return { alerts: [], lastPrices: {} };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveAlerts(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function logAlert(alert, price, triggered) {
  fs.mkdirSync(path.dirname(ALERT_HISTORY), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    alert,
    price,
    triggered,
  };
  fs.appendFileSync(ALERT_HISTORY, JSON.stringify(entry) + '\n');
}

// === PRICE FETCHING ===

async function fetchPrice(symbol, chain) {
  return new Promise((resolve, reject) => {
    // Try DexScreener search first
    const url = `https://api.dexscreener.com/latest/dex/search?q=${symbol}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Find pair matching chain
          const pair = json.pairs?.find(p => 
            p.chainId === chain || 
            (chain === 'base' && p.chainId === 'base') ||
            (chain === 'solana' && p.chainId === 'solana')
          );
          if (pair) {
            resolve({
              price: parseFloat(pair.priceUsd),
              symbol: pair.baseToken.symbol,
              address: pair.baseToken.address,
              chain: pair.chainId,
            });
          } else {
            reject(new Error(`No pair found for ${symbol} on ${chain}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// === COMMANDS ===

async function addAlert(args) {
  const [symbol, chain, ...params] = args;
  
  if (!symbol || !chain) {
    console.log('Usage: add <symbol> <chain> <low> <high>');
    console.log('       add <symbol> <chain> percent <percent>');
    return;
  }
  
  const data = loadAlerts();
  const id = `${symbol}-${Date.now().toString(36)}`;
  
  // Get current price
  try {
    const priceData = await fetchPrice(symbol, chain);
    console.log(`Current price: $${priceData.price}`);
    
    let alert = {
      id,
      symbol,
      chain,
      address: priceData.address,
      createdAt: new Date().toISOString(),
      referencePrice: priceData.price,
      enabled: true,
    };
    
    if (params[0] === 'percent') {
      const pct = parseFloat(params[1]) || 5;
      alert.type = 'percent';
      alert.percentThreshold = pct;
      alert.lowPrice = priceData.price * (1 - pct/100);
      alert.highPrice = priceData.price * (1 + pct/100);
      console.log(`Alert when price moves ±${pct}%`);
    } else {
      const [low, high] = params.map(parseFloat);
      alert.type = 'range';
      alert.lowPrice = low || null;
      alert.highPrice = high || null;
      if (low) console.log(`Alert when price < $${low}`);
      if (high) console.log(`Alert when price > $${high}`);
    }
    
    data.alerts.push(alert);
    data.lastPrices[id] = priceData.price;
    saveAlerts(data);
    
    console.log(`✅ Alert added: ${id}`);
  } catch (e) {
    console.log(`❌ Failed to add alert: ${e.message}`);
  }
}

function listAlerts() {
  const data = loadAlerts();
  
  if (data.alerts.length === 0) {
    console.log('No price alerts configured.');
    return;
  }
  
  console.log('\n📋 Price Alerts:\n');
  for (const alert of data.alerts) {
    const status = alert.enabled ? '🟢' : '⚪';
    const lastPrice = data.lastPrices[alert.id];
    let conditions = '';
    
    if (alert.type === 'percent') {
      conditions = `±${alert.percentThreshold}% from $${alert.referencePrice.toFixed(6)}`;
    } else {
      if (alert.lowPrice) conditions += `< $${alert.lowPrice.toFixed(6)} `;
      if (alert.highPrice) conditions += `> $${alert.highPrice.toFixed(6)}`;
    }
    
    console.log(`${status} ${alert.symbol} (${alert.chain})`);
    console.log(`   ID: ${alert.id}`);
    console.log(`   Condition: ${conditions}`);
    if (lastPrice) console.log(`   Last price: $${lastPrice.toFixed(6)}`);
    console.log();
  }
}

async function sendToAlertHub(triggered) {
  // Try to use alert-hub for Telegram notifications
  try {
    const alerterPath = path.join(__dirname, 'alert-hub', 'alerter.js');
    if (!fs.existsSync(alerterPath)) return;
    
    const { sendAlert } = require(alerterPath);
    
    for (const t of triggered) {
      await sendAlert({
        message: `${t.alert.symbol}: $${t.price.toFixed(6)} - ${t.reason}`,
        severity: 'warning',
        source: 'custom',
        coin: t.alert.symbol,
        type: 'price_alert',
      });
    }
    console.log(`📤 Sent ${triggered.length} alert(s) to alert-hub`);
  } catch (e) {
    console.log(`⚠️ Could not send to alert-hub: ${e.message}`);
  }
}

async function checkAlerts() {
  const data = loadAlerts();
  const triggered = [];
  
  console.log(`\n🔍 Checking ${data.alerts.length} alerts...\n`);
  
  for (const alert of data.alerts.filter(a => a.enabled)) {
    try {
      const priceData = await fetchPrice(alert.symbol, alert.chain);
      const price = priceData.price;
      data.lastPrices[alert.id] = price;
      
      let isTriggered = false;
      let reason = '';
      
      if (alert.lowPrice && price < alert.lowPrice) {
        isTriggered = true;
        reason = `below $${alert.lowPrice.toFixed(6)}`;
      } else if (alert.highPrice && price > alert.highPrice) {
        isTriggered = true;
        reason = `above $${alert.highPrice.toFixed(6)}`;
      }
      
      if (isTriggered) {
        console.log(`🚨 ${alert.symbol}: $${price.toFixed(6)} - ${reason}`);
        triggered.push({ alert, price, reason });
        logAlert(alert, price, true);
      } else {
        console.log(`✅ ${alert.symbol}: $${price.toFixed(6)}`);
        logAlert(alert, price, false);
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log(`⚠️ ${alert.symbol}: ${e.message}`);
    }
  }
  
  saveAlerts(data);
  
  if (triggered.length > 0) {
    console.log(`\n🔔 ${triggered.length} alert(s) triggered!`);
    await sendToAlertHub(triggered);
    return triggered;
  } else {
    console.log('\n✅ No alerts triggered.');
    return [];
  }
}

function removeAlert(id) {
  const data = loadAlerts();
  const idx = data.alerts.findIndex(a => a.id === id);
  
  if (idx === -1) {
    console.log(`Alert ${id} not found.`);
    return;
  }
  
  const removed = data.alerts.splice(idx, 1)[0];
  delete data.lastPrices[id];
  saveAlerts(data);
  
  console.log(`✅ Removed alert for ${removed.symbol}`);
}

// === MAIN ===

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  
  switch (cmd) {
    case 'add':
      await addAlert(args);
      break;
    case 'list':
      listAlerts();
      break;
    case 'check':
      await checkAlerts();
      break;
    case 'remove':
      removeAlert(args[0]);
      break;
    default:
      console.log('Price Alert System');
      console.log('');
      console.log('Commands:');
      console.log('  add <symbol> <chain> <low> <high>  - Add price range alert');
      console.log('  add <symbol> <chain> percent <pct> - Add percent move alert');
      console.log('  list                               - Show all alerts');
      console.log('  check                              - Check all alerts');
      console.log('  remove <id>                        - Remove an alert');
      console.log('');
      console.log('Examples:');
      console.log('  node price-alerts.js add ETH base 2000 4000');
      console.log('  node price-alerts.js add MOLTBOOK base percent 10');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
