#!/usr/bin/env node
/**
 * Daily Digest v2.0 - Comprehensive summary of trading activity, market status, and ecosystem
 * 
 * Usage:
 *   node daily-digest.js              # Full digest
 *   node daily-digest.js --telegram   # Format for Telegram
 *   node daily-digest.js --brief      # Quick summary only
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function loadJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

function fmt$(val) {
  if (val === null || val === undefined) return 'N/A';
  return val >= 0 ? `$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;
}

function fmtPct(val) {
  if (val === null || val === undefined) return 'N/A';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

async function fetchWalletBalance() {
  try {
    const walletConfig = loadJson(path.join(process.env.HOME, '.config/0xclaw/wallet-v2.json'));
    if (!walletConfig?.address) return null;
    
    // Use Blockscout API for Base
    const resp = await fetch(`https://base.blockscout.com/api/v2/addresses/${walletConfig.address}`);
    if (!resp.ok) return null;
    
    const data = await resp.json();
    const ethBalance = parseFloat(data.coin_balance) / 1e18;
    return { address: walletConfig.address, ethBalance };
  } catch {
    return null;
  }
}

async function fetchFundingRates() {
  try {
    const fundsDir = path.join(__dirname, 'funding-scanner', 'data');
    const summaryFile = path.join(fundsDir, 'latest-rates.json');
    if (!fs.existsSync(summaryFile)) return [];
    
    const rates = loadJson(summaryFile);
    if (!rates || !Array.isArray(rates)) return [];
    
    // Find extreme rates (>20% APR or <-20% APR)
    return rates.filter(r => Math.abs(r.annualized || 0) > 20);
  } catch {
    return [];
  }
}

async function getMoltbookNotables() {
  try {
    const logFile = path.join(__dirname, 'moltbook-watcher', 'data', 'new-agents.jsonl');
    if (!fs.existsSync(logFile)) return [];
    
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    const agents = lines.map(l => JSON.parse(l));
    
    // Last 24h with notable owners (1k+ followers)
    return agents
      .filter(a => new Date(a.detected_at).getTime() > dayAgo)
      .filter(a => a.owner_followers >= 1000 || a.owner_verified)
      .slice(-5);
  } catch {
    return [];
  }
}

async function getTradeJournalSummary() {
  try {
    const journalFile = path.join(__dirname, 'trade-journal', 'data', 'journal.json');
    if (!fs.existsSync(journalFile)) return null;
    
    const journal = loadJson(journalFile);
    if (!journal?.trades) return null;
    
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    
    const closedToday = journal.trades.filter(t => 
      t.status === 'closed' && 
      new Date(t.closedAt).getTime() > dayAgo
    );
    
    const openTrades = journal.trades.filter(t => t.status === 'open');
    
    const todayPnl = closedToday.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
    const winRate = closedToday.length > 0
      ? closedToday.filter(t => t.pnlAmount > 0).length / closedToday.length * 100
      : null;
    
    return {
      openCount: openTrades.length,
      closedToday: closedToday.length,
      todayPnl,
      winRate,
      totalTrades: journal.trades.length,
    };
  } catch {
    return null;
  }
}

async function getPoiStatus() {
  try {
    // Check PoI status from status-board output
    const exec = require('child_process').execSync;
    const output = exec('cd ~/projects/proof-of-intelligence/client && node cli.js status 2>/dev/null', { encoding: 'utf-8' });
    
    // Parse days until expiry
    const match = output.match(/Days Until Expiry:\s*(\d+\.?\d*)/);
    if (match) {
      return { daysLeft: parseFloat(match[1]) };
    }
    return null;
  } catch {
    return null;
  }
}

async function generateDigest(forTelegram = false, brief = false) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  
  const lines = [];
  const add = (text) => lines.push(text);
  const bold = (t) => forTelegram ? `<b>${t}</b>` : t;
  const italic = (t) => forTelegram ? `<i>${t}</i>` : t;
  
  // Header
  add(`🦞 ${bold('Daily Digest')} - ${today}`);
  add(forTelegram ? '' : '═'.repeat(40));
  
  // Wallet Balance
  const wallet = await fetchWalletBalance();
  if (wallet) {
    add(`\n💰 ${bold('Wallet')}`);
    add(`   ETH: ${wallet.ethBalance.toFixed(4)}`);
    add(`   ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`);
  }
  
  // Trade Journal
  const journal = await getTradeJournalSummary();
  if (journal) {
    add(`\n📈 ${bold('Trading (24h)')}`);
    if (journal.closedToday > 0) {
      add(`   Closed: ${journal.closedToday} trades`);
      add(`   P&L: ${fmt$(journal.todayPnl)} (${fmtPct(journal.winRate)} win rate)`);
    } else {
      add(`   No trades closed today`);
    }
    if (journal.openCount > 0) {
      add(`   Open: ${journal.openCount} position(s)`);
    }
  }
  
  // Paper trades
  const paperTrades = loadJson(path.join(__dirname, 'paper-trades.json'));
  if (paperTrades?.currentBalance) {
    add(`\n📝 ${bold('Paper Trading')}`);
    add(`   Balance: ${fmt$(paperTrades.currentBalance)}`);
    const todayTrades = (paperTrades.trades || []).filter(t => 
      new Date(t.timestamp).toISOString().startsWith(today)
    );
    if (todayTrades.length > 0) {
      add(`   Today: ${todayTrades.length} trade(s)`);
    }
  }
  
  // Alert history (last 24h)
  const alertHistory = loadJsonl(path.join(__dirname, 'alert-hub', 'data', 'history.jsonl'));
  const recentAlerts = alertHistory.filter(a => a.timestamp >= dayAgo);
  if (recentAlerts.length > 0) {
    add(`\n🔔 ${bold('Alerts (24h)')}`);
    add(`   ${recentAlerts.length} alert(s) sent`);
    
    // Count by type
    const byType = {};
    recentAlerts.forEach(a => {
      const type = a.type || a.source || 'other';
      byType[type] = (byType[type] || 0) + 1;
    });
    const typeStr = Object.entries(byType)
      .slice(0, 3)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    add(`   ${typeStr}`);
  }
  
  if (!brief) {
    // Funding Rate Extremes
    const extremeRates = await fetchFundingRates();
    if (extremeRates.length > 0) {
      add(`\n📊 ${bold('Extreme Funding')}`);
      for (const r of extremeRates.slice(0, 3)) {
        const sign = r.annualized >= 0 ? '+' : '';
        add(`   ${r.symbol}: ${sign}${r.annualized?.toFixed(0)}% APR`);
      }
    }
    
    // Notable Moltbook Agents
    const notables = await getMoltbookNotables();
    if (notables.length > 0) {
      add(`\n🦞 ${bold('Notable New Agents')}`);
      for (const a of notables) {
        const handle = a.owner_handle ? `@${a.owner_handle}` : '';
        const followers = a.owner_followers > 0 ? ` (${(a.owner_followers/1000).toFixed(0)}k)` : '';
        const verified = a.owner_verified ? ' ✓' : '';
        add(`   ${a.name} → ${handle}${followers}${verified}`);
      }
    }
    
    // PoI Status
    const poi = await getPoiStatus();
    if (poi) {
      const emoji = poi.daysLeft <= 2 ? '⚠️' : '✅';
      add(`\n🤖 ${bold('Proof of Intelligence')}`);
      add(`   ${emoji} Expires in ${poi.daysLeft.toFixed(1)} days`);
    }
    
    // Price alerts
    const priceAlerts = loadJson(path.join(DATA_DIR, 'price-alerts.json'));
    if (priceAlerts?.alerts?.length > 0) {
      add(`\n⏰ ${bold('Price Alerts')}`);
      add(`   ${priceAlerts.alerts.length} token(s) being watched`);
    }
    
    // Recent signals
    const signalLog = path.join(__dirname, 'logs', `${today}.json`);
    if (fs.existsSync(signalLog)) {
      try {
        const signals = JSON.parse(fs.readFileSync(signalLog, 'utf-8'));
        if (signals.length > 0) {
          add(`\n📡 ${bold('Signals Today')}`);
          add(`   ${signals.length} signal(s) detected`);
        }
      } catch {}
    }
  }
  
  // Footer
  add('');
  add(italic(`Generated ${now.toTimeString().split(' ')[0]} UTC`));
  
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const forTelegram = args.includes('--telegram');
  const brief = args.includes('--brief');
  
  const digest = await generateDigest(forTelegram, brief);
  console.log(digest);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
