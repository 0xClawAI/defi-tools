#!/usr/bin/env node
/**
 * Alpha Cross-Reference Tool
 * Combines x402 overnight alpha with token scanner data
 * 
 * Signals:
 * - High sentiment + high authors = STRONG BUY signal
 * - High sentiment + low authors = CABAL (avoid)
 * - High buy ratio + organic spread = confirmation
 */

const fs = require('fs');

// Load overnight alpha if available
function loadOvernightAlpha() {
  try {
    const log = fs.readFileSync(process.env.HOME + '/memory/x402-alpha.log', 'utf8');
    return log;
  } catch {
    return null;
  }
}

// Main scoring function
function scoreToken(ticker, data) {
  const score = {
    ticker,
    sentiment: data.sentiment || 0,
    authors: data.authors || 0,
    mentions: data.mentions || 0,
    buyRatio: data.buyRatio || 1,
    signals: []
  };
  
  // Author concentration check
  if (score.mentions > 50 && score.authors < 10) {
    score.signals.push('⚠️ CABAL: Low author concentration');
    score.risk = 'HIGH';
  } else if (score.mentions > 50 && score.authors > 30) {
    score.signals.push('✅ Organic spread');
    score.risk = 'LOW';
  }
  
  // Sentiment + buy ratio
  if (score.sentiment > 0.7 && score.buyRatio > 1.5) {
    score.signals.push('🔥 Strong momentum alignment');
  }
  
  return score;
}

console.log(`
Alpha Cross-Reference Tool
==========================

Scoring framework:
- Sentiment > 0.7 + Authors > 30 = Organic momentum (BUY signal)
- Sentiment > 0.7 + Authors < 10 = Cabal (AVOID)
- Buy ratio > 1.5 + Organic = Confirmation

Usage: Pipe in data or call with ticker
`);
