#!/usr/bin/env node
/**
 * Auto-Predict System
 * Detects patterns and logs predictions in chain-ready format
 */

const fs = require('fs');

const PREDICTIONS_FILE = process.env.HOME + '/projects/defi-tools/data/predictions.json';

function loadPredictions() {
  try {
    return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
  } catch {
    return { predictions: [], validated: 0, total: 0 };
  }
}

function savePredictions(data) {
  fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(data, null, 2));
}

async function getTokenData(symbol) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${symbol}`);
  const data = await res.json();
  const pair = data.pairs?.[0];
  if (!pair) return null;
  
  return {
    symbol,
    price: parseFloat(pair.priceUsd),
    priceChange1h: pair.priceChange?.h1 || 0,
    volume: pair.volume?.h24 || 0
  };
}

async function checkPatterns() {
  const data = loadPredictions();
  const newPredictions = [];
  
  // DISABLED: DIP_BUY pattern invalidated 2026-01-31
  // Pattern caused -74% paper losses. High ratio during dip = exit liquidity.
  // See: .learnings/LEARNINGS.md "Trading Pattern Failure"
  const DIP_BUY_DISABLED = true;
  
  // Check MOLTBOOK for dip-buy pattern - DISABLED
  const molt = await getTokenData('MOLTBOOK');
  if (!DIP_BUY_DISABLED && molt && molt.priceChange1h < -3) {
    // DO NOT ENABLE - This pattern failed 100% during sustained downtrends
    // Results: MOLTBOOK -82% vs predicted +23.5% swing
    newPredictions.push({
      id: `MOLT-${Date.now()}`,
      token: 'MOLTBOOK',
      pattern: 'DIP_BUY',
      entryPrice: molt.price,
      targetPrice: molt.price * 1.235,
      timestamp: new Date().toISOString(),
      confidence: 'DISABLED',
      status: 'PATTERN_INVALIDATED'
    });
    console.log(`⚠️ MOLTBOOK DIP_BUY DISABLED - pattern invalidated`);
  } else if (molt) {
    console.log(`📊 MOLTBOOK @ $${molt.price} (${molt.priceChange1h}% 1h) - DIP_BUY disabled`);
  }
  
  // Check LEPUS for momentum
  const lepus = await getTokenData('LEPUS');
  if (lepus) {
    console.log(`📊 LEPUS @ $${lepus.price} (${lepus.priceChange1h}% 1h)`);
  }
  
  // Save new predictions
  if (newPredictions.length > 0) {
    data.predictions.push(...newPredictions);
    data.total += newPredictions.length;
    savePredictions(data);
    console.log(`\n✅ ${newPredictions.length} new predictions logged`);
  }
  
  return newPredictions;
}

// Run
console.log('🔍 Auto-Predict System\n');
checkPatterns().then(preds => {
  console.log(`\nDone. ${preds.length} patterns detected.`);
}).catch(console.error);
