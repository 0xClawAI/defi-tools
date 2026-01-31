#!/usr/bin/env node
/**
 * Paper Trader v2 - With Position Sizing
 */

const fs = require('fs');
const { getSize } = require('./position-sizing.js');

const TRADES_FILE = process.env.HOME + '/projects/defi-tools/data/paper-trades.json';

function loadTrades() {
  try {
    return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
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

async function openTrade(token, signal, overrideSize = null) {
  const price = await getPrice(token);
  if (!price) {
    console.error('Could not get price for', token);
    return;
  }
  
  // Get position size based on signal confidence
  const sizing = getSize(signal);
  const size = overrideSize || sizing.size;
  
  const data = loadTrades();
  const trade = {
    id: Date.now(),
    token,
    signal,
    conviction: sizing.level,
    entryPrice: parseFloat(price),
    entryTime: new Date().toISOString(),
    status: 'OPEN',
    size,
  };
  
  data.trades.push(trade);
  saveTrades(data);
  
  console.log(`📈 PAPER TRADE OPENED`);
  console.log(`Token: ${token}`);
  console.log(`Signal: ${signal} (${sizing.label})`);
  console.log(`Entry: $${price}`);
  console.log(`Size: $${size}`);
  
  return trade;
}

// CLI
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'buy':
    const [token, signal, customSize] = args;
    openTrade(token, signal || 'test', customSize ? parseFloat(customSize) : null);
    break;
  default:
    console.log('Usage: node paper-trader-v2.js buy <token> <signal> [custom_size]');
}
