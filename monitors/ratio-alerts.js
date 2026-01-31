#!/usr/bin/env node
/**
 * Ratio Alert System
 * Triggers alerts when validated patterns appear
 * 
 * Patterns:
 * - DIP_BUY: DISABLED (pattern invalidated 2026-01-31, caused -74% losses)
 * - MOMENTUM: Ratio >1.8x + volume spike + UPTREND = potential breakout
 */

// DIP_BUY DISABLED: Pattern that worked for initial MOLTBOOK run failed
// catastrophically during sustained downtrends. High ratio during dip =
// exit liquidity, not accumulation. See: .learnings/LEARNINGS.md
const DIP_BUY_DISABLED = true;

const THRESHOLDS = {
  DIP_BUY: {
    minRatio: 1.4,
    maxRatio: 1.6,
    priceChange: -3, // at least 3% down
    confidence: 'DISABLED', // Was 'high' - invalidated
    avgSwing: 23.5,
    DISABLED: true // Pattern no longer valid
  },
  MOMENTUM: {
    minRatio: 1.8,
    minVolume: 50000,
    confidence: 'medium',
    avgSwing: 30
  }
};

function analyzeToken(token) {
  const alerts = [];
  
  // DIP_BUY pattern - DISABLED (pattern invalidated 2026-01-31)
  // This pattern caused -74% paper portfolio losses
  if (!DIP_BUY_DISABLED &&
      token.priceChange < THRESHOLDS.DIP_BUY.priceChange &&
      token.buyRatio >= THRESHOLDS.DIP_BUY.minRatio &&
      token.buyRatio <= THRESHOLDS.DIP_BUY.maxRatio) {
    // DO NOT ENABLE - High ratio during dip = exit liquidity
    alerts.push({
      type: 'DIP_BUY',
      token: token.symbol,
      ratio: token.buyRatio,
      priceChange: token.priceChange,
      confidence: 'DISABLED',
      expectedSwing: 'PATTERN INVALIDATED',
      action: 'DO NOT TRADE'
    });
  }
  
  // MOMENTUM pattern
  if (token.buyRatio >= THRESHOLDS.MOMENTUM.minRatio &&
      token.volume >= THRESHOLDS.MOMENTUM.minVolume) {
    alerts.push({
      type: 'MOMENTUM',
      token: token.symbol,
      ratio: token.buyRatio,
      volume: token.volume,
      confidence: 'MEDIUM',
      expectedSwing: '+30%+',
      action: 'WATCH for entry'
    });
  }
  
  return alerts;
}

// Export for use in scanner
module.exports = { analyzeToken, THRESHOLDS };

// CLI mode
if (require.main === module) {
  console.log('Ratio Alert System');
  console.log('==================');
  console.log('Validated patterns:');
  console.log('- DIP_BUY: 1.4-1.6x ratio during dip → +23.5% avg');
  console.log('- MOMENTUM: >1.8x ratio + volume → +30%+ potential');
  console.log('\nIntegrate with token scanner for real-time alerts.');
}
