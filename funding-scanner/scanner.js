#!/usr/bin/env node
/**
 * Hyperliquid Funding Rate Scanner
 * 
 * Strategy: Go long when funding is deeply negative
 * - Shorts pay longs hourly on Hyperliquid
 * - Negative funding = free money for longs
 * - Max 3x leverage, $200 per position, 5 positions max
 * 
 * Usage:
 *   node scanner.js              # Show best opportunities
 *   node scanner.js --loop       # Continuous (15min intervals)
 *   node scanner.js --alert      # Send alerts for extreme funding
 */

const fs = require('fs');
const path = require('path');

// Alert Hub integration
let alertHub;
try {
  alertHub = require('../alert-hub/alerter');
} catch (e) {
  alertHub = null;
}

// Config
const CONFIG = {
  API_URL: 'https://api.hyperliquid.xyz/info',
  SCAN_INTERVAL: 900000,    // 15 minutes
  
  // Funding thresholds (hourly rate)
  ALERT_THRESHOLD: -0.0001,      // -0.01% hourly = -8.7% annualized
  EXTREME_THRESHOLD: -0.0003,    // -0.03% hourly = -26% annualized
  
  // Position sizing
  MAX_POSITION_USD: 200,
  MAX_POSITIONS: 5,
  MAX_LEVERAGE: 3,
  
  // Risk filters
  MIN_OI_USD: 100000,        // Minimum open interest $100k
  MIN_VOLUME_USD: 500000,    // Minimum 24h volume $500k
};

const DATA_DIR = path.join(__dirname, 'data');
const LOG_DIR = path.join(__dirname, 'logs');

// Ensure dirs
[DATA_DIR, LOG_DIR].forEach(d => fs.existsSync(d) || fs.mkdirSync(d, { recursive: true }));

// Fetch meta and asset contexts
async function fetchFundingData() {
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    const [meta, assetCtxs] = await res.json();
    return { meta, assetCtxs };
  } catch (e) {
    console.error('Fetch error:', e.message);
    return null;
  }
}

// Analyze funding opportunities
function analyzeOpportunities(meta, assetCtxs) {
  const opportunities = [];
  
  for (let i = 0; i < meta.universe.length; i++) {
    const asset = meta.universe[i];
    const ctx = assetCtxs[i];
    
    if (!ctx || asset.isDelisted) continue;
    
    const funding = parseFloat(ctx.funding || 0);
    const oi = parseFloat(ctx.openInterest || 0);
    const price = parseFloat(ctx.markPx || 0);
    const volume = parseFloat(ctx.dayNtlVlm || 0);
    const oiUsd = oi * price;
    
    // Skip if doesn't meet volume/OI requirements
    if (oiUsd < CONFIG.MIN_OI_USD || volume < CONFIG.MIN_VOLUME_USD) continue;
    
    // Only interested in negative funding (shorts pay longs)
    if (funding >= 0) continue;
    
    const hourlyRate = funding;
    const dailyRate = funding * 24;
    const annualizedRate = funding * 24 * 365;
    
    opportunities.push({
      coin: asset.name,
      index: i,
      funding: {
        hourly: hourlyRate,
        daily: dailyRate,
        annualized: annualizedRate,
        hourlyPct: (hourlyRate * 100).toFixed(4) + '%',
        annualizedPct: (annualizedRate * 100).toFixed(1) + '%',
      },
      price,
      openInterest: oiUsd,
      volume24h: volume,
      maxLeverage: asset.maxLeverage,
      isExtreme: funding <= CONFIG.EXTREME_THRESHOLD,
      isAlert: funding <= CONFIG.ALERT_THRESHOLD,
    });
  }
  
  // Sort by funding (most negative first)
  return opportunities.sort((a, b) => a.funding.hourly - b.funding.hourly);
}

// Format opportunity for display
function formatOpportunity(opp, rank) {
  const emoji = opp.isExtreme ? '🔥' : opp.isAlert ? '⚠️' : '📊';
  return `${emoji} #${rank} ${opp.coin}
Funding: ${opp.funding.hourlyPct}/hr (${opp.funding.annualizedPct} APR)
Price: $${opp.price.toFixed(2)}
OI: $${(opp.openInterest/1e6).toFixed(1)}M | Vol: $${(opp.volume24h/1e6).toFixed(1)}M
Max Lev: ${opp.maxLeverage}x`;
}

// Save state
function saveState(opportunities) {
  const state = {
    timestamp: new Date().toISOString(),
    opportunities: opportunities.slice(0, 20),
    alerts: opportunities.filter(o => o.isAlert),
    extreme: opportunities.filter(o => o.isExtreme),
  };
  fs.writeFileSync(path.join(DATA_DIR, 'funding-state.json'), JSON.stringify(state, null, 2));
  return state;
}

// Log scan
function logScan(opportunities) {
  const logFile = path.join(LOG_DIR, `scan-${new Date().toISOString().split('T')[0]}.log`);
  const entry = {
    ts: new Date().toISOString(),
    top5: opportunities.slice(0, 5).map(o => ({
      coin: o.coin,
      funding: o.funding.hourlyPct,
    })),
  };
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

// Main scan
async function scan() {
  console.log(`\n💰 Funding Rate Scan - ${new Date().toISOString()}`);
  console.log('='.repeat(50));
  
  const data = await fetchFundingData();
  if (!data) {
    console.log('❌ Failed to fetch data');
    return null;
  }
  
  const opportunities = analyzeOpportunities(data.meta, data.assetCtxs);
  console.log(`Found ${opportunities.length} assets with negative funding`);
  console.log(`Alert threshold: ${opportunities.filter(o => o.isAlert).length}`);
  console.log(`Extreme: ${opportunities.filter(o => o.isExtreme).length}`);
  
  // Show top 10
  console.log('\n📊 TOP OPPORTUNITIES (Negative Funding = Longs Get Paid)');
  console.log('-'.repeat(50));
  
  opportunities.slice(0, 10).forEach((opp, i) => {
    console.log('\n' + formatOpportunity(opp, i + 1));
  });
  
  const state = saveState(opportunities);
  logScan(opportunities);
  
  // Send alerts for extreme funding via Alert Hub
  if (alertHub) {
    const extreme = opportunities.filter(o => o.isExtreme);
    for (const opp of extreme.slice(0, 3)) { // Top 3 only
      alertHub.sendAlert({
        message: `${opp.coin}: Funding ${opp.funding.annualizedPct}% APR - ${opp.funding.hourlyPct > 0 ? 'shorts pay' : 'longs pay'}`,
        severity: Math.abs(opp.funding.hourlyPct) > 0.0005 ? 'critical' : 'warning',
        source: 'funding',
        coin: opp.coin,
        type: 'extreme_funding',
      }).catch(() => {}); // Non-blocking
    }
  }
  
  return state;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--loop')) {
    console.log(`Starting continuous scan (interval: ${CONFIG.SCAN_INTERVAL/1000/60}min)`);
    await scan();
    setInterval(scan, CONFIG.SCAN_INTERVAL);
  } else {
    await scan();
    process.exit(0);
  }
}

main().catch(console.error);
