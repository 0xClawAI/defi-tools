#!/usr/bin/env node
/**
 * Position Sizing Based on Conviction
 * 
 * Kelly-inspired but conservative (half-Kelly)
 */

const SIZING = {
  // Based on signal confidence
  HIGH: {
    label: 'High Conviction',
    description: 'Validated pattern (4/4+), strong setup',
    baseSize: 5,      // $5 base
    maxSize: 10,      // $10 max
    examples: ['Dip-buy 1.46x (4/4 validated)', 'Momentum >1.8x with volume']
  },
  MEDIUM: {
    label: 'Medium Conviction',
    description: 'Promising pattern, partial validation',
    baseSize: 2,      // $2 base
    maxSize: 5,       // $5 max
    examples: ['New pattern first test', 'Good setup but thin liquidity']
  },
  LOW: {
    label: 'Low Conviction',
    description: 'Experimental, testing hypothesis',
    baseSize: 0.50,   // $0.50 base
    maxSize: 1,       // $1 max
    examples: ['Contrarian play', 'Unvalidated signal', 'High risk/reward']
  }
};

// Signal → Confidence mapping
const SIGNAL_CONFIDENCE = {
  'dip-buy': 'HIGH',           // 4/4 validated
  'dip-buy-5': 'HIGH',         // 5th occurrence of validated
  'momentum': 'HIGH',          // LEPUS proved this
  'extreme-ratio': 'MEDIUM',   // Testing, not yet validated
  'volume-spike': 'MEDIUM',    // Needs more data
  'contrarian': 'LOW',         // CLAWD showed this is risky
  'test': 'LOW'                // Pure experiment
};

function getSize(signal, confidence = null) {
  const level = confidence || SIGNAL_CONFIDENCE[signal] || 'LOW';
  const sizing = SIZING[level];
  return {
    size: sizing.baseSize,
    max: sizing.maxSize,
    level,
    label: sizing.label
  };
}

// CLI
const signal = process.argv[2];
if (signal) {
  const result = getSize(signal);
  console.log(`Signal: ${signal}`);
  console.log(`Conviction: ${result.label} (${result.level})`);
  console.log(`Position size: $${result.size} (max: $${result.max})`);
} else {
  console.log('Position Sizing Rules\n');
  for (const [level, config] of Object.entries(SIZING)) {
    console.log(`${level}: $${config.baseSize} - $${config.maxSize}`);
    console.log(`  ${config.description}`);
    console.log(`  Examples: ${config.examples.join(', ')}\n`);
  }
}

module.exports = { getSize, SIZING, SIGNAL_CONFIDENCE };
