#!/usr/bin/env node
/**
 * DEX Scanner - Find new pairs on Solana and Base
 * Usage: node scanner.js [solana|base|all] [--new|--hot|--search <query>]
 */

const DEXSCREENER_BASE = 'https://api.dexscreener.com';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Get latest boosted/trending tokens
async function getHotTokens() {
  const data = await fetchJSON(`${DEXSCREENER_BASE}/token-boosts/latest/v1`);
  return data;
}

// Get top boosted tokens
async function getTopBoosted() {
  const data = await fetchJSON(`${DEXSCREENER_BASE}/token-boosts/top/v1`);
  return data;
}

// Search for pairs
async function searchPairs(query) {
  const data = await fetchJSON(`${DEXSCREENER_BASE}/latest/dex/search?q=${encodeURIComponent(query)}`);
  return data.pairs || [];
}

// Get token info
async function getToken(chainId, address) {
  const data = await fetchJSON(`${DEXSCREENER_BASE}/tokens/v1/${chainId}/${address}`);
  return data;
}

// Get token pairs/pools
async function getTokenPairs(chainId, address) {
  const data = await fetchJSON(`${DEXSCREENER_BASE}/token-pairs/v1/${chainId}/${address}`);
  return data;
}

// Format token for display
function formatToken(token) {
  const chain = token.chainId?.toUpperCase() || '?';
  const symbol = token.baseToken?.symbol || token.symbol || '?';
  const price = token.priceUsd ? `$${parseFloat(token.priceUsd).toFixed(6)}` : '?';
  const fdv = token.fdv ? `$${(token.fdv / 1000000).toFixed(2)}M` : '?';
  const vol24 = token.volume?.h24 ? `$${(token.volume.h24 / 1000).toFixed(1)}k` : '?';
  const change = token.priceChange?.h24 ? `${token.priceChange.h24 > 0 ? '+' : ''}${token.priceChange.h24.toFixed(1)}%` : '?';
  
  return `[${chain}] ${symbol} | ${price} | FDV: ${fdv} | 24h Vol: ${vol24} | ${change}`;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const chain = args[0] || 'all';
  const mode = args[1] || '--hot';
  
  console.log(`\n🔍 DEX Scanner - ${new Date().toISOString()}\n`);
  
  try {
    if (mode === '--hot' || mode === '--trending') {
      console.log('📈 HOT/BOOSTED TOKENS:\n');
      const tokens = await getHotTokens();
      
      const filtered = chain === 'all' 
        ? tokens 
        : tokens.filter(t => t.chainId === chain.toLowerCase());
      
      filtered.slice(0, 20).forEach((t, i) => {
        console.log(`${i + 1}. ${t.chainId?.toUpperCase()} | ${t.tokenAddress?.slice(0, 8)}...`);
        if (t.description) console.log(`   ${t.description.slice(0, 80)}...`);
        if (t.links) {
          const twitter = t.links.find(l => l.type === 'twitter');
          if (twitter) console.log(`   Twitter: ${twitter.url}`);
        }
        console.log(`   Boosts: ${t.totalAmount || t.amount || 0}`);
        console.log('');
      });
      
    } else if (mode === '--search' && args[2]) {
      console.log(`🔎 SEARCH: "${args[2]}"\n`);
      const pairs = await searchPairs(args[2]);
      
      const filtered = chain === 'all'
        ? pairs
        : pairs.filter(p => p.chainId === chain.toLowerCase());
      
      filtered.slice(0, 15).forEach((p, i) => {
        console.log(`${i + 1}. ${formatToken(p)}`);
        console.log(`   Pair: ${p.pairAddress?.slice(0, 12)}... | DEX: ${p.dexId}`);
        console.log(`   Txns 24h: ${p.txns?.h24?.buys || 0} buys / ${p.txns?.h24?.sells || 0} sells`);
        console.log('');
      });
      
    } else if (mode === '--token' && args[2]) {
      const address = args[2];
      const targetChain = chain === 'all' ? 'solana' : chain;
      
      console.log(`📊 TOKEN INFO: ${address}\n`);
      const pairs = await getTokenPairs(targetChain, address);
      
      if (pairs.pairs) {
        pairs.pairs.slice(0, 5).forEach((p, i) => {
          console.log(`${i + 1}. ${formatToken(p)}`);
          console.log(`   DEX: ${p.dexId} | Liquidity: $${(p.liquidity?.usd / 1000).toFixed(1)}k`);
          console.log('');
        });
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
