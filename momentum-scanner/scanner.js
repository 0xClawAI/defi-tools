#!/usr/bin/env node
/**
 * Momentum Ratio Scanner
 * Scans Base tokens for high buy/sell ratios
 * Alerts on >1.8x sustained ratios
 * 
 * Usage:
 *   node scanner.js --once     # Single scan
 *   node scanner.js --loop     # Continuous (5min intervals)
 *   node scanner.js --watch    # Watch specific tokens
 */

const fs = require('fs');
const path = require('path');
const { sendAlert } = require('./alerter');

// Auto-trade config (small positions)
const AUTO_TRADE = {
  enabled: false,          // Enable via --auto-trade flag
  maxPosition: 10,         // Max $10 per trade
  minRatio: 2.0,           // Only auto-trade on 2x+ ratio
  minLiquidity: 100000,    // Need $100k liquidity
  stopLoss: 0.15,          // 15% stop loss
};

// Config (Updated 2026-01-31 after backtest showed -99% avg loss)
const CONFIG = {
  ALERT_RATIO: 2.0,        // Alert threshold (raised from 1.8)
  MIN_VOLUME_24H: 50000,   // Minimum $50k volume (raised from 10k)
  MIN_LIQUIDITY: 100000,   // Minimum $100k liquidity (raised from 50k)
  MIN_TRANSACTIONS: 20,    // Min transactions (raised from 5 - filter wash trading)
  MIN_AGE_HOURS: 24,       // Token must be >24h old (NEW)
  MAX_DROP_24H: -50,       // Reject if already down >50% (NEW)
  SCAN_INTERVAL: 300000,   // 5 minutes
  WATCHLIST: [
    // Known tokens to always check
    '0x8c9037d1ef5c6d1f6816278c7aaf5491d24cd527',  // MOLTBOOK on Base
  ],           
  CHAINS: ['base', 'solana'],  // Multi-chain support
};

const DATA_DIR = path.join(__dirname, 'data');
const LOG_DIR = path.join(__dirname, 'logs');

// Ensure dirs exist
[DATA_DIR, LOG_DIR].forEach(d => fs.existsSync(d) || fs.mkdirSync(d, { recursive: true }));

// State tracking
function loadState() {
  const f = path.join(DATA_DIR, 'scanner-state.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  return { 
    history: {},      // Token -> array of ratio snapshots
    alerts: [],       // Recent alerts
    lastScan: null 
  };
}

function saveState(state) {
  fs.writeFileSync(path.join(DATA_DIR, 'scanner-state.json'), JSON.stringify(state, null, 2));
}

// DEXScreener APIs
async function fetchTrendingTokens(chain = 'base') {
  try {
    const res = await fetch(`https://api.dexscreener.com/token-boosts/top/v1`);
    const data = await res.json();
    return data.filter(t => t.chainId === chain);
  } catch (e) {
    console.error('Fetch trending error:', e.message);
    return [];
  }
}

async function fetchTokenData(tokenAddress, chain = 'base') {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const data = await res.json();
    // Find the pair with highest liquidity on specified chain (or any if chain is null)
    let pairs = data.pairs || [];
    if (chain) {
      pairs = pairs.filter(p => p.chainId === chain);
    }
    return pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] || null;
  } catch (e) {
    return null;
  }
}

