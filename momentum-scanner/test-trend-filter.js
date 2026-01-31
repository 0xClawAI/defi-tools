#!/usr/bin/env node
/**
 * Test cases for trend filter module
 */

const { 
  calculateTrendScore, 
  validateSignalWithTrend, 
  getTrendEmoji 
} = require('./trend-filter');

console.log('🧪 Testing Trend Filter Module\n');

// Test cases
const cases = [
  {
    name: 'Strong uptrend',
    priceChange: { m5: 3, h1: 8, h6: 15, h24: 25 },
    ratio: 2.0,
    expectPass: true
  },
  {
    name: 'Freefall (should reject)',
    priceChange: { m5: -5, h1: -18, h6: -25, h24: -40 },
    ratio: 2.5,
    expectPass: false
  },
  {
    name: 'High ratio during downtrend (EXIT LIQUIDITY)',
    priceChange: { m5: 1, h1: -8, h6: -15, h24: -20 },
    ratio: 2.0,
    expectPass: false
  },
  {
    name: 'Moderate ratio in strong uptrend',
    priceChange: { m5: 2, h1: 6, h6: 12, h24: 30 },
    ratio: 1.6,
    expectPass: true
  },
  {
    name: 'Neutral trend, high ratio',
    priceChange: { m5: 0.5, h1: -2, h6: 3, h24: -5 },
    ratio: 2.2,
    expectPass: false
  },
  {
    name: 'Sustained dump (-30% in 6h)',
    priceChange: { m5: 2, h1: 5, h6: -35, h24: -50 },
    ratio: 3.0,
    expectPass: false
  },
  {
    name: 'Recovery after dump (positive recent)',
    priceChange: { m5: 4, h1: 10, h6: 8, h24: -15 },
    ratio: 2.0,
    expectPass: true
  }
];

let passed = 0;
let failed = 0;

for (const tc of cases) {
  const trendResult = calculateTrendScore(tc.priceChange);
  const mockPair = { priceChange: tc.priceChange };
  const validation = validateSignalWithTrend(mockPair, tc.ratio);
  
  const icon = validation.valid === tc.expectPass ? '✅' : '❌';
  const status = validation.valid === tc.expectPass ? 'PASS' : 'FAIL';
  
  if (validation.valid === tc.expectPass) passed++;
  else failed++;
  
  console.log(`${icon} ${tc.name}`);
  console.log(`   Trend: ${getTrendEmoji(trendResult.score)} ${trendResult.trend} (${trendResult.score}/100)`);
  console.log(`   Ratio: ${tc.ratio}x`);
  console.log(`   Signal valid: ${validation.valid} (expected: ${tc.expectPass})`);
  console.log(`   Reason: ${validation.reason}`);
  console.log('');
}

console.log('━'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✅ All trend filter tests passed!');
