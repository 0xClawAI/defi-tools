#!/usr/bin/env node
/**
 * Liquidation Tracker
 * 
 * Monitors perpetual DEX liquidations for cascade signals.
 * Key insight: Biggest liquidations happen UTC 2-5am when order books thin.
 * 
 * Approach: Track Open Interest changes as proxy for liquidations
 * - Large OI drops = forced position closures (liquidations)
 * - Combined with funding rate spikes = cascade risk
 */

const fs = require('fs');
const path = require('path');

// === CONFIG ===
const CONFIG = {
  // Alert thresholds
  OI_DROP_PCT_WARNING: 3,      // 3% OI drop in 1h = warning
  OI_DROP_PCT_CRITICAL: 5,     // 5% OI drop = critical
  FUNDING_EXTREME: 0.00003,    // Extreme funding (>26% APR) - hourly rate
  
  // Monitoring
  POLL_INTERVAL_MS: 60000,     // Check every 60 seconds
  
  // Hyperliquid API
  HYPERLIQUID_API: 'https://api.hyperliquid.xyz/info',
  
  // Output
  DATA_DIR: path.join(__dirname, 'data'),
  LOG_DIR: path.join(__dirname, 'logs'),
};

// State
let previousOI = {};
let stats = {
  scans: 0,
  alerts: 0,
  startTime: Date.now(),
};

// Coins to track
const WATCHED_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'AVAX', 'LINK', 'OP', 'ARB', 'SUI', 'APT', 'XRP', 'HYPE'];

