#!/usr/bin/env node
/**
 * Trade Journal v1.0
 * 
 * Track trades, calculate P&L, analyze performance.
 * Integrates with Alert Hub for notifications.
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
  DATA_DIR: path.join(__dirname, 'data'),
  TRADES_FILE: path.join(__dirname, 'data', 'trades.json'),
  STATS_FILE: path.join(__dirname, 'data', 'stats.json'),
};

// Ensure data dir exists
if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

// Load/save trades
function loadTrades() {
  if (fs.existsSync(CONFIG.TRADES_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG.TRADES_FILE, 'utf8'));
  }
  return [];
}

function saveTrades(trades) {
  fs.writeFileSync(CONFIG.TRADES_FILE, JSON.stringify(trades, null, 2));
}

// Generate trade ID
function generateId() {
  return `T${Date.now().toString(36).toUpperCase()}`;
}

// Open a new trade
async function openTrade(symbol, side, entryPrice, amount, note = '') {
  const trades = loadTrades();
  
  const trade = {
    id: generateId(),
    symbol: symbol.toUpperCase(),
    side: side.toLowerCase(), // 'long' or 'short'
    entryPrice: parseFloat(entryPrice),
    amount: parseFloat(amount),
    value: parseFloat(entryPrice) * parseFloat(amount),
    entryTime: new Date().toISOString(),
    exitPrice: null,
    exitTime: null,
    pnl: null,
    pnlPercent: null,
    status: 'open',
    note,
    source: 'manual',
  };
  
  trades.push(trade);
  saveTrades(trades);
  
  console.log(`\n✅ Trade opened: ${trade.id}`);
  console.log(`   ${trade.side.toUpperCase()} ${trade.symbol}`);
  console.log(`   Entry: $${trade.entryPrice.toFixed(6)} x ${trade.amount}`);
  console.log(`   Value: $${trade.value.toFixed(2)}`);
  
  if (alertHub) {
    await alertHub.sendAlert({
      message: `📈 Trade opened: ${trade.side.toUpperCase()} ${trade.symbol} @ $${trade.entryPrice.toFixed(6)} ($${trade.value.toFixed(2)})`,
      severity: 'info',
      source: 'custom',
      type: 'trade_open',
    });
  }
  
  return trade;
}

// Close a trade
async function closeTrade(tradeId, exitPrice, note = '') {
  const trades = loadTrades();
  const trade = trades.find(t => t.id === tradeId || t.symbol === tradeId.toUpperCase());
  
  if (!trade) {
    console.log(`❌ Trade not found: ${tradeId}`);
    return null;
  }
  
  if (trade.status !== 'open') {
    console.log(`❌ Trade already closed: ${trade.id}`);
    return null;
  }
  
  trade.exitPrice = parseFloat(exitPrice);
  trade.exitTime = new Date().toISOString();
  
  // Calculate P&L
  const entryValue = trade.entryPrice * trade.amount;
  const exitValue = trade.exitPrice * trade.amount;
  
  if (trade.side === 'long') {
    trade.pnl = exitValue - entryValue;
  } else {
    trade.pnl = entryValue - exitValue;
  }
  
  trade.pnlPercent = (trade.pnl / entryValue) * 100;
  trade.status = 'closed';
  if (note) trade.exitNote = note;
  
  saveTrades(trades);
  
  const pnlIcon = trade.pnl >= 0 ? '🟢' : '🔴';
  const pnlSign = trade.pnl >= 0 ? '+' : '';
  
  console.log(`\n${pnlIcon} Trade closed: ${trade.id}`);
  console.log(`   ${trade.side.toUpperCase()} ${trade.symbol}`);
  console.log(`   Entry: $${trade.entryPrice.toFixed(6)} → Exit: $${trade.exitPrice.toFixed(6)}`);
  console.log(`   P&L: ${pnlSign}$${trade.pnl.toFixed(2)} (${pnlSign}${trade.pnlPercent.toFixed(2)}%)`);
  
  if (alertHub) {
    await alertHub.sendAlert({
      message: `${pnlIcon} Trade closed: ${trade.symbol} ${pnlSign}$${trade.pnl.toFixed(2)} (${pnlSign}${trade.pnlPercent.toFixed(2)}%)`,
      severity: trade.pnl >= 0 ? 'info' : 'warning',
      source: 'custom',
      type: 'trade_close',
    });
  }
  
  return trade;
}

// List open trades
function listOpen() {
  const trades = loadTrades().filter(t => t.status === 'open');
  
  if (trades.length === 0) {
    console.log('\n📋 No open trades');
    return;
  }
  
  console.log(`\n📋 Open Trades (${trades.length})\n`);
  
  for (const t of trades) {
    const holdTime = timeSince(new Date(t.entryTime));
    console.log(`  ${t.id}: ${t.side.toUpperCase()} ${t.symbol}`);
    console.log(`    Entry: $${t.entryPrice.toFixed(6)} x ${t.amount} = $${t.value.toFixed(2)}`);
    console.log(`    Opened: ${holdTime} ago`);
    if (t.note) console.log(`    Note: ${t.note}`);
    console.log('');
  }
}

// List closed trades
function listClosed(limit = 10) {
  const trades = loadTrades()
    .filter(t => t.status === 'closed')
    .sort((a, b) => new Date(b.exitTime) - new Date(a.exitTime))
    .slice(0, limit);
  
  if (trades.length === 0) {
    console.log('\n📋 No closed trades');
    return;
  }
  
  console.log(`\n📋 Recent Closed Trades (${trades.length})\n`);
  
  for (const t of trades) {
    const pnlIcon = t.pnl >= 0 ? '🟢' : '🔴';
    const pnlSign = t.pnl >= 0 ? '+' : '';
    
    console.log(`  ${pnlIcon} ${t.id}: ${t.side.toUpperCase()} ${t.symbol}`);
    console.log(`    $${t.entryPrice.toFixed(6)} → $${t.exitPrice.toFixed(6)}`);
    console.log(`    P&L: ${pnlSign}$${t.pnl.toFixed(2)} (${pnlSign}${t.pnlPercent.toFixed(2)}%)`);
    console.log('');
  }
}

// Calculate overall stats
function showStats() {
  const trades = loadTrades().filter(t => t.status === 'closed');
  
  if (trades.length === 0) {
    console.log('\n📊 No closed trades yet');
    return;
  }
  
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgPnl = totalPnl / trades.length;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  
  const winRate = (wins.length / trades.length) * 100;
  
  const bestTrade = trades.reduce((best, t) => t.pnl > best.pnl ? t : best, trades[0]);
  const worstTrade = trades.reduce((worst, t) => t.pnl < worst.pnl ? t : worst, trades[0]);
  
  const totalVolume = trades.reduce((sum, t) => sum + t.value, 0);
  
  console.log('\n📊 Trading Statistics\n');
  console.log(`  Total Trades: ${trades.length}`);
  console.log(`  Win Rate: ${winRate.toFixed(1)}% (${wins.length}W / ${losses.length}L)`);
  console.log(`  `);
  console.log(`  Total P&L: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
  console.log(`  Avg P&L: ${avgPnl >= 0 ? '+' : ''}$${avgPnl.toFixed(2)}`);
  console.log(`  Avg Win: +$${avgWin.toFixed(2)}`);
  console.log(`  Avg Loss: $${avgLoss.toFixed(2)}`);
  console.log(`  `);
  console.log(`  Best Trade: ${bestTrade.symbol} +$${bestTrade.pnl.toFixed(2)} (+${bestTrade.pnlPercent.toFixed(1)}%)`);
  console.log(`  Worst Trade: ${worstTrade.symbol} $${worstTrade.pnl.toFixed(2)} (${worstTrade.pnlPercent.toFixed(1)}%)`);
  console.log(`  `);
  console.log(`  Total Volume: $${totalVolume.toFixed(2)}`);
  
  // By symbol
  const bySymbol = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { count: 0, pnl: 0 };
    bySymbol[t.symbol].count++;
    bySymbol[t.symbol].pnl += t.pnl;
  }
  
  console.log('\n  By Symbol:');
  for (const [sym, data] of Object.entries(bySymbol).sort((a, b) => b[1].pnl - a[1].pnl)) {
    const sign = data.pnl >= 0 ? '+' : '';
    console.log(`    ${sym}: ${data.count} trades, ${sign}$${data.pnl.toFixed(2)}`);
  }
}

// Time since helper
function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Import trade from external source
async function importTrade(data) {
  const trades = loadTrades();
  
  const trade = {
    id: data.id || generateId(),
    symbol: (data.symbol || data.coin).toUpperCase(),
    side: (data.side || 'long').toLowerCase(),
    entryPrice: parseFloat(data.entryPrice || data.entry),
    amount: parseFloat(data.amount || data.size || 0),
    value: parseFloat(data.value || 0),
    entryTime: data.entryTime || new Date().toISOString(),
    exitPrice: data.exitPrice ? parseFloat(data.exitPrice) : null,
    exitTime: data.exitTime || null,
    pnl: data.pnl ? parseFloat(data.pnl) : null,
    pnlPercent: data.pnlPercent ? parseFloat(data.pnlPercent) : null,
    status: data.exitPrice ? 'closed' : 'open',
    note: data.note || '',
    source: data.source || 'import',
  };
  
  if (!trade.value && trade.entryPrice && trade.amount) {
    trade.value = trade.entryPrice * trade.amount;
  }
  
  trades.push(trade);
  saveTrades(trades);
  
  console.log(`✅ Imported: ${trade.id} - ${trade.symbol}`);
  return trade;
}

// Export trades to CSV
function exportCsv(outputPath) {
  const trades = loadTrades();
  
  const headers = ['id', 'symbol', 'side', 'entryPrice', 'exitPrice', 'amount', 'value', 'pnl', 'pnlPercent', 'status', 'entryTime', 'exitTime', 'note'];
  const csv = [headers.join(',')];
  
  for (const t of trades) {
    csv.push(headers.map(h => {
      const val = t[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val;
    }).join(','));
  }
  
  const out = outputPath || path.join(CONFIG.DATA_DIR, 'trades.csv');
  fs.writeFileSync(out, csv.join('\n'));
  console.log(`✅ Exported ${trades.length} trades to ${out}`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'help';

(async () => {
  switch (command) {
    case 'open':
      // open <symbol> <side> <price> <amount> [note]
      if (args.length < 5) {
        console.log('Usage: journal open <symbol> <side> <price> <amount> [note]');
        console.log('Example: journal open SOL long 150.25 0.5 "Momentum signal"');
        break;
      }
      await openTrade(args[1], args[2], args[3], args[4], args.slice(5).join(' '));
      break;
      
    case 'close':
      // close <tradeId|symbol> <exitPrice> [note]
      if (args.length < 3) {
        console.log('Usage: journal close <tradeId|symbol> <exitPrice> [note]');
        console.log('Example: journal close SOL 155.50 "Target hit"');
        break;
      }
      await closeTrade(args[1], args[2], args.slice(3).join(' '));
      break;
      
    case 'list':
    case 'open-trades':
      listOpen();
      break;
      
    case 'closed':
    case 'history':
      listClosed(parseInt(args[1]) || 10);
      break;
      
    case 'stats':
      showStats();
      break;
      
    case 'export':
      exportCsv(args[1]);
      break;
      
    case 'help':
    default:
      console.log(`
Trade Journal v1.0

Usage:
  node journal.js open <symbol> <side> <price> <amount> [note]
      Open a new trade (side: long/short)
      
  node journal.js close <tradeId|symbol> <exitPrice> [note]
      Close an open trade
      
  node journal.js list
      Show open trades
      
  node journal.js history [limit]
      Show closed trades (default: 10)
      
  node journal.js stats
      Show trading statistics
      
  node journal.js export [path]
      Export trades to CSV

Examples:
  node journal.js open SOL long 150.25 0.5 "Momentum signal"
  node journal.js close SOL 165.00 "Target hit"
  node journal.js stats
`);
  }
})();
