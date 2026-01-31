#!/usr/bin/env node
/**
 * Risk Manager
 * Automated profit-taking and stop-loss logic
 */

const RULES = {
  TAKE_PROFIT: [
    { at: 30, sell: 0.25 },   // 25% at +30%
    { at: 50, sell: 0.25 },   // 25% at +50%
    { at: 100, sell: 0.25 },  // 25% at +100%
    // Hold 25% as moonbag
  ],
  STOP_LOSS: -15,
  TRAILING_STOP: 0.2, // 20% from high
};

function checkPosition(position, currentPrice) {
  const pnl = (currentPrice - position.entryPrice) / position.entryPrice * 100;
  const actions = [];
  
  // Stop loss
  if (pnl <= RULES.STOP_LOSS) {
    actions.push({ action: 'SELL_ALL', reason: `Stop loss hit (${pnl.toFixed(1)}%)` });
    return actions;
  }
  
  // Take profit levels
  for (const level of RULES.TAKE_PROFIT) {
    if (pnl >= level.at && !position.profitsTaken?.includes(level.at)) {
      actions.push({ 
        action: 'TAKE_PROFIT', 
        portion: level.sell,
        reason: `+${level.at}% target hit`
      });
    }
  }
  
  return actions;
}

console.log('Risk Manager Rules:');
console.log('- Take profit: 25% each at +30%, +50%, +100%');
console.log('- Stop loss: -15%');
console.log('- Always keep 25% moonbag');

module.exports = { checkPosition, RULES };
