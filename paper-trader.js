#!/usr/bin/env node
/**
 * Paper Trading System
 * Tracks hypothetical trades with real prices
 */

const fs = require('fs');
const TRADES_FILE = process.env.HOME + '/projects/defi-tools/data/paper-trades.json';

// Ensure data dir exists
const dataDir = process.env.HOME + '/projects/defi-tools/data';
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function loadTrades() {
  try {
    const data = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    // Ensure stats object exists (migrate old format)
    if (!data.stats) {
      data.stats = { totalPnL: 0, wins: 0, losses: 0 };
    }
    return data;
  } catch {
    return { trades: [], stats: { totalPnL: 0, wins: 0, losses: 0 } };
  }
}

function saveTrades(data) {
  fs.writeFileSync(TRADES_FILE, JSON.stringify(data, null, 2));
}

async function getPrice(token) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${token}`);
  const data = await res.json();
  return data.pairs?.[0]?.priceUsd || null;
}

async function openTrade(token, signal, confidence) {
  const price = await getPrice(token);
  if (!price) {
    console.error('Could not get price for', token);
    return;
  }
  
  const data = loadTrades();
  const trade = {
    id: Date.now(),
    token,
    signal,
    confidence,
    entryPrice: parseFloat(price),
    entryTime: new Date().toISOString(),
    status: 'OPEN',
    size: 1, // $1 paper position
  };
  
  data.trades.push(trade);
  saveTrades(data);
  
  console.log(`📈 PAPER TRADE OPENED`);
  console.log(`Token: ${token}`);
  console.log(`Signal: ${signal}`);
  console.log(`Entry: $${price}`);
  console.log(`Size: $1 (paper)`);
  
  return trade;
}

async function closeTrade(id, reason) {
  const data = loadTrades();
  const trade = data.trades.find(t => t.id === id && t.status === 'OPEN');
  
  if (!trade) {
    console.error('Trade not found or already closed');
    return;
  }
  
  const price = await getPrice(trade.token);
  if (!price) {
    console.error('Could not get exit price');
    return;
  }
  
  trade.exitPrice = parseFloat(price);
  trade.exitTime = new Date().toISOString();
  trade.pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2);
  trade.pnlUsd = (trade.size * trade.pnlPercent / 100).toFixed(4);
  trade.status = 'CLOSED';
  trade.closeReason = reason;
  
  // Update stats
  data.stats.totalPnL += parseFloat(trade.pnlUsd);
  if (parseFloat(trade.pnlPercent) > 0) data.stats.wins++;
  else data.stats.losses++;
  
  saveTrades(data);
  
  console.log(`📉 PAPER TRADE CLOSED`);
  console.log(`Token: ${trade.token}`);
  console.log(`Entry: $${trade.entryPrice} → Exit: $${trade.exitPrice}`);
  console.log(`PnL: ${trade.pnlPercent}% ($${trade.pnlUsd})`);
  console.log(`Reason: ${reason}`);
  
  return trade;
}

function showStats() {
  const data = loadTrades();
  const open = data.trades.filter(t => t.status === 'OPEN');
  const closed = data.trades.filter(t => t.status === 'CLOSED');
  
  console.log(`\n📊 PAPER TRADING STATS`);
  console.log(`Open positions: ${open.length}`);
  console.log(`Closed trades: ${closed.length}`);
  console.log(`Win rate: ${data.stats.wins}/${closed.length} (${closed.length ? (data.stats.wins/closed.length*100).toFixed(1) : 0}%)`);
  console.log(`Total PnL: $${data.stats.totalPnL.toFixed(4)}`);
  
  if (open.length) {
    console.log(`\nOpen positions:`);
    open.forEach(t => console.log(`  - ${t.token}: $${t.entryPrice} (${t.signal})`));
  }
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'buy':
    openTrade(args[0], args[1] || 'manual', args[2] || 'medium');
    break;
  case 'sell':
    closeTrade(parseInt(args[0]), args[1] || 'manual');
    break;
  case 'stats':
    showStats();
    break;
  default:
    console.log(`
Paper Trading System
====================
Commands:
  buy <token> [signal] [confidence]  - Open paper trade
  sell <trade_id> [reason]           - Close paper trade  
  stats                              - Show performance

Example:
  node paper-trader.js buy MOLTBOOK dip-buy high
  node paper-trader.js sell 1234567890 take-profit
  node paper-trader.js stats
`);
}
