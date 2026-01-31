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

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

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

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Token Lookup CLI');
    console.log('================');
    console.log('Usage:');
    console.log('  node token-lookup.js <address|symbol> [chain]');
    console.log('');
    console.log('Examples:');
    console.log('  node token-lookup.js 0x8c9037d1ef5c6d1f6816278c7aaf5491d24cd527');
    console.log('  node token-lookup.js MOLTBOOK base');
    console.log('  node token-lookup.js ETH');
    process.exit(1);
  }
  
  const query = args[0];
  const chain = args[1] || null;
  
  console.log(`🔍 Looking up: ${query}${chain ? ` on ${chain}` : ''}...\n`);
  
  let pair = null;
  
  // Check if it's an address
  if (query.startsWith('0x') && query.length >= 40) {
    pair = await fetchTokenByAddress(query, chain);
  } else {
    // Search by symbol/name
    const results = await searchToken(query);
    if (results.length > 0) {
      // Filter by chain if specified
      const filtered = chain 
        ? results.filter(p => p.chainId === chain)
        : results;
      pair = filtered[0];
      
      // Show alternatives if multiple matches
      if (filtered.length > 1) {
        console.log('📋 Multiple matches found:');
        filtered.slice(0, 5).forEach((p, i) => {
          console.log(`   ${i + 1}. ${p.baseToken?.symbol} on ${p.chainId} - $${formatNumber(p.liquidity?.usd)} liq`);
        });
        console.log('');
      }
    }
  }
  
  if (!pair) {
    console.log('❌ Token not found');
    process.exit(1);
  }
  
  const token = pair.baseToken;
  const address = token?.address;
  const chainId = pair.chainId;
  
  // Get safety data
  console.log('🔒 Checking safety...');
  const safety = await analyzeTokenSafety(address, chainId);
  
  // Display results
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
}

main().catch(console.error);
