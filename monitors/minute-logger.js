const fs = require('fs');
const path = require('path');

const TOKENS = [
  { symbol: 'LEPUS', chain: 'solana', address: 'kiJUVYSiVYjyBbG7eJ7rsxrBox74oxvPWvyPYdPpump' },
  { symbol: 'MOLTBOOK', chain: 'solana', address: 'B1ECK8ZBH7iCsf5nRbdPLhYCHCfUx6xhtMgBJ345pump' },
  { symbol: 'VIRTUAL', chain: 'base', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b' },
  { symbol: 'MOLT', chain: 'solana', address: '9m5qkFpGMSqC88QZXLH93tqotFweGjJVW9ux9JvcJV2D' }
];

const LOG_DIR = '/home/clawdbot/projects/defi-tools/data/price-logs';
const today = new Date().toISOString().split('T')[0];
const logFile = path.join(LOG_DIR, `${today}.jsonl`);

async function fetchToken(token) {
  try {
    const url = `https://api.dexscreener.com/tokens/v1/${token.chain}/${token.address}`;
    const res = await fetch(url);
    const data = await res.json();
    const pair = data[0];
    if (!pair) return null;
    return {
      symbol: token.symbol,
      price: parseFloat(pair.priceUsd),
      volume24h: pair.volume?.h24 || 0,
      change1h: pair.priceChange?.h1 || 0,
      change24h: pair.priceChange?.h24 || 0,
      buys: pair.txns?.h24?.buys || 0,
      sells: pair.txns?.h24?.sells || 0,
      liquidity: pair.liquidity?.usd || 0
    };
  } catch (e) {
    return null;
  }
}

async function run() {
  const timestamp = new Date().toISOString();
  const results = await Promise.all(TOKENS.map(fetchToken));
  const entry = {
    timestamp,
    tokens: results.filter(r => r)
  };
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  console.log(`📊 ${timestamp} - Logged ${entry.tokens.length} tokens`);
  
  // Quick summary
  entry.tokens.forEach(t => {
    const ratio = t.sells > 0 ? (t.buys / t.sells).toFixed(2) : 'inf';
    console.log(`  ${t.symbol}: $${t.price} | 1h:${t.change1h}% | B/S:${ratio}`);
  });
}

run();
