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
const { isTokenSafe, analyzeTokenSafety } = require('./token-safety');
const { validateSignalWithTrend, getTrendEmoji, calculateTrendScore } = require('./trend-filter');

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
  MIN_SAFETY_SCORE: 60,    // Minimum GoPlusLabs safety score (NEW)
  REQUIRE_LOCKED_LP: false, // Require locked liquidity (optional)
  MAX_TOP_HOLDER_PCT: 50,  // Reject if top holder >50% (NEW)
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
  const safetyLine = signal.safetyScore 
    ? `Safety: ${signal.safetyScore}/100 ${signal.liquidityLocked ? '🔒' : '🔓'} | Holders: ${signal.holderCount?.toLocaleString() || '?'}`
    : '';
  
  const trendLine = signal.trendScore !== undefined
    ? `Trend: ${signal.trendEmoji || '?'} ${signal.trend} (${signal.trendScore}/100)`
    : '';
  
  if (signal.type === 'HIGH_RATIO') {
    return `🔥 HIGH RATIO: ${signal.token}
Ratio: ${signal.ratio}x (${signal.buys}B/${signal.sells}S) [${signal.window}]
Price: $${parseFloat(signal.price).toFixed(6)}
Volume: $${Math.round(signal.volume24h).toLocaleString()}
Liq: $${Math.round(signal.liquidity).toLocaleString()}
Change: ${signal.priceChange?.toFixed(1)}%
${trendLine}
${safetyLine}`;
  }
  if (signal.type === 'SUSTAINED_ACCUMULATION') {
    return `🎯 SUSTAINED ACCUMULATION: ${signal.token}
Avg Ratio: ${signal.avgRatio}x over ${signal.periods} periods
Price: $${parseFloat(signal.price).toFixed(6)}
${trendLine}
${safetyLine}`;
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
    
    // Skip if no signals to check
    if (signals.length === 0) continue;
    
    // === SAFETY CHECK (NEW) ===
    // Only check tokens that have potential signals (saves API calls)
    const safety = await analyzeTokenSafety(addr, chainId);
    
    // If we couldn't get safety data, be conservative
    if (!safety || safety.score === undefined) {
      console.log(`  ⚠️ ${pair.baseToken?.symbol}: No safety data - SKIPPED`);
      continue;
    }
    
    if (safety.score < CONFIG.MIN_SAFETY_SCORE) {
      console.log(`  ❌ ${pair.baseToken?.symbol}: Safety score ${safety.score}/100 - REJECTED`);
      if (safety.risks?.length > 0) {
        console.log(`     Risks: ${safety.risks.slice(0, 3).join(', ')}`);
      }
      continue;
    }
    
    // Check holder concentration
    if (safety.details?.topHolderPercent > CONFIG.MAX_TOP_HOLDER_PCT) {
      console.log(`  ❌ ${pair.baseToken?.symbol}: Top holder owns ${safety.details.topHolderPercent.toFixed(1)}% - REJECTED`);
      continue;
    }
    
    // Optional: require locked liquidity
    if (CONFIG.REQUIRE_LOCKED_LP && !safety.details?.liquidityLocked) {
      console.log(`  ❌ ${pair.baseToken?.symbol}: Liquidity not locked - REJECTED`);
      continue;
    }
    
    console.log(`  ✅ ${pair.baseToken?.symbol}: Safety ${safety.score}/100`);
    
    // === TREND FILTER (NEW - addresses 0% win rate issue) ===
    // Validate signals against price trend to prevent "catching falling knives"
    const trendCheck = calculateTrendScore(pair.priceChange || {});
    const trendEmoji = getTrendEmoji(trendCheck.score);
    
    // Filter signals through trend validation
    const validatedSignals = [];
    for (const sig of signals) {
      const ratio = parseFloat(sig.ratio) || 0;
      const validation = validateSignalWithTrend(pair, ratio);
      
      if (!validation.valid) {
        console.log(`  ⚠️ ${pair.baseToken?.symbol}: Signal BLOCKED by trend filter`);
        console.log(`     ${trendEmoji} Trend: ${validation.trend} (score: ${validation.trendScore})`);
        console.log(`     Reason: ${validation.reason}`);
        // Log blocked signal for analysis
        const blockedFile = path.join(DATA_DIR, 'blocked-signals.json');
        let blocked = [];
        try { blocked = JSON.parse(fs.readFileSync(blockedFile, 'utf8')); } catch {}
        blocked.push({
          ...sig,
          blockedReason: validation.reason,
          trendScore: validation.trendScore,
          trend: validation.trend,
          trendDetails: validation.details,
          timestamp: new Date().toISOString(),
        });
        // Keep last 100 blocked signals
        if (blocked.length > 100) blocked = blocked.slice(-100);
        fs.writeFileSync(blockedFile, JSON.stringify(blocked, null, 2));
        continue;
      }
      
      // Add trend info to valid signal
      sig.trendScore = trendCheck.score;
      sig.trend = trendCheck.trend;
      sig.trendEmoji = trendEmoji;
      validatedSignals.push(sig);
    }
    
    // Process only validated signals
    for (const sig of validatedSignals) {
      // Add safety info to signal
      sig.safetyScore = safety.score;
      sig.liquidityLocked = safety.details.liquidityLocked;
      sig.holderCount = safety.details.holderCount;
      sig.topHolderPct = safety.details.topHolderPercent;
      
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
// Show blocked signals (for analysis)
function showBlockedSignals(limit = 10) {
  const blockedFile = path.join(DATA_DIR, 'blocked-signals.json');
  let blocked = [];
  try { blocked = JSON.parse(fs.readFileSync(blockedFile, 'utf8')); } catch {}
  
  if (blocked.length === 0) {
    console.log('No blocked signals recorded yet.');
    return;
  }
  
  console.log(`\n📊 BLOCKED SIGNALS (last ${Math.min(limit, blocked.length)} of ${blocked.length})\n`);
  console.log('These signals were filtered out by the trend filter.\n');
  
  const recent = blocked.slice(-limit).reverse();
  for (const sig of recent) {
    console.log(`❌ ${sig.token} @ ${sig.timestamp?.split('T')[0] || '?'}`);
    console.log(`   Ratio: ${sig.ratio}x | Trend: ${sig.trend} (${sig.trendScore}/100)`);
    console.log(`   Reason: ${sig.blockedReason}`);
    if (sig.trendDetails) {
      const d = sig.trendDetails;
      console.log(`   Price changes: m5:${d.m5?.toFixed(1)}% h1:${d.h1?.toFixed(1)}% h6:${d.h6?.toFixed(1)}% h24:${d.h24?.toFixed(1)}%`);
    }
    console.log('');
  }
  
  // Stats
  const trends = {};
  blocked.forEach(b => {
    trends[b.trend] = (trends[b.trend] || 0) + 1;
  });
  console.log('Blocked by trend type:');
  Object.entries(trends).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => {
    console.log(`  ${t}: ${c}`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const state = loadState();
  
  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Momentum Ratio Scanner v2.1 (with Trend Filter)

Usage:
  node scanner.js             Single scan
  node scanner.js --loop      Continuous monitoring
  node scanner.js --watch 0x... Add addresses to watchlist
  node scanner.js --blocked   View blocked signals (trend filtered)
  node scanner.js --auto-trade Enable auto-trade candidate logging

Filters:
  - Safety score >= ${CONFIG.MIN_SAFETY_SCORE}/100 (GoPlusLabs)
  - Trend score >= 60/100 (prevents downtrend false positives)
  - Volume >= $${CONFIG.MIN_VOLUME_24H.toLocaleString()}
  - Liquidity >= $${CONFIG.MIN_LIQUIDITY.toLocaleString()}
  - Token age >= ${CONFIG.MIN_AGE_HOURS}h
  - Max 24h drop: ${CONFIG.MAX_DROP_24H}%
`);
    process.exit(0);
  }
  
  // View blocked signals
  if (args.includes('--blocked')) {
    const limitIdx = args.indexOf('--blocked');
    const limit = parseInt(args[limitIdx + 1]) || 10;
    showBlockedSignals(limit);
    process.exit(0);
  }
  
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
