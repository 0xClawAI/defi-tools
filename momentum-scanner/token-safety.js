/**
 * Token Safety Checker
 * Uses GoPlusLabs API for security analysis
 * - Locked liquidity check
 * - Holder distribution (honeypot, whale concentration)
 * - Contract verification
 */

const GOPLUS_API = 'https://api.gopluslabs.io/api/v1';

// Chain ID mapping for GoPlusLabs
const CHAIN_IDS = {
  'ethereum': '1',
  'base': '8453',
  'solana': 'solana',
  'bsc': '56',
  'arbitrum': '42161',
  'polygon': '137',
};

// Cache to avoid rate limits
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get token security info from GoPlusLabs
 */
async function getTokenSecurity(tokenAddress, chain = 'base') {
  const chainId = CHAIN_IDS[chain] || chain;
  const cacheKey = `${chainId}:${tokenAddress}`;
  
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const url = `${GOPLUS_API}/token_security/${chainId}?contract_addresses=${tokenAddress}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.code !== 1 || !data.result?.[tokenAddress.toLowerCase()]) {
      return null;
    }
    
    const result = data.result[tokenAddress.toLowerCase()];
    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (e) {
    console.error('GoPlusLabs API error:', e.message);
    return null;
  }
}

/**
 * Analyze token safety - returns risk assessment
 */
async function analyzeTokenSafety(tokenAddress, chain = 'base') {
  const security = await getTokenSecurity(tokenAddress, chain);
  
  if (!security) {
    return {
      safe: false,
      reason: 'Unable to fetch security data',
      score: 0,
      details: {}
    };
  }
  
  const risks = [];
  let score = 100;
  
  // === CRITICAL RISKS (instant reject) ===
  
  // Honeypot check
  if (security.is_honeypot === '1') {
    risks.push('🚨 HONEYPOT DETECTED');
    score = 0;
  }
  
  // Can't sell
  if (security.cannot_sell_all === '1') {
    risks.push('🚨 Cannot sell tokens');
    score = 0;
  }
  
  // Blacklist function
  if (security.is_blacklisted === '1') {
    risks.push('🚨 Blacklist function present');
    score -= 30;
  }
  
  // === HIGH RISKS (major deduction) ===
  
  // Owner can modify tax
  if (security.slippage_modifiable === '1') {
    risks.push('⚠️ Owner can modify slippage/tax');
    score -= 25;
  }
  
  // Hidden owner
  if (security.hidden_owner === '1') {
    risks.push('⚠️ Hidden owner detected');
    score -= 20;
  }
  
  // Can take back ownership
  if (security.can_take_back_ownership === '1') {
    risks.push('⚠️ Can reclaim ownership');
    score -= 20;
  }
  
  // Owner can change balance
  if (security.owner_change_balance === '1') {
    risks.push('⚠️ Owner can modify balances');
    score -= 30;
  }
  
  // === MEDIUM RISKS ===
  
  // Not open source
  if (security.is_open_source === '0') {
    risks.push('⚠️ Contract not verified');
    score -= 15;
  }
  
  // Proxy contract
  if (security.is_proxy === '1') {
    risks.push('📝 Proxy contract');
    score -= 10;
  }
  
  // External call risk
  if (security.external_call === '1') {
    risks.push('📝 Has external calls');
    score -= 5;
  }
  
  // === HOLDER ANALYSIS ===
  
  const holders = security.holders || [];
  const topHolder = holders[0];
  const top10Pct = holders.slice(0, 10).reduce((s, h) => s + parseFloat(h.percent || 0), 0);
  
  // Top holder owns >50%
  if (topHolder && parseFloat(topHolder.percent) > 50) {
    risks.push(`⚠️ Top holder owns ${(topHolder.percent * 100).toFixed(1)}%`);
    score -= 25;
  } else if (topHolder && parseFloat(topHolder.percent) > 30) {
    risks.push(`📝 Top holder owns ${(topHolder.percent * 100).toFixed(1)}%`);
    score -= 10;
  }
  
  // Top 10 own >80%
  if (top10Pct > 0.8) {
    risks.push(`⚠️ Top 10 hold ${(top10Pct * 100).toFixed(1)}%`);
    score -= 15;
  }
  
  // === LIQUIDITY ANALYSIS ===
  
  const lpHolders = security.lp_holders || [];
  let liquidityLocked = false;
  let lockedPercent = 0;
  
  for (const lp of lpHolders) {
    if (lp.is_locked === 1) {
      liquidityLocked = true;
      lockedPercent += parseFloat(lp.percent || 0);
    }
  }
  
  if (liquidityLocked) {
    // Bonus for locked liquidity
    score += 10;
  } else {
    risks.push('⚠️ Liquidity NOT locked');
    score -= 20;
  }
  
  // Low holder count
  const holderCount = parseInt(security.holder_count || 0);
  if (holderCount < 100) {
    risks.push(`📝 Low holder count: ${holderCount}`);
    score -= 10;
  }
  
  // Normalize score
  score = Math.max(0, Math.min(100, score));
  
  return {
    safe: score >= 60,
    score,
    reason: risks.length > 0 ? risks.join(', ') : 'Passed all checks',
    risks,
    details: {
      isHoneypot: security.is_honeypot === '1',
      isOpenSource: security.is_open_source === '1',
      canSell: security.cannot_sell_all !== '1',
      hasBlacklist: security.is_blacklisted === '1',
      liquidityLocked,
      lockedPercent: lockedPercent * 100,
      holderCount,
      top10Percent: top10Pct * 100,
      topHolderPercent: topHolder ? parseFloat(topHolder.percent) * 100 : 0,
    }
  };
}

/**
 * Quick safety check - returns true/false with optional reason
 */
async function isTokenSafe(tokenAddress, chain = 'base', minScore = 60) {
  const analysis = await analyzeTokenSafety(tokenAddress, chain);
  return {
    safe: analysis.score >= minScore,
    score: analysis.score,
    reason: analysis.reason,
  };
}

// Export for use in scanner
module.exports = {
  getTokenSecurity,
  analyzeTokenSafety,
  isTokenSafe,
  CHAIN_IDS,
};

// CLI testing
if (require.main === module) {
  const addr = process.argv[2];
  const chain = process.argv[3] || 'base';
  
  if (!addr) {
    console.log('Usage: node token-safety.js <address> [chain]');
    console.log('Chains: ethereum, base, solana, bsc, arbitrum, polygon');
    process.exit(1);
  }
  
  analyzeTokenSafety(addr, chain).then(result => {
    console.log('\n🔒 Token Safety Analysis');
    console.log('========================');
    console.log(`Score: ${result.score}/100 ${result.safe ? '✅' : '❌'}`);
    console.log(`\nDetails:`);
    for (const [key, val] of Object.entries(result.details)) {
      console.log(`  ${key}: ${val}`);
    }
    if (result.risks.length > 0) {
      console.log(`\nRisks:`);
      result.risks.forEach(r => console.log(`  ${r}`));
    }
  }).catch(console.error);
}
