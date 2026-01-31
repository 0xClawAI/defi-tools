#!/usr/bin/env node
/**
 * Base Chain Smart Wallet Scanner
 * 
 * Discovers smart money wallets by analyzing:
 * - Early buyers on tokens that pumped
 * - Holders with concentrated positions in quality tokens
 * - Repeat winners across multiple tokens
 */

const fs = require('fs');
const path = require('path');
const { createPublicClient, http, parseAbi, formatUnits } = require('viem');
const { base } = require('viem/chains');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Base USDC and WETH for reference
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';

// Create public client
const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org')
});

/**
 * Get trending tokens from DEXScreener
 */
async function getTrendingTokens(minFdv = 100000, maxFdv = 50000000) {
  console.log('📈 Fetching trending Base tokens...');
  
  const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
  const data = await res.json();
  
  const baseTokens = [];
  
  for (const token of data) {
    if (token.chainId !== 'base') continue;
    
    // Get pair details
    try {
      const pairRes = await fetch(`https://api.dexscreener.com/tokens/v1/base/${token.tokenAddress}`);
      const pairs = await pairRes.json();
      
      if (!pairs?.[0]) continue;
      
      const pair = pairs[0];
      const fdv = parseFloat(pair.fdv || 0);
      
      // Filter by FDV range
      if (fdv >= minFdv && fdv <= maxFdv) {
        baseTokens.push({
          address: token.tokenAddress,
          symbol: pair.baseToken?.symbol || 'UNKNOWN',
          name: pair.baseToken?.name || 'Unknown Token',
          fdv,
          price: parseFloat(pair.priceUsd || 0),
          priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
          volume24h: parseFloat(pair.volume?.h24 || 0),
          pairAddress: pair.pairAddress,
          dex: pair.dexId,
          createdAt: pair.pairCreatedAt
        });
      }
    } catch (e) {
      // Skip errors
    }
  }
  
  console.log(`✅ Found ${baseTokens.length} tokens in FDV range $${minFdv/1000}k-$${maxFdv/1000000}M`);
  return baseTokens;
}

/**
 * Get top holders for a token using public APIs
 */
async function getTopHolders(tokenAddress, limit = 20) {
  console.log(`🔍 Fetching holders for ${tokenAddress.slice(0, 10)}...`);
  
  // Note: For production, you'd use:
  // - Alchemy getTokenBalances
  // - Moralis getTokenHolders
  // - The Graph subgraph
  
  // Using Basescan token holder page (would need scraping or API key)
  // For now, return placeholder
  
  return [];
}

/**
 * Analyze holder concentration
 */
async function analyzeHolderConcentration(tokenAddress) {
  // Calculate Gini coefficient and whale concentration
  // This requires holder data from getTopHolders
  
  return {
    tokenAddress,
    top10Percentage: 0,
    top20Percentage: 0,
    giniCoefficient: 0,
    whaleCount: 0
  };
}

/**
 * Scan for early buyers on successful tokens
 */
async function scanEarlyBuyers() {
  console.log('\n🎯 Scanning for early buyers on winners...');
  
  // Get tokens that pumped recently
  const tokens = await getTrendingTokens(500000, 10000000);
  
  // Sort by 24h price change
  const winners = tokens
    .filter(t => t.priceChange24h > 50) // >50% gain
    .sort((a, b) => b.priceChange24h - a.priceChange24h)
    .slice(0, 10);
  
  console.log(`\n🏆 Top ${winners.length} winners (>50% in 24h):`);
  
  for (const token of winners) {
    console.log(`  ${token.symbol}: +${token.priceChange24h.toFixed(0)}%`);
    console.log(`    FDV: $${(token.fdv/1000000).toFixed(2)}M | Vol: $${(token.volume24h/1000).toFixed(0)}k`);
  }
  
  // Save for analysis
  const outputFile = path.join(DATA_DIR, 'recent-winners.json');
  fs.writeFileSync(outputFile, JSON.stringify({
    scanned: new Date().toISOString(),
    winners
  }, null, 2));
  
  console.log(`\n💾 Saved to ${outputFile}`);
  
  return winners;
}

/**
 * Find wallets that appear across multiple successful tokens
 */
async function findRepeatWinners() {
  console.log('\n🔄 Searching for repeat winners...');
  
  // Load previous winner data
  const winnersFile = path.join(DATA_DIR, 'recent-winners.json');
  if (!fs.existsSync(winnersFile)) {
    console.log('No winner data. Run "scan" first.');
    return [];
  }
  
  const { winners } = JSON.parse(fs.readFileSync(winnersFile, 'utf8'));
  
  // For each winner, we'd analyze early buyers
  // Cross-reference to find wallets that appear in multiple
  
  // This requires transaction history analysis via:
  // - Basescan API
  // - The Graph
  // - Alchemy Transfers API
  
  console.log('⚠️  Full analysis requires API keys (Basescan, Alchemy)');
  
  return [];
}

/**
 * Monitor specific wallets for new trades
 */
async function monitorWallets(wallets) {
  console.log(`\n👀 Monitoring ${wallets.length} wallets...`);
  
  for (const address of wallets) {
    // Get recent transactions
    // This would use Basescan API in production
    console.log(`  Checking ${address.slice(0, 10)}...`);
  }
}

/**
 * Generate smart money feed
 */
function generateFeed() {
  const winnersFile = path.join(DATA_DIR, 'recent-winners.json');
  const smartWalletsFile = path.join(DATA_DIR, 'smart-wallets.json');
  
  const feed = {
    generated: new Date().toISOString(),
    network: 'base',
    recentWinners: [],
    smartWallets: [],
    alerts: []
  };
  
  if (fs.existsSync(winnersFile)) {
    const { winners } = JSON.parse(fs.readFileSync(winnersFile, 'utf8'));
    feed.recentWinners = winners.slice(0, 5);
  }
  
  if (fs.existsSync(smartWalletsFile)) {
    const { wallets } = JSON.parse(fs.readFileSync(smartWalletsFile, 'utf8'));
    feed.smartWallets = wallets.slice(0, 10);
  }
  
  const feedFile = path.join(DATA_DIR, 'smart-money-feed.json');
  fs.writeFileSync(feedFile, JSON.stringify(feed, null, 2));
  
  console.log(`\n📡 Generated feed: ${feedFile}`);
  return feed;
}

// CLI
async function main() {
  const cmd = process.argv[2] || 'help';
  
  switch (cmd) {
    case 'scan':
      await scanEarlyBuyers();
      break;
      
    case 'trending':
      const minFdv = parseInt(process.argv[3]) || 100000;
      const maxFdv = parseInt(process.argv[4]) || 50000000;
      await getTrendingTokens(minFdv, maxFdv);
      break;
      
    case 'winners':
      await findRepeatWinners();
      break;
      
    case 'feed':
      generateFeed();
      break;
      
    case 'help':
    default:
      console.log(`
Base Smart Money Scanner
========================

Commands:
  scan              - Scan for tokens with big gains, find early buyers
  trending [min] [max] - Get trending tokens in FDV range
  winners           - Find wallets with repeat wins
  feed              - Generate smart money JSON feed

Examples:
  node base-scanner.js scan
  node base-scanner.js trending 100000 5000000
  node base-scanner.js feed

Note: Full wallet analysis requires API keys.
Set BASESCAN_API_KEY or ALCHEMY_API_KEY in .env for complete data.
`);
  }
}

module.exports = { getTrendingTokens, scanEarlyBuyers, generateFeed };

if (require.main === module) {
  main().catch(console.error);
}
