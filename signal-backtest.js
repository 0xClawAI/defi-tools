#!/usr/bin/env node
/**
 * Signal Backtest
 * 
 * Analyzes historical signals to see which types are actually predictive.
 * Fetches current prices and compares to signal entry prices.
 */

const fs = require('fs');
const path = require('path');

const ALERTS_FILE = path.join(__dirname, 'momentum-scanner/data/pending-alerts.json');
const RESULTS_FILE = path.join(__dirname, 'data/backtest-results.json');

// Colors
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bright: '\x1b[1m'
};

async function getPrice(address) {
  // Try multiple chains (Solana addresses often have 'pump' suffix or are Base58)
  const chains = ['solana', 'base', 'ethereum'];
  
  for (const chain of chains) {
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${address}`, {
        signal: AbortSignal.timeout(5000)
      });
      const data = await res.json();
      const price = parseFloat(data[0]?.priceUsd);
      if (price) return price;
    } catch {}
  }
  return null;
}

function loadAlerts() {
  try {
    return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveResults(results) {
  const dir = path.dirname(RESULTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

async function backtest() {
  console.log(`\n${c.bright}${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bright}${c.cyan}              📊 SIGNAL BACKTEST RESULTS${c.reset}`);
  console.log(`${c.bright}${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

  const alerts = loadAlerts();
  if (alerts.length === 0) {
    console.log('No alerts to backtest.');
    return;
  }

  // Group by signal type
  const byType = {};
  
  for (const alert of alerts) {
    if (!alert.signal?.address || !alert.signal?.price) continue;
    
    const type = alert.signal.type || 'UNKNOWN';
    if (!byType[type]) {
      byType[type] = { signals: [], wins: 0, losses: 0, totalPnl: 0 };
    }
    byType[type].signals.push(alert);
  }

  const results = [];

  for (const [type, data] of Object.entries(byType)) {
    console.log(`${c.cyan}${type}${c.reset} (${data.signals.length} signals)`);
    
    // Sample up to 5 most recent signals per type
    const sample = data.signals.slice(-5);
    
    for (const alert of sample) {
      const sig = alert.signal;
      const entryPrice = parseFloat(sig.price);
      const currentPrice = await getPrice(sig.address);
      
      // Add small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
      
      if (!currentPrice) {
        console.log(`  ${c.dim}${sig.token}: Could not fetch price${c.reset}`);
        continue;
      }

      const pnl = ((currentPrice - entryPrice) / entryPrice * 100);
      const pnlColor = pnl >= 0 ? c.green : c.red;
      const sign = pnl >= 0 ? '+' : '';
      
      // Calculate time since signal
      const signalTime = new Date(alert.createdAt).getTime();
      const hoursAgo = ((Date.now() - signalTime) / 3600000).toFixed(1);

      console.log(`  ${sig.token}: ${c.dim}$${entryPrice}${c.reset} → ${c.dim}$${currentPrice.toFixed(8)}${c.reset} = ${pnlColor}${sign}${pnl.toFixed(1)}%${c.reset} (${hoursAgo}h ago)`);

      if (pnl >= 0) data.wins++;
      else data.losses++;
      data.totalPnl += pnl;

      results.push({
        type,
        token: sig.token,
        address: sig.address,
        entryPrice,
        currentPrice,
        pnl,
        signalTime: alert.createdAt,
        ratio: sig.ratio,
        window: sig.window
      });
    }

    const winRate = data.signals.length > 0 
      ? (data.wins / (data.wins + data.losses) * 100) 
      : 0;
    const avgPnl = results.filter(r => r.type === type).length > 0
      ? data.totalPnl / results.filter(r => r.type === type).length
      : 0;

    console.log(`  ${c.dim}Win rate: ${data.wins}/${data.wins + data.losses} (${winRate.toFixed(0)}%) | Avg P&L: ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%${c.reset}`);
    console.log();
  }

  // Summary
  const totalWins = results.filter(r => r.pnl >= 0).length;
  const totalLosses = results.filter(r => r.pnl < 0).length;
  const totalPnl = results.reduce((sum, r) => sum + r.pnl, 0);
  const avgPnl = results.length > 0 ? totalPnl / results.length : 0;

  console.log(`${c.cyan}───────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.bright}OVERALL${c.reset}`);
  console.log(`  Signals tested: ${results.length}`);
  console.log(`  Win rate: ${totalWins}/${totalWins + totalLosses} (${((totalWins / (totalWins + totalLosses)) * 100).toFixed(0)}%)`);
  const avgColor = avgPnl >= 0 ? c.green : c.red;
  console.log(`  Average P&L: ${avgColor}${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%${c.reset}`);
  console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

  // Save results
  saveResults({
    timestamp: new Date().toISOString(),
    results,
    summary: {
      totalSignals: results.length,
      wins: totalWins,
      losses: totalLosses,
      winRate: totalWins / (totalWins + totalLosses) * 100,
      avgPnl
    }
  });

  console.log(`${c.dim}Results saved to data/backtest-results.json${c.reset}\n`);
}

backtest();
