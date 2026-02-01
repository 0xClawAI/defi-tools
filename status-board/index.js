#!/usr/bin/env node

/**
 * Status Board - Unified DeFi Status Dashboard
 * 
 * Aggregates:
 * - Wallet balances (ETH + Base)
 * - Open positions from trade journal
 * - Recent alerts
 * - Current market signals
 * 
 * Usage: node index.js [--json] [--compact]
 */

const fs = require('fs');
const path = require('path');

const { execSync } = require('child_process');

const DEFI_TOOLS = path.join(__dirname, '..');
const WALLET_ADDRESS = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const HYPERLIQUID_SCRIPTS = path.join(process.env.HOME, '.openclaw/workspace/skills/hyperliquid-trading/scripts');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function c(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Get wallet balance from Base
async function getWalletBalance() {
  try {
    const response = await fetch(
      `https://base.blockscout.com/api/v2/addresses/${WALLET_ADDRESS}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const ethBalance = parseFloat(data.coin_balance) / 1e18;
    return {
      eth: ethBalance,
      usd: ethBalance * 3200 // Rough ETH price estimate
    };
  } catch (e) {
    return null;
  }
}

// Get token balances
async function getTokenBalances() {
  try {
    const response = await fetch(
      `https://base.blockscout.com/api/v2/addresses/${WALLET_ADDRESS}/tokens?type=ERC-20`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.items?.slice(0, 5).map(t => ({
      symbol: t.token?.symbol || 'Unknown',
      balance: parseFloat(t.value) / Math.pow(10, t.token?.decimals || 18),
      name: t.token?.name || 'Unknown'
    })) || [];
  } catch (e) {
    return [];
  }
}

// Get open positions from trade journal
function getOpenPositions() {
  const journalPath = path.join(DEFI_TOOLS, 'trade-journal/data/trades.json');
  try {
    const data = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    return data.filter(t => t.status === 'open').map(t => ({
      symbol: t.symbol,
      type: t.type,
      entry: t.entryPrice,
      size: t.size,
      timestamp: t.timestamp,
      pnl: t.unrealizedPnL || 0
    }));
  } catch (e) {
    return [];
  }
}

// Get paper trade summary (quick sync check)
function getPaperTradeSummary() {
  const paperPath = path.join(DEFI_TOOLS, 'data/paper-trades.json');
  try {
    const data = JSON.parse(fs.readFileSync(paperPath, 'utf8'));
    const open = data.trades?.filter(t => !t.exitTime) || [];
    const totalCost = open.reduce((sum, t) => sum + (t.costBasis || 0), 0);
    return {
      count: open.length,
      totalCost,
      symbols: [...new Set(open.map(t => t.symbol || t.id))].slice(0, 5)
    };
  } catch (e) {
    return null;
  }
}

// Get recent alerts from alert-hub
function getRecentAlerts(limit = 5) {
  const alertsPath = path.join(DEFI_TOOLS, 'alert-hub/data/alerts.json');
  try {
    const data = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
    return data.slice(-limit).reverse().map(a => ({
      message: a.message,
      source: a.source,
      priority: a.priority,
      timestamp: a.timestamp
    }));
  } catch (e) {
    return [];
  }
}

// Get latest momentum signals
function getMomentumSignals() {
  const signalsPath = path.join(DEFI_TOOLS, 'momentum-scanner/data/signals.json');
  try {
    const data = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
    // Get signals from last hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return data.filter(s => new Date(s.timestamp).getTime() > oneHourAgo)
      .slice(-5)
      .reverse();
  } catch (e) {
    return [];
  }
}

// Get Hyperliquid account data (optional, can be slow)
function getHyperliquidData() {
  try {
    // Check if scripts exist
    if (!fs.existsSync(path.join(HYPERLIQUID_SCRIPTS, 'hyperliquid.mjs'))) {
      return null;
    }
    const result = execSync(
      `cd "${HYPERLIQUID_SCRIPTS}" && HYPERLIQUID_ADDRESS=${WALLET_ADDRESS} node hyperliquid.mjs balance 2>/dev/null`,
      { timeout: 15000, encoding: 'utf8' }
    );
    const data = JSON.parse(result);
    return {
      accountValue: parseFloat(data.marginSummary?.accountValue || 0),
      totalPosition: parseFloat(data.marginSummary?.totalNtlPos || 0),
      withdrawable: parseFloat(data.withdrawable || 0),
      positions: data.assetPositions || []
    };
  } catch (e) {
    return null;
  }
}

