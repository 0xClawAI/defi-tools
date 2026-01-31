#!/usr/bin/env node
/**
 * Smart Money Wallet Tracker
 * 
 * Tracks high-performing wallets on Base/Solana
 * Identifies wallets that consistently buy early on winning tokens
 * Outputs JSON feed of "smart money" moves
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const WALLETS_FILE = path.join(DATA_DIR, 'tracked-wallets.json');
const MOVES_FILE = path.join(DATA_DIR, 'smart-moves.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Known smart money wallets to seed tracking
const SEED_WALLETS = {
  base: [
    // Add known profitable Base wallets here
  ],
  solana: [
    // Add known profitable Solana wallets here
  ]
};

class WalletTracker {
  constructor() {
    this.db = this.loadDB();
  }

  loadDB() {
    if (fs.existsSync(WALLETS_FILE)) {
      return JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf8'));
    }
    return {
      wallets: {},
      lastUpdated: null,
      stats: {
        totalTracked: 0,
        profitableCount: 0,
        avgWinRate: 0
      }
    };
  }

  saveDB() {
    this.db.lastUpdated = new Date().toISOString();
    this.db.stats.totalTracked = Object.keys(this.db.wallets).length;
    fs.writeFileSync(WALLETS_FILE, JSON.stringify(this.db, null, 2));
  }

  /**
   * Add a wallet to track
   */
  addWallet(address, chain, metadata = {}) {
    const key = `${chain}:${address.toLowerCase()}`;
    
    if (!this.db.wallets[key]) {
      this.db.wallets[key] = {
        address: address.toLowerCase(),
        chain,
        firstSeen: new Date().toISOString(),
        metadata,
        trades: [],
        stats: {
          totalTrades: 0,
          winners: 0,
          losers: 0,
          winRate: 0,
          avgMultiple: 0,
          bestTrade: null,
          worstTrade: null
        },
        labels: [],
        tier: 'unscored'
      };
      console.log(`✅ Added wallet: ${address} (${chain})`);
    } else {
      console.log(`ℹ️  Wallet already tracked: ${address}`);
    }
    
    this.saveDB();
    return this.db.wallets[key];
  }

  /**
   * Record a trade for a wallet
   */
  recordTrade(address, chain, trade) {
    const key = `${chain}:${address.toLowerCase()}`;
    const wallet = this.db.wallets[key];
    
    if (!wallet) {
      console.log(`❌ Wallet not tracked: ${address}`);
      return null;
    }

    const tradeRecord = {
      id: Date.now().toString(36),
      timestamp: new Date().toISOString(),
      token: trade.token,
      tokenAddress: trade.tokenAddress,
      action: trade.action, // 'buy' or 'sell'
      amount: trade.amount,
      priceUsd: trade.priceUsd,
      fdvAtTrade: trade.fdv,
      txHash: trade.txHash,
      source: trade.source || 'manual'
    };

    wallet.trades.push(tradeRecord);
    wallet.stats.totalTrades++;
    
    this.saveDB();
    return tradeRecord;
  }

  /**
   * Analyze wallet performance
   */
  analyzeWallet(address, chain) {
    const key = `${chain}:${address.toLowerCase()}`;
    const wallet = this.db.wallets[key];
    
    if (!wallet) return null;

    const buys = wallet.trades.filter(t => t.action === 'buy');
    const sells = wallet.trades.filter(t => t.action === 'sell');
    
    // Match buys to sells
    const positions = {};
    
    for (const buy of buys) {
      if (!positions[buy.tokenAddress]) {
        positions[buy.tokenAddress] = {
          token: buy.token,
          address: buy.tokenAddress,
          buys: [],
          sells: [],
          pnl: 0,
          multiple: 0
        };
      }
      positions[buy.tokenAddress].buys.push(buy);
    }
    
    for (const sell of sells) {
      if (positions[sell.tokenAddress]) {
        positions[sell.tokenAddress].sells.push(sell);
      }
    }
    
    // Calculate PnL for closed positions
    let winners = 0;
    let losers = 0;
    let totalMultiple = 0;
    let bestMultiple = 0;
    let worstMultiple = Infinity;
    
    for (const pos of Object.values(positions)) {
      if (pos.buys.length && pos.sells.length) {
        const avgBuyPrice = pos.buys.reduce((s, b) => s + parseFloat(b.priceUsd), 0) / pos.buys.length;
        const avgSellPrice = pos.sells.reduce((s, s2) => s + parseFloat(s2.priceUsd), 0) / pos.sells.length;
        
        pos.multiple = avgSellPrice / avgBuyPrice;
        
        if (pos.multiple > 1) {
          winners++;
        } else {
          losers++;
        }
        
        totalMultiple += pos.multiple;
        bestMultiple = Math.max(bestMultiple, pos.multiple);
        worstMultiple = Math.min(worstMultiple, pos.multiple);
      }
    }
    
    const closedPositions = winners + losers;
    
    wallet.stats = {
      totalTrades: wallet.trades.length,
      winners,
      losers,
      winRate: closedPositions > 0 ? (winners / closedPositions * 100).toFixed(1) : 0,
      avgMultiple: closedPositions > 0 ? (totalMultiple / closedPositions).toFixed(2) : 0,
      bestTrade: bestMultiple > 0 ? `${bestMultiple.toFixed(1)}x` : null,
      worstTrade: worstMultiple < Infinity ? `${worstMultiple.toFixed(2)}x` : null
    };
    
    // Assign tier
    if (parseFloat(wallet.stats.winRate) >= 70 && closedPositions >= 5) {
      wallet.tier = 'alpha';
    } else if (parseFloat(wallet.stats.winRate) >= 50 && closedPositions >= 3) {
      wallet.tier = 'profitable';
    } else if (closedPositions > 0) {
      wallet.tier = 'tracked';
    } else {
      wallet.tier = 'new';
    }
    
    this.saveDB();
    return wallet.stats;
  }

  /**
   * Get all wallets by tier
   */
  getWalletsByTier(tier = null) {
    const wallets = Object.values(this.db.wallets);
    
    if (tier) {
      return wallets.filter(w => w.tier === tier);
    }
    
    return wallets;
  }

  /**
   * Export smart moves feed (recent trades from alpha/profitable wallets)
   */
  exportSmartMoves(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const smartWallets = this.getWalletsByTier('alpha')
      .concat(this.getWalletsByTier('profitable'));
    
    const moves = [];
    
    for (const wallet of smartWallets) {
      for (const trade of wallet.trades) {
        const tradeTime = new Date(trade.timestamp).getTime();
        
        if (tradeTime > cutoff) {
          moves.push({
            wallet: wallet.address,
            chain: wallet.chain,
            walletTier: wallet.tier,
            walletWinRate: wallet.stats.winRate,
            ...trade
          });
        }
      }
    }
    
    // Sort by timestamp descending
    moves.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const feed = {
      generated: new Date().toISOString(),
      period: `${hours}h`,
      totalMoves: moves.length,
      moves
    };
    
    fs.writeFileSync(MOVES_FILE, JSON.stringify(feed, null, 2));
    console.log(`📊 Exported ${moves.length} smart money moves to ${MOVES_FILE}`);
    
    return feed;
  }

  /**
   * Show tracker summary
   */
  summary() {
    const wallets = Object.values(this.db.wallets);
    const alpha = wallets.filter(w => w.tier === 'alpha');
    const profitable = wallets.filter(w => w.tier === 'profitable');
    
    console.log('\n📊 Wallet Tracker Summary');
    console.log('='.repeat(40));
    console.log(`Total Tracked: ${wallets.length}`);
    console.log(`Alpha Tier:    ${alpha.length}`);
    console.log(`Profitable:    ${profitable.length}`);
    console.log(`Last Updated:  ${this.db.lastUpdated || 'Never'}`);
    
    if (alpha.length > 0) {
      console.log('\n🏆 Top Alpha Wallets:');
      alpha.slice(0, 5).forEach(w => {
        console.log(`  ${w.address.slice(0, 8)}...${w.address.slice(-6)} (${w.chain})`);
        console.log(`    Win Rate: ${w.stats.winRate}% | Best: ${w.stats.bestTrade}`);
      });
    }
  }
}