// === API ===
async function fetchAllMids() {
  const response = await fetch(CONFIG.HYPERLIQUID_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'allMids' }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchMeta() {
  const response = await fetch(CONFIG.HYPERLIQUID_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchMetaAndAssetCtxs() {
  const response = await fetch(CONFIG.HYPERLIQUID_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// === PROCESSING ===
function analyzeData(assetCtxs, meta) {
  const now = Date.now();
  const hour = new Date().getUTCHours();
  const isHighRiskWindow = hour >= 2 && hour <= 5;
  
  const results = [];
  const alerts = [];
  
  // Map coins to their data
  const universe = meta.universe || [];
  const coinIndex = {};
  universe.forEach((coin, i) => {
    coinIndex[coin.name] = i;
  });
  
  for (const coin of WATCHED_COINS) {
    const idx = coinIndex[coin];
    if (idx === undefined || !assetCtxs[idx]) continue;
    
    const ctx = assetCtxs[idx];
    const price = parseFloat(ctx.markPx || 0);
    const openInterest = parseFloat(ctx.openInterest || 0);
    const funding = parseFloat(ctx.funding || 0);
    const volume = parseFloat(ctx.dayNtlVlm || 0);
    
    const oiUsd = openInterest * price;
    
    // Compare with previous OI
    let oiChange = 0;
    let oiChangePct = 0;
    if (previousOI[coin]) {
      oiChange = oiUsd - previousOI[coin].oiUsd;
      oiChangePct = (oiChange / previousOI[coin].oiUsd) * 100;
    }
    
    // Store current values
    previousOI[coin] = { oiUsd, timestamp: now };
    
    // Generate alerts
    if (oiChangePct < -CONFIG.OI_DROP_PCT_CRITICAL) {
      alerts.push({
        type: 'OI_DROP_CRITICAL',
        severity: 'critical',
        coin,
        oiChangePct: oiChangePct.toFixed(2),
        oiChangeUsd: formatUsd(Math.abs(oiChange)),
        funding: (funding * 100 * 8760).toFixed(1) + '% APR',
        message: `🚨 ${coin}: OI dropped ${Math.abs(oiChangePct).toFixed(1)}% ($${formatUsd(Math.abs(oiChange))}) - potential liquidation cascade`,
      });
    } else if (oiChangePct < -CONFIG.OI_DROP_PCT_WARNING) {
      alerts.push({
        type: 'OI_DROP_WARNING',
        severity: 'warning',
        coin,
        oiChangePct: oiChangePct.toFixed(2),
        message: `⚠️ ${coin}: OI dropped ${Math.abs(oiChangePct).toFixed(1)}% - elevated liquidation activity`,
      });
    }
    
    // Alert on extreme funding
    if (Math.abs(funding) > CONFIG.FUNDING_EXTREME) {
      const fundingAPR = (funding * 100 * 8760).toFixed(0);
      const direction = funding > 0 ? 'LONGS pay' : 'SHORTS pay';
      alerts.push({
        type: 'EXTREME_FUNDING',
        severity: 'warning',
        coin,
        funding: fundingAPR + '% APR',
        direction,
        message: `📊 ${coin}: Extreme funding ${fundingAPR}% APR (${direction}) - liquidation risk elevated`,
      });
    }
    
    results.push({
      coin,
      price,
      oiUsd,
      oiChangePct: oiChangePct.toFixed(2),
      funding: (funding * 100 * 8760).toFixed(1),
      volumeUsd: volume,
    });
  }
  
  return { results, alerts, isHighRiskWindow };
}

// === MAIN LOOP ===
async function scanOnce() {
  const now = new Date().toISOString();
  console.log(`\n[${now}] Scanning Hyperliquid OI + funding...`);
  
  try {
    const [data, meta] = await Promise.all([
      fetchMetaAndAssetCtxs(),
      fetchMeta(),
    ]);
    
    const assetCtxs = data[1] || [];
    const metaData = data[0] || meta;
    
    const { results, alerts, isHighRiskWindow } = analyzeData(assetCtxs, metaData);
    
    stats.scans++;
    stats.alerts += alerts.length;
    
    // Print results
    console.log('\n' + '─'.repeat(70));
    console.log(`  ${'Coin'.padEnd(6)} ${'Price'.padStart(12)} ${'OI'.padStart(12)} ${'OI Δ%'.padStart(8)} ${'Funding APR'.padStart(12)}`);
    console.log('─'.repeat(70));
    
    for (const r of results.sort((a, b) => parseFloat(b.oiUsd) - parseFloat(a.oiUsd)).slice(0, 12)) {
      const oiDelta = parseFloat(r.oiChangePct);
      const oiColor = oiDelta < -2 ? '🔴' : oiDelta > 2 ? '🟢' : '  ';
      console.log(`${oiColor}${r.coin.padEnd(6)} $${r.price.toFixed(2).padStart(11)} $${formatUsd(r.oiUsd).padStart(10)} ${r.oiChangePct.padStart(7)}% ${r.funding.padStart(10)}%`);
    }
    
    console.log('─'.repeat(70));
    
    // Print alerts
    if (alerts.length > 0) {
      console.log('\n🚨 ALERTS:');
      for (const alert of alerts) {
        console.log(alert.message);
      }
      await saveAlerts(alerts);
    }
    
    // Status
    const hour = new Date().getUTCHours();
    console.log(`\n📊 Status: Scans: ${stats.scans} | Alerts: ${stats.alerts} | UTC ${hour}:00 ${isHighRiskWindow ? '🟡 HIGH RISK WINDOW' : '🟢 Normal'}`);
    
    // Save daily log
    await saveDailyLog(results);
    
    return { results, alerts };
    
  } catch (error) {
    console.error('Error:', error.message);
    return { results: [], alerts: [] };
  }
}

async function runLoop() {
  console.log('🔥 Liquidation Tracker Starting...');
  console.log(`Watching: ${WATCHED_COINS.join(', ')}`);
  console.log(`Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000}s`);
  console.log(`OI drop thresholds: ${CONFIG.OI_DROP_PCT_WARNING}% warning, ${CONFIG.OI_DROP_PCT_CRITICAL}% critical`);
  console.log('');
  
  // First scan to establish baseline
  await scanOnce();
  
  // Then loop
  while (true) {
    await sleep(CONFIG.POLL_INTERVAL_MS);
    await scanOnce();
  }
}

// === PERSISTENCE ===
async function saveAlerts(alerts) {
  const alertFile = path.join(CONFIG.LOG_DIR, 'alerts.jsonl');
  const lines = alerts.map(a => JSON.stringify({
    ...a,
    timestamp: new Date().toISOString(),
  })).join('\n') + '\n';
  
  fs.appendFileSync(alertFile, lines);
}

async function saveDailyLog(results) {
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(CONFIG.DATA_DIR, `${date}.jsonl`);
  
  fs.appendFileSync(logFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    data: results,
  }) + '\n');
}

// === UTILITY ===
function formatUsd(value) {
  if (value >= 1000000000) return (value / 1000000000).toFixed(2) + 'B';
  if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
  return value.toFixed(2);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === CLI ===
async function showStats() {
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(CONFIG.DATA_DIR, `${date}.jsonl`);
  
  if (!fs.existsSync(logFile)) {
    console.log('No data for today yet. Run "node tracker.js scan" first.');
    return;
  }
  
  const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
  const entries = lines.map(l => JSON.parse(l));
  
  console.log(`📊 Today's Data (${date}) - ${entries.length} snapshots`);
  console.log('─'.repeat(60));
  
  // Track OI changes over time
  const coinOI = {};
  for (const entry of entries) {
    for (const coin of entry.data) {
      if (!coinOI[coin.coin]) coinOI[coin.coin] = [];
      coinOI[coin.coin].push({ time: entry.timestamp, oi: coin.oiUsd });
    }
  }
  
  // Calculate total change
  console.log('\nOI Changes Today:');
  for (const [coin, history] of Object.entries(coinOI)) {
    if (history.length < 2) continue;
    const first = history[0].oi;
    const last = history[history.length - 1].oi;
    const change = ((last - first) / first) * 100;
    const emoji = change < -3 ? '🔴' : change > 3 ? '🟢' : '⚪';
    console.log(`  ${emoji} ${coin}: ${change > 0 ? '+' : ''}${change.toFixed(2)}% ($${formatUsd(first)} → $${formatUsd(last)})`);
  }
}

async function showAlerts(limit = 20) {
  const alertFile = path.join(CONFIG.LOG_DIR, 'alerts.jsonl');
  
  if (!fs.existsSync(alertFile)) {
    console.log('No alerts recorded yet.');
    return;
  }
  
  const lines = fs.readFileSync(alertFile, 'utf-8').trim().split('\n');
  const alerts = lines.slice(-limit).map(l => JSON.parse(l));
  
  console.log(`🚨 Recent Alerts (last ${alerts.length})`);
  console.log('─'.repeat(60));
  for (const alert of alerts) {
    console.log(`[${alert.timestamp}] ${alert.message}`);
  }
}

// === ENTRY POINT ===
const args = process.argv.slice(2);
const command = args[0] || 'scan';

(async () => {
  switch (command) {
    case 'scan':
    case '--once':
      await scanOnce();
      break;
    case 'loop':
    case '--loop':
      await runLoop();
      break;
    case 'stats':
      await showStats();
      break;
    case 'alerts':
      const limit = parseInt(args[1]) || 20;
      await showAlerts(limit);
      break;
    default:
      console.log(`
Liquidation Tracker - Monitor perpetual DEX liquidations via OI changes

Usage:
  node tracker.js scan     Single scan (shows current OI + funding)
  node tracker.js loop     Continuous monitoring
  node tracker.js stats    Show today's OI changes
  node tracker.js alerts   Show recent alerts
`);
  }
})();