async function fetchTopPairs(chain = 'base', limit = 50) {
  try {
    // Use search endpoint for active pairs
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=chain:${chain}`);
    const data = await res.json();
    return (data.pairs || [])
      .filter(p => p.chainId === chain)
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, limit);
  } catch (e) {
    console.error('Fetch pairs error:', e.message);
    return [];
  }
}

// Calculate buy/sell ratio
function calculateRatio(txns, window = 'h1') {
  const data = txns?.[window];
  if (!data) return { ratio: 0, buys: 0, sells: 0 };
  
  const buys = data.buys || 0;
  const sells = data.sells || 0;
  
  if (sells === 0) return { ratio: buys > 0 ? 999 : 0, buys, sells };
  return { ratio: buys / sells, buys, sells };
}

// Check if token passes filters (SAFETY CRITICAL)
function passesFilters(pair) {
  if (!pair) return false;
  
  const vol24 = pair.volume?.h24 || 0;
  const liq = pair.liquidity?.usd || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;
  const pairAge = pair.pairCreatedAt ? Date.now() - pair.pairCreatedAt : 0;
  const ageHours = pairAge / (1000 * 60 * 60);
  
  // Basic volume/liquidity check
  if (vol24 < CONFIG.MIN_VOLUME_24H) return false;
  if (liq < CONFIG.MIN_LIQUIDITY) return false;
  
  // SAFETY: Token must be at least 24 hours old (rugpull filter)
  if (ageHours < 24) {
    // console.log(`  Filtered: ${pair.baseToken?.symbol} too young (${ageHours.toFixed(1)}h)`);
    return false;
  }
  
  // SAFETY: Reject tokens already down >50% in 24h (likely rugging)
  if (priceChange24h < -50) {
    // console.log(`  Filtered: ${pair.baseToken?.symbol} already crashed (${priceChange24h}%)`);
    return false;
  }
  
  // SAFETY: Require minimum liquidity for safer exit ($100k)
  if (liq < 100000) {
    // console.log(`  Filtered: ${pair.baseToken?.symbol} low liquidity ($${liq})`);
    return false;
  }
  
  return true;
}

// Analyze token for signals
function analyzeToken(pair, state) {
  const signals = [];
  const addr = pair.baseToken?.address;
  
  // Calculate ratios for different windows
  const ratios = {
    m5: calculateRatio(pair.txns, 'm5'),
    h1: calculateRatio(pair.txns, 'h1'),
    h6: calculateRatio(pair.txns, 'h6'),
    h24: calculateRatio(pair.txns, 'h24'),
  };
  
  // Store in history
  if (!state.history[addr]) state.history[addr] = [];
  state.history[addr].push({
    ts: Date.now(),
    ratios,
    price: pair.priceUsd,
    volume: pair.volume?.h24,
  });
  // Keep last 100 snapshots
  if (state.history[addr].length > 100) state.history[addr].shift();
  
  // Check for high ratio signals
  const windows = ['h1', 'h6'];
  for (const w of windows) {
    const r = ratios[w];
    if (r.ratio >= CONFIG.ALERT_RATIO && r.buys >= CONFIG.MIN_TRANSACTIONS) {
      signals.push({
        type: 'HIGH_RATIO',
        window: w,
        ratio: r.ratio.toFixed(2),
        buys: r.buys,
        sells: r.sells,
        token: pair.baseToken?.symbol,
        address: addr,
        price: pair.priceUsd,
        volume24h: pair.volume?.h24,
        liquidity: pair.liquidity?.usd,
        priceChange: pair.priceChange?.h1,
      });
    }
  }
  
  // Check for sustained ratio (multiple snapshots above threshold)
  const recentHistory = state.history[addr]?.slice(-3) || [];
  if (recentHistory.length >= 3) {
    const allHighRatio = recentHistory.every(h => h.ratios.h1.ratio >= 1.5);
    if (allHighRatio) {
      signals.push({
        type: 'SUSTAINED_ACCUMULATION',
        periods: recentHistory.length,
        avgRatio: (recentHistory.reduce((s, h) => s + h.ratios.h1.ratio, 0) / recentHistory.length).toFixed(2),
        token: pair.baseToken?.symbol,
        address: addr,
        price: pair.priceUsd,
      });
    }
  }
  
  return signals;
}

// Format alert message
function formatAlert(signal) {
  if (signal.type === 'HIGH_RATIO') {
    return `🔥 HIGH RATIO: ${signal.token}
Ratio: ${signal.ratio}x (${signal.buys}B/${signal.sells}S) [${signal.window}]
Price: $${parseFloat(signal.price).toFixed(6)}
Volume: $${Math.round(signal.volume24h).toLocaleString()}
Liq: $${Math.round(signal.liquidity).toLocaleString()}
Change: ${signal.priceChange?.toFixed(1)}%`;
  }
  if (signal.type === 'SUSTAINED_ACCUMULATION') {
    return `🎯 SUSTAINED ACCUMULATION: ${signal.token}
Avg Ratio: ${signal.avgRatio}x over ${signal.periods} periods
Price: $${parseFloat(signal.price).toFixed(6)}`;
  }
  return JSON.stringify(signal);
}

// Log alert
function logAlert(signal) {
  const ts = new Date().toISOString();
  const logFile = path.join(LOG_DIR, `alerts-${ts.split('T')[0]}.log`);
  fs.appendFileSync(logFile, `[${ts}] ${JSON.stringify(signal)}\n`);
}

// Main scan
async function scan(state) {
  console.log(`\n🔍 Momentum Scan - ${new Date().toISOString()}`);
  
  const alerts = [];
  const scanned = [];
  
  // Get trending tokens from all chains
  const allTrending = await fetch('https://api.dexscreener.com/token-boosts/top/v1')
    .then(r => r.json())
    .catch(() => []);
  
  // Filter to our chains
  const trending = allTrending.filter(t => CONFIG.CHAINS.includes(t.chainId));
  console.log(`Found ${trending.length} trending tokens on ${CONFIG.CHAINS.join(', ')}`);
  
  // Combine unique tokens with their chains
  const tokensToScan = new Map();  // address -> chainId
  trending.forEach(t => tokensToScan.set(t.tokenAddress, t.chainId));
  
  // Add watchlist (default to base)
  CONFIG.WATCHLIST.forEach(a => {
    if (!tokensToScan.has(a)) tokensToScan.set(a, 'base');
  });
  
  console.log(`Scanning ${tokensToScan.size} unique tokens...`);
  
  for (const [addr, chainId] of tokensToScan) {
    if (!addr) continue;
    
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
    
    const pair = await fetchTokenData(addr, chainId);
    if (!pair || !passesFilters(pair)) continue;
    
    scanned.push(pair.baseToken?.symbol);
    const signals = analyzeToken(pair, state);
    
    for (const sig of signals) {
      alerts.push(sig);
      logAlert(sig);
      console.log('\n' + formatAlert(sig));
      
      // Send notification
      await sendAlert(sig).catch(e => console.error('Alert error:', e.message));
      
      // Check for auto-trade
      if (AUTO_TRADE.enabled && 
          parseFloat(sig.ratio) >= AUTO_TRADE.minRatio &&
          sig.liquidity >= AUTO_TRADE.minLiquidity) {
        console.log(`🤖 AUTO-TRADE CANDIDATE: ${sig.token} @ ${sig.ratio}x`);
        // Log for manual review first
        const tradeFile = path.join(DATA_DIR, 'trade-candidates.json');
        let candidates = [];
        try { candidates = JSON.parse(fs.readFileSync(tradeFile, 'utf8')); } catch {}
        candidates.push({
          ...sig,
          suggestedPosition: AUTO_TRADE.maxPosition,
          stopLoss: AUTO_TRADE.stopLoss,
          timestamp: new Date().toISOString(),
        });
        fs.writeFileSync(tradeFile, JSON.stringify(candidates, null, 2));
      }
    }
  }
  
  state.lastScan = new Date().toISOString();
  saveState(state);
  
  console.log(`\n✅ Scanned ${scanned.length} tokens, found ${alerts.length} signals`);
  return alerts;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const state = loadState();
  
  if (args.includes('--watch')) {
    // Add tokens from args to watchlist
    const idx = args.indexOf('--watch');
    if (args[idx + 1]) {
      CONFIG.WATCHLIST.push(...args[idx + 1].split(','));
    }
  }
  
  if (args.includes('--auto-trade')) {
    AUTO_TRADE.enabled = true;
    console.log('⚠️  Auto-trade mode ENABLED (candidates logged to data/trade-candidates.json)');
  }
  
  if (args.includes('--loop')) {
    console.log(`Starting continuous scan (interval: ${CONFIG.SCAN_INTERVAL/1000}s)`);
    await scan(state);
    setInterval(() => scan(state), CONFIG.SCAN_INTERVAL);
  } else {
    await scan(state);
    process.exit(0);
  }
}

main().catch(console.error);
