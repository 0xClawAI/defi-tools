#!/usr/bin/env node
/**
 * Portfolio Check - Quick overview of all positions
 * 
 * Aggregates data from:
 * - Base wallet balance
 * - Hyperliquid positions (if configured)
 * - Trade journal open positions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WALLET = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const HL_SKILL = path.join(__dirname, '../..', '.openclaw/workspace/skills/hyperliquid-trading/scripts/hyperliquid.mjs');

async function checkBaseBalance() {
  try {
    const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${WALLET}`);
    const data = await res.json();
    const ethBalance = parseFloat(data.coin_balance) / 1e18;
    return { chain: 'Base', asset: 'ETH', balance: ethBalance };
  } catch (e) {
    return { chain: 'Base', asset: 'ETH', balance: 0, error: e.message };
  }
}

async function checkHyperliquid() {
  if (!fs.existsSync(HL_SKILL)) {
    return [];
  }
  
  try {
    const output = execSync(`HYPERLIQUID_ADDRESS=${WALLET} node ${HL_SKILL} positions 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 15000,
    });
    
    // Parse positions from output
    const positions = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const match = line.match(/(\w+):\s*([\d.]+)\s*@\s*\$([\d.]+)/);
      if (match) {
        positions.push({
          chain: 'Hyperliquid',
          asset: match[1],
          size: parseFloat(match[2]),
          entryPrice: parseFloat(match[3]),
        });
      }
    }
    
    return positions;
  } catch (e) {
    return [];
  }
}

function checkJournalPositions() {
  const journalPath = path.join(__dirname, 'trade-journal/data/trades.json');
  
  if (!fs.existsSync(journalPath)) {
    return [];
  }
  
  const trades = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  return trades
    .filter(t => t.status === 'open')
    .map(t => ({
      chain: 'Journal',
      asset: t.symbol,
      side: t.side,
      size: t.amount,
      entryPrice: t.entryPrice,
      value: t.value,
    }));
}

async function main() {
  console.log('📊 Portfolio Overview\n');
  console.log(`Wallet: ${WALLET}\n`);
  console.log('─'.repeat(50));
  
  // Base balance
  console.log('\n💰 Base Wallet');
  const base = await checkBaseBalance();
  if (base.error) {
    console.log(`  ETH: Error - ${base.error}`);
  } else {
    console.log(`  ETH: ${base.balance.toFixed(6)} (~$${(base.balance * 3300).toFixed(2)})`);
  }
  
  // Hyperliquid positions
  console.log('\n📈 Hyperliquid Positions');
  const hlPositions = await checkHyperliquid();
  if (hlPositions.length === 0) {
    console.log('  No open positions (or not configured)');
  } else {
    for (const p of hlPositions) {
      console.log(`  ${p.asset}: ${p.size} @ $${p.entryPrice}`);
    }
  }
  
  // Journal positions
  console.log('\n📓 Trade Journal (Open)');
  const journalPositions = checkJournalPositions();
  if (journalPositions.length === 0) {
    console.log('  No open positions tracked');
  } else {
    for (const p of journalPositions) {
      console.log(`  ${p.side.toUpperCase()} ${p.asset}: ${p.size} @ $${p.entryPrice} ($${p.value.toFixed(2)})`);
    }
  }
  
  console.log('\n' + '─'.repeat(50));
  console.log(`Last updated: ${new Date().toISOString()}`);
}

main().catch(console.error);
