#!/usr/bin/env node
/**
 * Polymarket Wallet Analyzer
 * 
 * Study successful Polymarket traders:
 * - Track top performers' positions and timing
 * - Identify patterns in their strategies
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

/**
 * Get active markets from Polymarket
 */
async function getActiveMarkets(limit = 50) {
  console.log('📊 Fetching active Polymarket markets...');
  
  const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=${limit}`);
  const markets = await res.json();
  
  // Filter to actually active markets with volume
  const activeMarkets = markets.filter(m => 
    !m.closed && 
    !m.archived && 
    m.volumeNum > 10000
  ).sort((a, b) => b.volumeNum - a.volumeNum);
  
  console.log(`✅ Found ${activeMarkets.length} active markets with >$10k volume`);
  
  return activeMarkets.map(m => ({
    id: m.id,
    slug: m.slug,
    question: m.question,
    volume: m.volumeNum,
    liquidity: m.liquidityNum,
    endDate: m.endDate,
    outcomes: JSON.parse(m.outcomes || '[]'),
    outcomePrices: JSON.parse(m.outcomePrices || '[]'),
    priceChange24h: m.oneDayPriceChange || 0
  }));
}

/**
 * Get top movers (markets with big price changes)
 */
async function getTopMovers() {
  const markets = await getActiveMarkets(100);
  
  const movers = markets
    .filter(m => Math.abs(m.priceChange24h) > 0.05) // >5% change
    .sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h));
  
  console.log(`\n📈 Top Movers (>5% 24h change):\n`);
  
  movers.slice(0, 10).forEach((m, i) => {
    const direction = m.priceChange24h > 0 ? '🟢' : '🔴';
    console.log(`${i + 1}. ${direction} ${(m.priceChange24h * 100).toFixed(1)}%`);
    console.log(`   ${m.question.slice(0, 60)}...`);
    console.log(`   Volume: $${(m.volume / 1000).toFixed(0)}k`);
  });
  
  return movers;
}

/**
 * Get high-volume markets (potential whale activity)
 */
async function getHighVolumeMarkets() {
  const markets = await getActiveMarkets(100);
  
  console.log(`\n💎 Highest Volume Markets:\n`);
  
  markets.slice(0, 15).forEach((m, i) => {
    const price = parseFloat(m.outcomePrices[0] || 0);
    console.log(`${i + 1}. $${(m.volume / 1000000).toFixed(2)}M volume`);
    console.log(`   ${m.question.slice(0, 60)}...`);
    console.log(`   Yes: ${(price * 100).toFixed(0)}% | Liquidity: $${(m.liquidity / 1000).toFixed(0)}k`);
  });
  
  return markets;
}

/**
 * Analyze market for potential opportunities
 */
function analyzeMarket(market) {
  const price = parseFloat(market.outcomePrices[0] || 0);
  
  return {
    ...market,
    analysis: {
      // High liquidity relative to volume might mean stable odds
      liquidityRatio: market.liquidity / (market.volume || 1),
      // Near 50% might offer value plays
      isCloseOdds: price > 0.4 && price < 0.6,
      // Recent momentum
      trending: market.priceChange24h > 0.03 ? 'bullish' : 
                market.priceChange24h < -0.03 ? 'bearish' : 'neutral',
      // High volume suggests interest
      isHighVolume: market.volume > 1000000
    }
  };
}

/**
 * Find markets that might be mispriced
 */
async function findOpportunities() {
  const markets = await getActiveMarkets(100);
  
  const opportunities = markets
    .map(analyzeMarket)
    .filter(m => m.analysis.isCloseOdds && m.analysis.isHighVolume)
    .sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h));
  
  console.log(`\n🎯 Potential Opportunities (close odds, high volume, momentum):\n`);
  
  opportunities.slice(0, 10).forEach((m, i) => {
    const price = parseFloat(m.outcomePrices[0] || 0);
    console.log(`${i + 1}. ${m.question.slice(0, 50)}...`);
    console.log(`   Yes: ${(price * 100).toFixed(0)}% | ${m.analysis.trending}`);
    console.log(`   Volume: $${(m.volume / 1000000).toFixed(2)}M`);
    console.log(`   24h Change: ${(m.priceChange24h * 100).toFixed(1)}%`);
    console.log('');
  });
  
  return opportunities;
}

/**
 * Save market data snapshot
 */
async function saveSnapshot() {
  const markets = await getActiveMarkets(100);
  
  const snapshot = {
    timestamp: new Date().toISOString(),
    totalMarkets: markets.length,
    totalVolume: markets.reduce((s, m) => s + m.volume, 0),
    markets
  };
  
  const filename = `polymarket-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(snapshot, null, 2));
  
  console.log(`\n💾 Saved snapshot to ${filename}`);
  console.log(`   Total Volume: $${(snapshot.totalVolume / 1000000).toFixed(2)}M`);
  
  return snapshot;
}

// CLI
async function main() {
  const cmd = process.argv[2] || 'help';
  
  switch (cmd) {
    case 'markets':
      await getHighVolumeMarkets();
      break;
      
    case 'movers':
      await getTopMovers();
      break;
      
    case 'opportunities':
      await findOpportunities();
      break;
      
    case 'snapshot':
      await saveSnapshot();
      break;
      
    case 'help':
    default:
      console.log(`
Polymarket Analyzer
==================

Commands:
  markets       - Show highest volume active markets
  movers        - Show top price movers (>5% 24h change)
  opportunities - Find potentially mispriced markets
  snapshot      - Save market data snapshot

Usage:
  node analyzer.js markets
  node analyzer.js movers
  node analyzer.js opportunities
`);
  }
}

module.exports = { getActiveMarkets, getTopMovers, findOpportunities };

if (require.main === module) {
  main().catch(console.error);
}