// Get PoI V2 credential status
async function getPoIStatus() {
  try {
    const { ethers } = require('ethers');
    const POI_V2_ADDRESS = '0x321cd306284b5Dc71E96973c879448cfEcCf334b';
    const ABI = [
      'function hasValidPoI(address agent) view returns (bool)',
      'function daysUntilExpiry(address agent) view returns (uint256)',
      'function getCredential(address agent) view returns (tuple(uint256 issuedAt, uint256 expiresAt, uint8 challengeType, uint256 blockSolved, bool valid, uint256 maintenanceCount, uint256 lastMaintained, uint8 reputation))'
    ];
    const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
    const contract = new ethers.Contract(POI_V2_ADDRESS, ABI, provider);
    
    const [hasValid, daysLeft, cred] = await Promise.all([
      contract.hasValidPoI(WALLET_ADDRESS),
      contract.daysUntilExpiry(WALLET_ADDRESS),
      contract.getCredential(WALLET_ADDRESS)
    ]);
    
    return {
      valid: hasValid,
      daysUntilExpiry: Number(daysLeft),
      reputation: Number(cred.reputation),
      maintenanceCount: Number(cred.maintenanceCount),
      expiresAt: new Date(Number(cred.expiresAt) * 1000).toISOString()
    };
  } catch (e) {
    return null;
  }
}

// Get latest funding rates
function getFundingRates() {
  const fundingPath = path.join(DEFI_TOOLS, 'funding-scanner/data/rates.json');
  try {
    const data = JSON.parse(fs.readFileSync(fundingPath, 'utf8'));
    // Return top 3 extreme funding rates
    const rates = Object.entries(data)
      .map(([symbol, rate]) => ({ symbol, rate: rate.annualized || rate }))
      .filter(r => Math.abs(r.rate) > 20)
      .sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
      .slice(0, 3);
    return rates;
  } catch (e) {
    return [];
  }
}

