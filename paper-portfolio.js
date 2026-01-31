#!/usr/bin/env node
/**
 * Paper Portfolio Value Checker
 * Shows unrealized P&L for open paper trades
 */

const fs = require('fs');
const TRADES_FILE = process.env.HOME + '/projects/defi-tools/data/paper-trades.json';

// Colors
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function loadTrades() {
  try {
    return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
  } catch {
    return { trades: [] };
  }
}

async function getPrice(address, chain = 'solana') {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${address}`, {
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    return parseFloat(data[0]?.priceUsd) || null;
  } catch {
    return null;
  }
}

async function checkPortfolio() {
  const data = loadTrades();
  const openTrades = data.trades.filter(t => !t.exitTime);
  
  if (openTrades.length === 0) {
    console.log('No open paper positions.');
    return;
  }

  console.log(`\n${c.cyan}═══════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.cyan}              📜 PAPER PORTFOLIO STATUS${c.reset}`);
  console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

  let totalCost = 0;
  let totalValue = 0;
  const results = [];

  for (const trade of openTrades) {
    const address = trade.token;
    const chain = trade.chain || 'solana';
    const currentPrice = await getPrice(address, chain);
    
    if (!currentPrice) {
      results.push({
        symbol: trade.symbol || trade.id,
        status: 'ERROR',
        message: 'Could not fetch price'
      });
      continue;
    }

    const entryPrice = trade.entryPrice;
    const costBasis = trade.costBasis || trade.size || 1;
    const currentValue = (costBasis / entryPrice) * currentPrice;
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice * 100);
    const pnlUsd = currentValue - costBasis;

    totalCost += costBasis;
    totalValue += currentValue;

    results.push({
      symbol: trade.symbol || trade.id,
      entryPrice,
      currentPrice,
      costBasis,
      currentValue,
      pnlPercent,
      pnlUsd,
      reason: trade.reason?.substring(0, 40) || ''
    });
  }

  // Display results
  for (const r of results) {
    if (r.status === 'ERROR') {
      console.log(`${c.yellow}⚠️  ${r.symbol}: ${r.message}${c.reset}`);
      continue;
    }

    const pnlColor = r.pnlPercent >= 0 ? c.green : c.red;
    const pnlSign = r.pnlPercent >= 0 ? '+' : '';

    console.log(`${c.cyan}${r.symbol}${c.reset}`);
    console.log(`  Entry: $${r.entryPrice.toFixed(8)} → Now: $${r.currentPrice.toFixed(8)}`);
    console.log(`  Cost: $${r.costBasis.toFixed(2)} → Value: $${r.currentValue.toFixed(2)}`);
    console.log(`  P&L: ${pnlColor}${pnlSign}${r.pnlPercent.toFixed(2)}%${c.reset} (${pnlColor}${pnlSign}$${r.pnlUsd.toFixed(2)}${c.reset})`);
    if (r.reason) console.log(`  ${c.dim}${r.reason}...${c.reset}`);
    console.log();
  }

  // Summary
  const totalPnl = totalValue - totalCost;
  const totalPnlPercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;
  const summaryColor = totalPnl >= 0 ? c.green : c.red;
  const sign = totalPnl >= 0 ? '+' : '';

  console.log(`${c.cyan}───────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.cyan}TOTAL${c.reset}`);
  console.log(`  Cost Basis: $${totalCost.toFixed(2)}`);
  console.log(`  Current Value: $${totalValue.toFixed(2)}`);
  console.log(`  ${summaryColor}P&L: ${sign}${totalPnlPercent.toFixed(2)}% (${sign}$${totalPnl.toFixed(2)})${c.reset}`);
  console.log(`${c.cyan}═══════════════════════════════════════════════════════${c.reset}\n`);

  // JSON output option
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      positions: results,
      summary: { totalCost, totalValue, totalPnl, totalPnlPercent }
    }, null, 2));
  }
}

checkPortfolio();
