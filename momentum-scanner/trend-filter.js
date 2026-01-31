/**
 * Trend Filter Module
 * 
 * Prevents signals during downtrends. The key learning:
 * "Ratio measures buying *pressure*, not *price direction*. 
 *  In a downtrend, high buy ratios may indicate:
 *  - Retail buying falling knives
 *  - Market makers providing exit liquidity
 *  - Trapped buyers averaging down"
 * 
 * Rules:
 * 1. Price must be above 4h low (not at multi-hour bottom)
 * 2. Price change direction must align with signal type
 * 3. Short-term trend must not be strongly negative
 */

const TREND_CONFIG = {
  // Trend detection
  MIN_PRICE_VS_4H_LOW: 0.05,   // Must be 5% above 4h low
  MAX_1H_DROP: -15,             // Reject if down >15% in 1h (freefall)
  MAX_6H_DROP: -30,             // Reject if down >30% in 6h (sustained dump)
  
  // Trend scoring
  STRONG_UPTREND: 60,           // Score threshold for "safe" uptrend
  WEAK_TREND: 30,               // Below this = unclear/dangerous
};

/**
 * Calculate trend score from price changes
 * @param {Object} priceChange - { m5, h1, h6, h24 } percentage changes
 * @returns {Object} { score, trend, reason, safe }
 */
function calculateTrendScore(priceChange) {
  const { m5 = 0, h1 = 0, h6 = 0, h24 = 0 } = priceChange;
  
  // Immediate rejection cases
  if (h1 <= TREND_CONFIG.MAX_1H_DROP) {
    return {
      score: 0,
      trend: 'FREEFALL',
      reason: `Down ${h1.toFixed(1)}% in 1h - freefall`,
      safe: false
    };
  }
  
  if (h6 <= TREND_CONFIG.MAX_6H_DROP) {
    return {
      score: 10,
      trend: 'DOWNTREND',
      reason: `Down ${h6.toFixed(1)}% in 6h - sustained dump`,
      safe: false
    };
  }
  
  // Calculate weighted score (recent matters more)
  // m5: 30%, h1: 35%, h6: 25%, h24: 10%
  let score = 50; // Neutral baseline
  
  // m5 contribution (fast moves)
  if (m5 > 2) score += 15;
  else if (m5 > 0) score += 8;
  else if (m5 < -2) score -= 15;
  else if (m5 < 0) score -= 5;
  
  // h1 contribution (recent trend)
  if (h1 > 5) score += 18;
  else if (h1 > 0) score += 10;
  else if (h1 < -5) score -= 18;
  else if (h1 < 0) score -= 8;
  
  // h6 contribution (medium-term)
  if (h6 > 10) score += 12;
  else if (h6 > 0) score += 6;
  else if (h6 < -10) score -= 15;
  else if (h6 < 0) score -= 6;
  
  // h24 contribution (context)
  if (h24 > 20) score += 5;
  else if (h24 < -20) score -= 5;
  
  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));
  
  // Determine trend label
  let trend, reason;
  if (score >= 70) {
    trend = 'STRONG_UPTREND';
    reason = 'Multiple timeframes positive';
  } else if (score >= TREND_CONFIG.STRONG_UPTREND) {
    trend = 'UPTREND';
    reason = 'Generally positive momentum';
  } else if (score >= TREND_CONFIG.WEAK_TREND) {
    trend = 'NEUTRAL';
    reason = 'Mixed signals, unclear direction';
  } else if (score >= 15) {
    trend = 'DOWNTREND';
    reason = 'Negative momentum across timeframes';
  } else {
    trend = 'STRONG_DOWNTREND';
    reason = 'Strongly negative, likely capitulation';
  }
  
  return {
    score,
    trend,
    reason,
    safe: score >= TREND_CONFIG.STRONG_UPTREND,
    details: { m5, h1, h6, h24 }
  };
}

/**
 * Check if token passes trend filter for BUY signals
 * @param {Object} tokenData - From DexScreener
 * @returns {Object} { pass, score, trend, reason }
 */
function checkTrendForBuy(tokenData) {
  const priceChange = tokenData.priceChange || {};
  const result = calculateTrendScore(priceChange);
  
  // Additional check: reject if at local bottom
  // (Price near 24h low suggests downtrend continuation)
  if (tokenData.priceUsd && tokenData.h24Low) {
    const distFromLow = ((tokenData.priceUsd - tokenData.h24Low) / tokenData.h24Low) * 100;
    if (distFromLow < 3) {
      result.safe = false;
      result.reason += ' | Near 24h low (likely downtrend)';
    }
  }
  
  return {
    pass: result.safe,
    ...result
  };
}

/**
 * Enhanced signal validation with trend context
 * @param {Object} tokenData - Token data from DexScreener
 * @param {number} buyRatio - Buy/sell ratio
 * @returns {Object} { valid, trendScore, reason }
 */
function validateSignalWithTrend(tokenData, buyRatio) {
  const trendCheck = checkTrendForBuy(tokenData);
  
  // High ratio during downtrend = DANGER
  if (!trendCheck.pass && buyRatio >= 1.5) {
    return {
      valid: false,
      trendScore: trendCheck.score,
      trend: trendCheck.trend,
      reason: `HIGH RATIO + ${trendCheck.trend} = EXIT LIQUIDITY WARNING`,
      details: trendCheck.details
    };
  }
  
  // High ratio during uptrend = POTENTIAL SIGNAL
  if (trendCheck.pass && buyRatio >= 1.8) {
    return {
      valid: true,
      trendScore: trendCheck.score,
      trend: trendCheck.trend,
      reason: `High ratio ${buyRatio.toFixed(2)}x confirmed by ${trendCheck.trend}`,
      details: trendCheck.details
    };
  }
  
  // Moderate ratio during strong uptrend = MAYBE
  if (trendCheck.score >= 70 && buyRatio >= 1.5) {
    return {
      valid: true,
      trendScore: trendCheck.score,
      trend: trendCheck.trend,
      reason: `Moderate ratio ${buyRatio.toFixed(2)}x with strong uptrend`,
      confidence: 'MEDIUM',
      details: trendCheck.details
    };
  }
  
  // Default: don't signal
  return {
    valid: false,
    trendScore: trendCheck.score,
    trend: trendCheck.trend,
    reason: trendCheck.reason,
    details: trendCheck.details
  };
}

/**
 * Quick trend check for logging/display
 */
function getTrendEmoji(score) {
  if (score >= 70) return '🚀'; // Strong up
  if (score >= 60) return '📈'; // Up
  if (score >= 40) return '➡️'; // Neutral
  if (score >= 20) return '📉'; // Down
  return '💀'; // Crash
}

module.exports = {
  TREND_CONFIG,
  calculateTrendScore,
  checkTrendForBuy,
  validateSignalWithTrend,
  getTrendEmoji
};