// Format time ago
function timeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Main status report
async function generateStatus(options = {}) {
  const status = {
    timestamp: new Date().toISOString(),
    wallet: null,
    tokens: [],
    hyperliquid: null,
    poi: null,
    positions: [],
    paperTrades: null,
    alerts: [],
    signals: [],
    funding: []
  };

  // Fetch all data in parallel
  const [balance, tokens, poi] = await Promise.all([
    getWalletBalance(),
    getTokenBalances(),
    getPoIStatus()
  ]);

  status.wallet = balance;
  status.tokens = tokens;
  status.poi = poi;
  // Hyperliquid is optional (can be slow) - skip with --no-hl
  if (!options.noHl) {
    status.hyperliquid = getHyperliquidData();
  }
  status.positions = getOpenPositions();
  status.paperTrades = getPaperTradeSummary();
  status.alerts = getRecentAlerts();
  status.signals = getMomentumSignals();
  status.funding = getFundingRates();

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return status;
  }

  // Pretty print
  console.log();
  console.log(c('bright', '═══════════════════════════════════════════════════════════'));
  console.log(c('bright', '                    📊 DEFI STATUS BOARD'));
  console.log(c('bright', '═══════════════════════════════════════════════════════════'));
  console.log(c('dim', `  ${new Date().toLocaleString()}`));
  console.log();

  // Wallet Section
  console.log(c('cyan', '┌─ 💰 WALLET ─────────────────────────────────────────────┐'));
  if (status.wallet) {
    console.log(`  ETH Balance: ${c('green', status.wallet.eth.toFixed(6))} ETH (~$${status.wallet.usd.toFixed(2)})`);
  } else {
    console.log(c('yellow', '  Unable to fetch wallet balance'));
  }
  
  if (status.tokens.length > 0) {
    console.log(c('dim', '  Tokens:'));
    status.tokens.forEach(t => {
      const balanceStr = t.balance > 1000 ? t.balance.toFixed(0) : t.balance.toFixed(4);
      console.log(`    ${t.symbol}: ${balanceStr}`);
    });
  }
  console.log();

  // Hyperliquid Section
  if (status.hyperliquid) {
    console.log(c('cyan', '┌─ ⚡ HYPERLIQUID ─────────────────────────────────────────┐'));
    const hl = status.hyperliquid;
    if (hl.accountValue > 0) {
      console.log(`  Account Value: ${c('green', '$' + hl.accountValue.toFixed(2))}`);
      console.log(`  Position Size: $${hl.totalPosition.toFixed(2)}`);
      console.log(`  Withdrawable:  $${hl.withdrawable.toFixed(2)}`);
      if (hl.positions.length > 0) {
        console.log(c('dim', '  Positions:'));
        hl.positions.forEach(p => {
          const side = p.position?.szi > 0 ? 'LONG' : 'SHORT';
          const sideColor = side === 'LONG' ? 'green' : 'red';
          console.log(`    ${c(sideColor, side)} ${p.position?.coin}: ${Math.abs(p.position?.szi)} @ $${p.position?.entryPx}`);
        });
      }
    } else {
      console.log(c('dim', '  No Hyperliquid balance'));
    }
    console.log();
  }

  // PoI V2 Section
  if (status.poi) {
    console.log(c('cyan', '┌─ 🧠 PROOF OF INTELLIGENCE V2 ───────────────────────────┐'));
    const poi = status.poi;
    const statusColor = poi.valid ? 'green' : 'red';
    const statusText = poi.valid ? '✅ Valid' : '❌ Invalid';
    console.log(`  Status: ${c(statusColor, statusText)}`);
    if (poi.valid) {
      const urgencyColor = poi.daysUntilExpiry <= 2 ? 'yellow' : 'green';
      console.log(`  Expires in: ${c(urgencyColor, poi.daysUntilExpiry + ' days')}`);
      console.log(`  Reputation: ${poi.reputation}/100`);
      console.log(`  Maintenance: ${poi.maintenanceCount} renewals`);
      if (poi.daysUntilExpiry <= 2) {
        console.log(c('yellow', '  ⚠️ Maintenance needed soon!'));
      }
    }
    console.log(c('dim', '  Contract: Base Sepolia (testnet)'));
    console.log();
  }

  // Positions Section
  console.log(c('cyan', '┌─ 📈 OPEN POSITIONS ─────────────────────────────────────┐'));
  if (status.positions.length === 0) {
    console.log(c('dim', '  No open positions'));
  } else {
    status.positions.forEach(p => {
      const typeColor = p.type === 'long' ? 'green' : 'red';
      const pnlColor = p.pnl >= 0 ? 'green' : 'red';
      console.log(`  ${c(typeColor, p.type.toUpperCase())} ${p.symbol} @ ${p.entry} | P&L: ${c(pnlColor, p.pnl.toFixed(2) + '%')}`);
    });
  }
  console.log();

  // Paper Trades Section
  if (status.paperTrades && status.paperTrades.count > 0) {
    console.log(c('cyan', '┌─ 📜 PAPER TRADES ────────────────────────────────────────┐'));
    console.log(`  ${status.paperTrades.count} open paper positions`);
    console.log(`  Cost basis: $${status.paperTrades.totalCost.toFixed(2)}`);
    console.log(`  Tokens: ${status.paperTrades.symbols.join(', ')}`);
    console.log(c('dim', '  Run: node paper-portfolio.js for P&L'));
    console.log();
  }

  // Alerts Section
  console.log(c('cyan', '┌─ 🔔 RECENT ALERTS ──────────────────────────────────────┐'));
  if (status.alerts.length === 0) {
    console.log(c('dim', '  No recent alerts'));
  } else {
    status.alerts.forEach(a => {
      const priorityIcon = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🟢';
      const msg = a.message.length > 50 ? a.message.substring(0, 47) + '...' : a.message;
      console.log(`  ${priorityIcon} ${msg}`);
      console.log(c('dim', `     ${a.source} • ${timeAgo(a.timestamp)}`));
    });
  }
  console.log();

  // Signals Section
  console.log(c('cyan', '┌─ 📡 ACTIVE SIGNALS ─────────────────────────────────────┐'));
  if (status.signals.length === 0) {
    console.log(c('dim', '  No active signals in last hour'));
  } else {
    status.signals.forEach(s => {
      const direction = s.direction || s.signal;
      const dirColor = direction === 'bullish' || direction === 'buy' ? 'green' : 'red';
      console.log(`  ${c(dirColor, '●')} ${s.symbol}: ${s.reason || direction} | Confidence: ${s.confidence || 'N/A'}`);
    });
  }
  console.log();

  // Funding Section
  if (status.funding.length > 0) {
    console.log(c('cyan', '┌─ 💸 EXTREME FUNDING ────────────────────────────────────┐'));
    status.funding.forEach(f => {
      const rateColor = f.rate > 0 ? 'red' : 'green';
      const direction = f.rate > 0 ? 'longs pay' : 'shorts pay';
      console.log(`  ${f.symbol}: ${c(rateColor, f.rate.toFixed(1) + '%')} APR (${direction})`);
    });
    console.log();
  }

  console.log(c('bright', '═══════════════════════════════════════════════════════════'));
  console.log();

  return status;
}

// CLI
const args = process.argv.slice(2);
const options = {
  json: args.includes('--json'),
  compact: args.includes('--compact'),
  noHl: args.includes('--no-hl') || args.includes('--fast')
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Status Board - Unified DeFi Status Dashboard

Usage: node index.js [options]

Options:
  --json       Output as JSON
  --compact    Compact output (fewer details)
  --no-hl      Skip Hyperliquid (faster)
  --fast       Same as --no-hl
  --help, -h   Show this help

Examples:
  node index.js              # Full status dashboard
  node index.js --json       # JSON output for scripts
  node index.js --fast       # Skip slow Hyperliquid API
`);
  process.exit(0);
}

generateStatus(options);
