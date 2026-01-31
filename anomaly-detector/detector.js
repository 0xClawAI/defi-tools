#!/usr/bin/env node
/**
 * Silent Anomaly Detector
 * Catches pre-rug signals: LP drain, wallet splitting, metadata changes
 * Source: ghost0x's TrenchPing concept
 */

const fs = require('fs');
const path = require('path');

// Config
const CONFIG = {
  // Thresholds for alerts
  lpDrainThreshold: 0.15,      // 15% liquidity drop = alert
  lpDrainCritical: 0.30,       // 30% = critical
  splitThreshold: 0.10,        // 10% of supply moving = alert
  minLiquidityUsd: 5000,       // Only track tokens with decent liquidity
  
  // Polling
  pollIntervalMs: 60000,       // Check every minute
  
  // Data paths
  dataDir: path.join(__dirname, 'data'),
  logsDir: path.join(__dirname, 'logs'),
  watchlistFile: path.join(__dirname, 'watchlist.json'),
  alertsFile: path.join(__dirname, 'alerts.json'),
  snapshotsFile: path.join(__dirname, 'data/snapshots.json'),
};

// Ensure directories exist
[CONFIG.dataDir, CONFIG.logsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ============================================
// Data Management
// ============================================

function loadWatchlist() {
  if (fs.existsSync(CONFIG.watchlistFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.watchlistFile, 'utf8'));
  }
  return { tokens: [], lastUpdated: null };
}

function saveWatchlist(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG.watchlistFile, JSON.stringify(data, null, 2));
}

function loadSnapshots() {
  if (fs.existsSync(CONFIG.snapshotsFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.snapshotsFile, 'utf8'));
  }
  return {};
}

function saveSnapshots(data) {
  fs.writeFileSync(CONFIG.snapshotsFile, JSON.stringify(data, null, 2));
}

function loadAlerts() {
  if (fs.existsSync(CONFIG.alertsFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.alertsFile, 'utf8'));
  }
  return { alerts: [], summary: { total: 0, byType: {} } };
}

function saveAlerts(data) {
  fs.writeFileSync(CONFIG.alertsFile, JSON.stringify(data, null, 2));
}

// ============================================
// DexScreener API
// ============================================

