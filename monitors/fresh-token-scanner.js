const fs = require('fs');

const LOG_FILE = '/home/clawdbot/projects/defi-tools/data/fresh-tokens.jsonl';

async function scanFreshTokens() {
  const now = Date.now();
  const cutoff48h = now - (48 * 60 * 60 * 1000);
  
  // Get latest token profiles
  const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
  const profiles = await res.json();
  
  const fresh = [];
  
  for (const p of profiles.slice(0, 30)) {
    if (p.chainId !== 'solana') continue;
    
    try {
      const tokenRes = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${p.tokenAddress}`);
      const data = await tokenRes.json();
      const pair = data[0];
      
      if (!pair || pair.pairCreatedAt < cutoff48h) continue;
      if (pair.volume?.h24 < 5000) continue;
      
      const ageHours = Math.floor((now - pair.pairCreatedAt) / 3600000);
      const buyRatio = pair.txns?.h24?.sells > 0 
        ? (pair.txns.h24.buys / pair.txns.h24.sells).toFixed(2) 
        : 0;
      
      fresh.push({
        symbol: pair.baseToken.symbol,
        address: pair.baseToken.address,
        price: pair.priceUsd,
        ageHours,
        volume: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        buys: pair.txns?.h24?.buys || 0,
        sells: pair.txns?.h24?.sells || 0,
        buyRatio: parseFloat(buyRatio),
        change1h: pair.priceChange?.h1 || 0
      });
    } catch (e) {}
  }
  
  // Sort by buy ratio
  fresh.sort((a, b) => b.buyRatio - a.buyRatio);
  
  const entry = { timestamp: new Date().toISOString(), tokens: fresh.slice(0, 10) };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  
  console.log('🆕 Fresh Token Scan - ' + new Date().toISOString());
  console.log(`   Found ${fresh.length} tokens < 48h old with volume`);
  console.log('   Top by buy ratio:');
  fresh.slice(0, 5).forEach(t => {
    console.log(`   ${t.symbol}: $${t.price} | ${t.ageHours}h old | B/S:${t.buyRatio} | Vol:$${Math.floor(t.volume)}`);
  });
}

scanFreshTokens();
