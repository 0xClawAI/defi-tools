#!/usr/bin/env node
/**
 * Token Lookup CLI
 * Quick lookup for any token: price, safety, liquidity
 * 
 * Usage:
 *   node token-lookup.js <address> [chain]
 *   node token-lookup.js MOLTBOOK base
 */

const { analyzeTokenSafety } = require('./momentum-scanner/token-safety');

const fs = require('fs');
const path = require('path');

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';
const WATCHLIST_FILE = path.join(__dirname, 'data', 'watchlist.json');

// Ensure data dir exists
const dataDir = path.dirname(WATCHLIST_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function loadWatchlist() {
  try {
    return JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveWatchlist(list) {
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(list, null, 2));
}

async function fetchTokenByAddress(address, chain = null) {
  try {
    const res = await fetch(`${DEXSCREENER_API}/tokens/${address}`);
    const data = await res.json();
    let pairs = data.pairs || [];
    if (chain) {
      pairs = pairs.filter(p => p.chainId === chain);
    }
    return pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] || null;
  } catch (e) {
    return null;
  }
}

async function searchToken(query) {
  try {
    const res = await fetch(`${DEXSCREENER_API}/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return (data.pairs || []).slice(0, 5);
  } catch (e) {
    return [];
  }
}

function formatNumber(num) {
  if (!num) return '?';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function formatPrice(price) {
  if (!price) return '?';
  const p = parseFloat(price);
  if (p >= 1) return '$' + p.toFixed(2);
  if (p >= 0.001) return '$' + p.toFixed(4);
  return '$' + p.toFixed(8);
}

async function lookupAndDisplay(query, chain = null, compact = false) {
  let pair = null;
  
  // Check if it's an address
  if (query.startsWith('0x') && query.length >= 40) {
    pair = await fetchTokenByAddress(query, chain);
  } else {
    // Search by symbol/name
    const results = await searchToken(query);
    if (results.length > 0) {
      const filtered = chain 
        ? results.filter(p => p.chainId === chain)
        : results;
      pair = filtered[0];
    }
  }
  
  if (!pair) {
    if (compact) {
      console.log(`❌ ${query}: Not found`);
    } else {
      console.log('❌ Token not found');
    }
    return null;
  }
  
  const token = pair.baseToken;
  const address = token?.address;
  const chainId = pair.chainId;
  
  // Get safety data
  const safety = await analyzeTokenSafety(address, chainId);
  
  if (compact) {
    // Compact one-liner output
    const safeIcon = safety?.safe ? '✅' : '❌';
    const lockIcon = safety?.details?.liquidityLocked ? '🔒' : '🔓';
    const price = formatPrice(pair.priceUsd);
    const change = pair.priceChange?.h24?.toFixed(1) || '?';
    const liq = formatNumber(pair.liquidity?.usd);
    const score = safety?.score ?? '?';
    
    console.log(`${safeIcon} ${token?.symbol.padEnd(10)} ${price.padStart(14)} ${change.padStart(7)}% ${('$' + liq).padStart(10)} liq  ${lockIcon} ${score}/100`);
    return { pair, safety };
  }
  
  // Full output (original behavior)
  console.log('\n' + '═'.repeat(50));
  console.log(`📊 ${token?.symbol} (${token?.name})`);
  console.log('═'.repeat(50));
  
  console.log(`
Chain:      ${chainId}
Address:    ${address}
DEX:        ${pair.dexId}

💰 Price & Volume
────────────────────────────────────────────────
Price:      ${formatPrice(pair.priceUsd)}
24h Change: ${pair.priceChange?.h24?.toFixed(2) || '?'}%
Volume 24h: $${formatNumber(pair.volume?.h24)}
Liquidity:  $${formatNumber(pair.liquidity?.usd)}
FDV:        $${formatNumber(pair.fdv)}
`);

  console.log(`📈 Buy/Sell Ratios
────────────────────────────────────────────────`);
  const windows = ['m5', 'h1', 'h6', 'h24'];
  for (const w of windows) {
    const txns = pair.txns?.[w];
    if (txns) {
      const ratio = txns.sells > 0 ? (txns.buys / txns.sells).toFixed(2) : '∞';
      console.log(`${w.padEnd(4)}: ${String(txns.buys).padStart(5)} buys / ${String(txns.sells).padStart(5)} sells = ${ratio}x`);
    }
  }
  
  console.log(`
🔒 Safety Analysis
────────────────────────────────────────────────
Score:      ${safety?.score ?? '?'}/100 ${safety?.safe ? '✅' : '❌'}
Honeypot:   ${safety?.details?.isHoneypot ? '🚨 YES' : '✅ No'}
Verified:   ${safety?.details?.isOpenSource ? '✅ Yes' : '⚠️ No'}
LP Locked:  ${safety?.details?.liquidityLocked ? '🔒 Yes (' + safety.details.lockedPercent.toFixed(1) + '%)' : '🔓 No'}
Holders:    ${safety?.details?.holderCount?.toLocaleString() || '?'}
Top Holder: ${safety?.details?.topHolderPercent?.toFixed(1) || '?'}%
Top 10:     ${safety?.details?.top10Percent?.toFixed(1) || '?'}%
`);

  if (safety?.risks?.length > 0) {
    console.log('⚠️ Risks:');
    safety.risks.forEach(r => console.log(`   ${r}`));
  }
  
  console.log('\n🔗 Links:');
  console.log(`   DexScreener: https://dexscreener.com/${chainId}/${address}`);
  if (chainId === 'base') {
    console.log(`   Basescan: https://basescan.org/token/${address}`);
  } else if (chainId === 'ethereum') {
    console.log(`   Etherscan: https://etherscan.io/token/${address}`);
  } else if (chainId === 'solana') {
    console.log(`   Solscan: https://solscan.io/token/${address}`);
  }
  
  console.log('═'.repeat(50));
  return { pair, safety };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Token Lookup CLI');
    console.log('================');
    console.log('Usage:');
    console.log('  node token-lookup.js <address|symbol> [chain]');
    console.log('  node token-lookup.js --batch token1,token2,token3 [chain]');
    console.log('  node token-lookup.js --watch                    # Check all watched tokens');
    console.log('  node token-lookup.js --add <address> [chain]    # Add to watchlist');
    console.log('  node token-lookup.js --remove <address>         # Remove from watchlist');
    console.log('  node token-lookup.js --list                     # Show watchlist');
    console.log('');
    console.log('Examples:');
    console.log('  node token-lookup.js 0x8c9037d1ef5c6d1f6816278c7aaf5491d24cd527');
    console.log('  node token-lookup.js MOLTBOOK base');
    console.log('  node token-lookup.js --add 0x8c90... base');
    console.log('  node token-lookup.js --watch');
    process.exit(1);
  }
  
  // Watchlist: list
  if (args[0] === '--list') {
    const watchlist = loadWatchlist();
    if (watchlist.length === 0) {
      console.log('📋 Watchlist is empty');
    } else {
      console.log(`📋 Watchlist (${watchlist.length} tokens):`);
      watchlist.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.symbol || t.address.slice(0, 10) + '...'} on ${t.chain}`);
      });
    }
    process.exit(0);
  }
  
  // Watchlist: add
  if (args[0] === '--add') {
    const address = args[1];
    const chain = args[2] || 'base';
    
    if (!address) {
      console.log('❌ Missing address');
      process.exit(1);
    }
    
    const watchlist = loadWatchlist();
    const existing = watchlist.find(t => t.address.toLowerCase() === address.toLowerCase());
    
    if (existing) {
      console.log('ℹ️ Already in watchlist');
    } else {
      // Fetch symbol
      const pair = await fetchTokenByAddress(address, chain);
      const symbol = pair?.baseToken?.symbol || address.slice(0, 8);
      
      watchlist.push({ address, chain, symbol, addedAt: new Date().toISOString() });
      saveWatchlist(watchlist);
      console.log(`✅ Added ${symbol} to watchlist`);
    }
    process.exit(0);
  }
  
  // Watchlist: remove
  if (args[0] === '--remove') {
    const address = args[1];
    
    if (!address) {
      console.log('❌ Missing address');
      process.exit(1);
    }
    
    const watchlist = loadWatchlist();
    const idx = watchlist.findIndex(t => t.address.toLowerCase() === address.toLowerCase());
    
    if (idx === -1) {
      console.log('ℹ️ Not in watchlist');
    } else {
      const removed = watchlist.splice(idx, 1)[0];
      saveWatchlist(watchlist);
      console.log(`✅ Removed ${removed.symbol || address.slice(0, 8)} from watchlist`);
    }
    process.exit(0);
  }
  
  // Trending tokens
  if (args[0] === '--trending') {
    const chain = args[1] || null;
    console.log(`🔥 Trending tokens${chain ? ` on ${chain}` : ''}...\n`);
    
    try {
      const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      const trending = await res.json();
      const filtered = chain ? trending.filter(t => t.chainId === chain) : trending;
      
      console.log('─'.repeat(70));
      console.log(`${'#'.padStart(3)} ${'Token'.padEnd(15)} ${'Chain'.padEnd(10)} ${'Total Boost'}`);
      console.log('─'.repeat(70));
      
      filtered.slice(0, 20).forEach((t, i) => {
        console.log(`${String(i + 1).padStart(3)} ${(t.tokenAddress?.slice(0, 12) + '...').padEnd(15)} ${t.chainId?.padEnd(10)} ${t.amount || '?'}`);
      });
      
      console.log('─'.repeat(70));
      console.log(`\n💡 Use: node token-lookup.js <address> to check any token`);
    } catch (e) {
      console.log('❌ Failed to fetch trending:', e.message);
    }
    process.exit(0);
  }
  
  // Watchlist: check all
  if (args[0] === '--watch') {
    const watchlist = loadWatchlist();
    
    if (watchlist.length === 0) {
      console.log('📋 Watchlist is empty. Add tokens with --add');
      process.exit(0);
    }
    
    console.log(`🔍 Checking ${watchlist.length} watched tokens...\n`);
    console.log('─'.repeat(70));
    console.log(`${'St'} ${'Token'.padEnd(10)} ${'Price'.padStart(14)} ${'24h'.padStart(8)} ${'Liquidity'.padStart(11)} ${'LP'} ${'Safety'}`);
    console.log('─'.repeat(70));
    
    for (const t of watchlist) {
      await lookupAndDisplay(t.address, t.chain, true);
      await new Promise(r => setTimeout(r, 300));
    }
    
    console.log('─'.repeat(70));
    process.exit(0);
  }
  
  // Batch mode
  if (args[0] === '--batch') {
    const tokens = args[1]?.split(',') || [];
    const chain = args[2] || null;
    
    if (tokens.length === 0) {
      console.log('❌ No tokens specified');
      process.exit(1);
    }
    
    console.log(`🔍 Batch lookup: ${tokens.length} tokens${chain ? ` on ${chain}` : ''}\n`);
    console.log('─'.repeat(70));
    console.log(`${'Status'.padEnd(3)} ${'Token'.padEnd(10)} ${'Price'.padStart(14)} ${'24h'.padStart(8)} ${'Liquidity'.padStart(11)} ${'LP'} ${'Safety'}`);
    console.log('─'.repeat(70));
    
    for (const token of tokens) {
      await lookupAndDisplay(token.trim(), chain, true);
      await new Promise(r => setTimeout(r, 300)); // Rate limit
    }
    
    console.log('─'.repeat(70));
    process.exit(0);
  }
  
  // Single token lookup
  const query = args[0];
  const chain = args[1] || null;
  
  console.log(`🔍 Looking up: ${query}${chain ? ` on ${chain}` : ''}...\n`);
  
  // Show multiple matches for search
  if (!query.startsWith('0x')) {
    const results = await searchToken(query);
    const filtered = chain 
      ? results.filter(p => p.chainId === chain)
      : results;
    if (filtered.length > 1) {
      console.log('📋 Multiple matches found:');
      filtered.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.baseToken?.symbol} on ${p.chainId} - $${formatNumber(p.liquidity?.usd)} liq`);
      });
      console.log('');
    }
  }
  
  console.log('🔒 Checking safety...');
  const result = await lookupAndDisplay(query, chain, false);
  if (!result) process.exit(1);
}

main().catch(console.error);