/**
 * Fetch wallet transactions from Base (using public APIs)
 */
async function fetchBaseTransactions(address) {
  // Using Basescan API (needs API key for production)
  // For now, we'll use DEXScreener to find token trades
  
  console.log(`🔍 Fetching transactions for ${address} on Base...`);
  
  // This would be enhanced with:
  // 1. Basescan API for all transactions
  // 2. DEXScreener for swap detection
  // 3. The Graph for Uniswap/Aerodrome swaps
  
  return [];
}

/**
 * Discover smart wallets from successful token launches
 */
async function discoverSmartWallets(tracker) {
  console.log('\n🔎 Discovering smart wallets from DEXScreener...');
  
  // Get boosted tokens
  const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
  const boosted = await res.json();
  
  // Filter to Base tokens with good performance
  const baseTokens = boosted.filter(t => 
    t.chainId === 'base' && 
    parseFloat(t.totalAmount || 0) > 1000
  );
  
  console.log(`Found ${baseTokens.length} boosted Base tokens`);
  
  // Get early buyers for top performers
  // This would require on-chain analysis via:
  // - The Graph subgraph queries
  // - Basescan API
  // - Alchemy/Infura trace calls
  
  return [];
}

// CLI
async function main() {
  const tracker = new WalletTracker();
  const args = process.argv.slice(2);
  const cmd = args[0] || 'summary';
  
  switch (cmd) {
    case 'add':
      const address = args[1];
      const chain = args[2] || 'base';
      if (!address) {
        console.error('Usage: node tracker.js add <address> [chain]');
        process.exit(1);
      }
      tracker.addWallet(address, chain);
      break;
      
    case 'trade':
      // node tracker.js trade <address> <chain> <token> <action> <price>
      const tradeAddr = args[1];
      const tradeChain = args[2] || 'base';
      const token = args[3];
      const action = args[4];
      const price = args[5];
      
      if (!tradeAddr || !token || !action || !price) {
        console.error('Usage: node tracker.js trade <address> <chain> <token> <buy|sell> <price>');
        process.exit(1);
      }
      
      tracker.recordTrade(tradeAddr, tradeChain, {
        token,
        tokenAddress: 'unknown',
        action,
        priceUsd: price,
        source: 'manual'
      });
      console.log(`✅ Recorded ${action} of ${token} at $${price}`);
      break;
      
    case 'analyze':
      const analyzeAddr = args[1];
      const analyzeChain = args[2] || 'base';
      if (!analyzeAddr) {
        console.error('Usage: node tracker.js analyze <address> [chain]');
        process.exit(1);
      }
      const stats = tracker.analyzeWallet(analyzeAddr, analyzeChain);
      if (stats) {
        console.log('\n📈 Wallet Analysis:');
        console.log(JSON.stringify(stats, null, 2));
      }
      break;
      
    case 'export':
      const hours = parseInt(args[1]) || 24;
      tracker.exportSmartMoves(hours);
      break;
      
    case 'discover':
      await discoverSmartWallets(tracker);
      break;
      
    case 'list':
      const tier = args[1];
      const wallets = tracker.getWalletsByTier(tier);
      console.log(`\n📋 Tracked Wallets${tier ? ` (${tier})` : ''}:`);
      wallets.forEach(w => {
        console.log(`\n${w.address} [${w.chain}] - ${w.tier}`);
        console.log(`  Trades: ${w.stats.totalTrades} | Win Rate: ${w.stats.winRate}%`);
      });
      break;
      
    case 'summary':
    default:
      tracker.summary();
      break;
  }
}

module.exports = { WalletTracker };

if (require.main === module) {
  main().catch(console.error);
}