async function fetchTokenData(chainId, tokenAddress) {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/tokens/v1/${chainId}/${tokenAddress}`
    );
    const data = await res.json();
    return data[0] || null;
  } catch (e) {
    console.error(`[ERROR] fetchTokenData: ${e.message}`);
    return null;
  }
}

async function fetchTopTokens(chain = 'base') {
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    const data = await res.json();
    return data.filter(t => t.chainId === chain).slice(0, 20);
  } catch (e) {
    console.error(`[ERROR] fetchTopTokens: ${e.message}`);
    return [];
  }
}

// ============================================
// Anomaly Detection
// ============================================

function detectLpDrain(current, previous) {
  if (!previous || !previous.liquidity || !current.liquidity) return null;
  
  const prevLiq = parseFloat(previous.liquidity.usd) || 0;
  const currLiq = parseFloat(current.liquidity.usd) || 0;
  
  if (prevLiq === 0) return null;
  
  const change = (currLiq - prevLiq) / prevLiq;
  
  if (change <= -CONFIG.lpDrainCritical) {
    return {
      type: 'LP_DRAIN_CRITICAL',
      severity: 'CRITICAL',
      change: change,
      from: prevLiq,
      to: currLiq,
      message: `🚨 CRITICAL LP DRAIN: ${(change * 100).toFixed(1)}% ($${prevLiq.toFixed(0)} → $${currLiq.toFixed(0)})`
    };
  }
  
  if (change <= -CONFIG.lpDrainThreshold) {
    return {
      type: 'LP_DRAIN',
      severity: 'WARNING',
      change: change,
      from: prevLiq,
      to: currLiq,
      message: `⚠️ LP Drain: ${(change * 100).toFixed(1)}% ($${prevLiq.toFixed(0)} → $${currLiq.toFixed(0)})`
    };
  }
  
  return null;
}

function detectPriceAnomaly(current, previous) {
  if (!previous || !previous.priceUsd || !current.priceUsd) return null;
  
  const prevPrice = parseFloat(previous.priceUsd);
  const currPrice = parseFloat(current.priceUsd);
  
  if (prevPrice === 0) return null;
  
  const change = (currPrice - prevPrice) / prevPrice;
  
  // Sudden dump without volume = suspicious
  if (change <= -0.30) {
    return {
      type: 'SUDDEN_DUMP',
      severity: 'WARNING',
      change: change,
      from: prevPrice,
      to: currPrice,
      message: `📉 Sudden dump: ${(change * 100).toFixed(1)}%`
    };
  }
  
  return null;
}

function detectMetadataChange(current, previous) {
  if (!previous) return null;
  
  const changes = [];
  
  // Check name change
  if (previous.baseToken?.name !== current.baseToken?.name) {
    changes.push({
      type: 'NAME_CHANGE',
      severity: 'WARNING',
      from: previous.baseToken?.name,
      to: current.baseToken?.name,
      message: `📛 Name changed: "${previous.baseToken?.name}" → "${current.baseToken?.name}"`
    });
  }
  
  // Check symbol change
  if (previous.baseToken?.symbol !== current.baseToken?.symbol) {
    changes.push({
      type: 'SYMBOL_CHANGE', 
      severity: 'WARNING',
      from: previous.baseToken?.symbol,
      to: current.baseToken?.symbol,
      message: `🔄 Symbol changed: "${previous.baseToken?.symbol}" → "${current.baseToken?.symbol}"`
    });
  }
  
  return changes.length > 0 ? changes : null;
}

function detectVolumeAnomaly(current, previous) {
  if (!previous || !previous.volume?.h24 || !current.volume?.h24) return null;
  
  const prevVol = parseFloat(previous.volume.h24);
  const currVol = parseFloat(current.volume.h24);
  
  // Volume spike with price drop = dump
  if (currVol > prevVol * 3) {
    const priceChange = previous.priceUsd && current.priceUsd
      ? (parseFloat(current.priceUsd) - parseFloat(previous.priceUsd)) / parseFloat(previous.priceUsd)
      : 0;
    
    if (priceChange < -0.20) {
      return {
        type: 'VOLUME_DUMP',
        severity: 'WARNING',
        volumeChange: currVol / prevVol,
        priceChange: priceChange,
        message: `📊 Volume spike (${(currVol / prevVol).toFixed(1)}x) with price dump (${(priceChange * 100).toFixed(1)}%)`
      };
    }
  }
  
  return null;
}

// ============================================
// Alert System
// ============================================

function logAlert(token, anomaly, snapshots) {
  const alertsDb = loadAlerts();
  
  const alert = {
    timestamp: new Date().toISOString(),
    token: {
      symbol: token.baseToken?.symbol,
      address: token.baseToken?.address,
      chain: token.chainId,
      pair: token.pairAddress
    },
    anomaly: anomaly,
    currentState: {
      price: token.priceUsd,
      liquidity: token.liquidity?.usd,
      volume24h: token.volume?.h24,
      fdv: token.fdv
    }
  };
  
  alertsDb.alerts.unshift(alert);
  alertsDb.alerts = alertsDb.alerts.slice(0, 100); // Keep last 100
  alertsDb.summary.total++;
  alertsDb.summary.byType[anomaly.type] = (alertsDb.summary.byType[anomaly.type] || 0) + 1;
  
  saveAlerts(alertsDb);
  
  // Log to file
  const logFile = path.join(CONFIG.logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const logEntry = `\n[${alert.timestamp}] ${token.baseToken?.symbol} - ${anomaly.message}\n` +
    `  Chain: ${token.chainId} | Pair: ${token.pairAddress}\n` +
    `  Price: $${token.priceUsd} | Liq: $${token.liquidity?.usd || 'N/A'}\n`;
  fs.appendFileSync(logFile, logEntry);
  
  return alert;
}

// ============================================
// Main Scanner
// ============================================

async function scanToken(chainId, tokenAddress, snapshots) {
  const current = await fetchTokenData(chainId, tokenAddress);
  if (!current) return [];
  
  const key = `${chainId}:${tokenAddress}`;
  const previous = snapshots[key];
  
  const anomalies = [];
  
  // Run all detectors
  const lpDrain = detectLpDrain(current, previous);
  if (lpDrain) anomalies.push(lpDrain);
  
  const priceAnomaly = detectPriceAnomaly(current, previous);
  if (priceAnomaly) anomalies.push(priceAnomaly);
  
  const metaChanges = detectMetadataChange(current, previous);
  if (metaChanges) anomalies.push(...metaChanges);
  
  const volumeAnomaly = detectVolumeAnomaly(current, previous);
  if (volumeAnomaly) anomalies.push(volumeAnomaly);
  
  // Update snapshot
  snapshots[key] = {
    ...current,
    lastChecked: new Date().toISOString()
  };
  
  return anomalies.map(a => ({ token: current, anomaly: a }));
}

async function runScan() {
  console.log(`\n🔍 Anomaly Scan - ${new Date().toISOString()}`);
  
  const watchlist = loadWatchlist();
  const snapshots = loadSnapshots();
  const allAlerts = [];
  
  // Scan watchlist tokens
  for (const token of watchlist.tokens) {
    try {
      const results = await scanToken(token.chainId, token.address, snapshots);
      for (const { token: t, anomaly } of results) {
        const alert = logAlert(t, anomaly, snapshots);
        allAlerts.push(alert);
        console.log(`  ${anomaly.message} - ${t.baseToken?.symbol}`);
      }
    } catch (e) {
      console.error(`  [ERROR] ${token.symbol}: ${e.message}`);
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Also scan top boosted tokens for early detection
  const boosted = await fetchTopTokens('base');
  for (const token of boosted.slice(0, 10)) {
    try {
      const results = await scanToken(token.chainId, token.tokenAddress, snapshots);
      for (const { token: t, anomaly } of results) {
        const alert = logAlert(t, anomaly, snapshots);
        allAlerts.push(alert);
        console.log(`  ${anomaly.message} - ${t.baseToken?.symbol}`);
      }
    } catch (e) {
      // Skip errors for discovery tokens
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  saveSnapshots(snapshots);
  
  console.log(`\n📊 Scan complete: ${allAlerts.length} anomalies detected`);
  return allAlerts;
}

// ============================================
// CLI Commands
// ============================================

async function addToWatchlist(chainId, tokenAddress, notes = '') {
  const data = await fetchTokenData(chainId, tokenAddress);
  if (!data) {
    console.error('Token not found');
    return;
  }
  
  const watchlist = loadWatchlist();
  const exists = watchlist.tokens.find(
    t => t.address.toLowerCase() === tokenAddress.toLowerCase()
  );
  
  if (exists) {
    console.log(`Already watching: ${data.baseToken?.symbol}`);
    return;
  }
  
  watchlist.tokens.push({
    address: tokenAddress,
    chainId: chainId,
    symbol: data.baseToken?.symbol,
    name: data.baseToken?.name,
    addedAt: new Date().toISOString(),
    notes: notes
  });
  
  saveWatchlist(watchlist);
  
  // Take initial snapshot
  const snapshots = loadSnapshots();
  snapshots[`${chainId}:${tokenAddress}`] = {
    ...data,
    lastChecked: new Date().toISOString()
  };
  saveSnapshots(snapshots);
  
  console.log(`✅ Added ${data.baseToken?.symbol} to watchlist`);
}

function showWatchlist() {
  const watchlist = loadWatchlist();
  console.log('\n📋 Watchlist:');
  for (const token of watchlist.tokens) {
    console.log(`  - ${token.symbol} (${token.chainId}) - ${token.address.slice(0, 10)}...`);
  }
  console.log(`\nTotal: ${watchlist.tokens.length} tokens`);
}

function showAlerts(limit = 20) {
  const alerts = loadAlerts();
  console.log('\n🚨 Recent Alerts:');
  for (const alert of alerts.alerts.slice(0, limit)) {
    console.log(`  [${alert.timestamp.slice(11, 19)}] ${alert.token.symbol} - ${alert.anomaly.message}`);
  }
  console.log(`\nSummary:`, alerts.summary);
}

async function loopMode() {
  console.log('🔄 Starting continuous monitoring...');
  console.log(`   Poll interval: ${CONFIG.pollIntervalMs / 1000}s`);
  
  while (true) {
    await runScan();
    await new Promise(r => setTimeout(r, CONFIG.pollIntervalMs));
  }
}

// ============================================
// Entry Point
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  switch (cmd) {
    case 'add':
      // node detector.js add base 0x123...
      await addToWatchlist(args[1] || 'base', args[2], args[3]);
      break;
      
    case 'list':
      showWatchlist();
      break;
      
    case 'alerts':
      showAlerts(parseInt(args[1]) || 20);
      break;
      
    case 'scan':
      await runScan();
      break;
      
    case 'loop':
    case '--loop':
      await loopMode();
      break;
      
    default:
      console.log(`
Silent Anomaly Detector 🔍
Catches pre-rug signals: LP drain, wallet splitting, metadata changes

Commands:
  scan              Run single scan
  loop              Continuous monitoring
  add <chain> <addr> Add token to watchlist
  list              Show watchlist
  alerts [n]        Show recent alerts

Examples:
  node detector.js scan
  node detector.js add base 0x123abc...
  node detector.js loop
      `);
  }
}

main().catch(console.error);
