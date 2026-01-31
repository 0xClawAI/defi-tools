#!/usr/bin/env node
/**
 * Smart Money Finder
 * Finds wallets that were early to winning tokens on Base
 */

const fs = require('fs');

// Top performing Base tokens to analyze
const WINNERS = [
  { symbol: 'BRETT', address: '0x532f27101965dd16442e59d40670faf5ebb142e4' },
  { symbol: 'DEGEN', address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed' },
  { symbol: 'TOSHI', address: '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4' },
];

// Need Basescan API key for this - checking env
const BASESCAN_KEY = process.env.BASESCAN_API_KEY;

async function findEarlyBuyers(tokenAddress) {
  if (!BASESCAN_KEY) {
    console.log('Need BASESCAN_API_KEY in .env');
    console.log('Get one free at: https://basescan.org/apis');
    return [];
  }
  
  // Query first 100 token transfers
  const url = `https://api.basescan.org/api?module=token&action=tokentx&contractaddress=${tokenAddress}&page=1&offset=100&sort=asc&apikey=${BASESCAN_KEY}`;
  
  const res = await fetch(url);
  const data = await res.json();
  
  if (data.status !== '1') {
    console.error('API error:', data.message);
    return [];
  }
  
  // Extract unique early buyers (first 100 txs)
  const buyers = new Set();
  for (const tx of data.result) {
    if (tx.to && tx.to !== '0x0000000000000000000000000000000000000000') {
      buyers.add(tx.to.toLowerCase());
    }
  }
  
  return Array.from(buyers);
}

async function main() {
  console.log('🔍 Smart Money Finder\n');
  
  if (!BASESCAN_KEY) {
    console.log(`
To find smart money wallets:

1. Get free Basescan API key: https://basescan.org/apis
2. Add to .env: BASESCAN_API_KEY=your_key
3. Run again

Alternatively, use these methods:
- Check Dexscreener top traders tab
- Query Dune Analytics for early buyers
- Use x402 whale monitoring service
`);
    return;
  }
  
  for (const token of WINNERS) {
    console.log(`\n${token.symbol}:`);
    const buyers = await findEarlyBuyers(token.address);
    console.log(`  Found ${buyers.length} early addresses`);
  }
}

main();
