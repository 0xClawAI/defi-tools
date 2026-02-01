#!/usr/bin/env node
/**
 * Adaptive OBI (Order Book Imbalance) Filter
 * 
 * Research tool for prediction market order book analysis.
 * OBI measures buy vs sell pressure in the order book.
 * 
 * Key insight from JARVIS-Koz: Fixed OBI thresholds underperform
 * adaptive ones that adjust based on market regime (trending vs consolidation).
 * 
 * OBI Formula: (BidVolume - AskVolume) / (BidVolume + AskVolume)
 * Range: -1 (all sell pressure) to +1 (all buy pressure)
 * 
 * Usage:
 *   node index.js markets          - List active markets with OBI
 *   node index.js analyze <id>     - Deep analyze specific market
 *   node index.js scan             - Scan for OBI signals
 *   node index.js research         - Run regime research
 *   node index.js backtest         - Backtest adaptive vs fixed thresholds
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// Default fixed threshold (typical industry standard)
const FIXED_OBI_THRESHOLD = 0.15;

// Adaptive threshold parameters
const ADAPTIVE_CONFIG = {
  volatilityWindow: 24,        // Hours of price data for volatility calc
  minThreshold: 0.05,          // Min OBI threshold (high volatility)
  maxThreshold: 0.30,          // Max OBI threshold (low volatility)
  regimeWindow: 6,             // Hours for regime detection
  trendThreshold: 0.03,        // 3% move = trending
  consolidationMax: 0.015,     // <1.5% range = consolidation
};

/**
 * Calculate OBI from order book
 * @param {Object} orderBook - {bids: [{price, size}, ...], asks: [{price, size}, ...]}
 * @param {number} depth - Number of levels to consider
 */
function calculateOBI(orderBook, depth = 5) {
  if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
    return { obi: 0, bidVolume: 0, askVolume: 0, spread: 0 };
  }

  const bids = orderBook.bids.slice(0, depth);
  const asks = orderBook.asks.slice(0, depth);

  // Polymarket CLOB uses {price, size} objects
  const bidVolume = bids.reduce((sum, b) => sum + parseFloat(b.size || b[1] || 0), 0);
  const askVolume = asks.reduce((sum, a) => sum + parseFloat(a.size || a[1] || 0), 0);
  const totalVolume = bidVolume + askVolume;

  if (totalVolume === 0) {
    return { obi: 0, bidVolume: 0, askVolume: 0, spread: 0 };
  }

  const obi = (bidVolume - askVolume) / totalVolume;
  
  // Calculate spread (Polymarket uses {price, size} format)
  const bestBid = parseFloat(bids[0]?.price || bids[0]?.[0] || 0);
  const bestAsk = parseFloat(asks[0]?.price || asks[0]?.[0] || 0);
  const spread = bestAsk > 0 ? (bestAsk - bestBid) / bestAsk : 0;

  return {
    obi: parseFloat(obi.toFixed(4)),
    bidVolume: parseFloat(bidVolume.toFixed(2)),
    askVolume: parseFloat(askVolume.toFixed(2)),
    spread: parseFloat((spread * 100).toFixed(2)),
    bestBid,
    bestAsk
  };
}

/**
 * Calculate volatility from price history
 * @param {Array} prices - Array of {timestamp, price}
 */
function calculateVolatility(prices) {
  if (prices.length < 2) return 0;

  // Calculate returns
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1].price > 0) {
      returns.push((prices[i].price - prices[i - 1].price) / prices[i - 1].price);
    }
  }

  if (returns.length === 0) return 0;

  // Standard deviation of returns
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

/**
 * Detect market regime (trending vs consolidation)
 * @param {Array} prices - Array of {timestamp, price}
 */
function detectRegime(prices) {
  if (prices.length < 3) return { regime: 'UNKNOWN', strength: 0 };

  const first = prices[0].price;
  const last = prices[prices.length - 1].price;
  const change = Math.abs((last - first) / first);
  
  // Find high and low
  const high = Math.max(...prices.map(p => p.price));
  const low = Math.min(...prices.map(p => p.price));
  const range = (high - low) / ((high + low) / 2);

  if (change >= ADAPTIVE_CONFIG.trendThreshold) {
    const direction = last > first ? 'UPTREND' : 'DOWNTREND';
    return { regime: direction, strength: change, range };
  } else if (range <= ADAPTIVE_CONFIG.consolidationMax) {
    return { regime: 'CONSOLIDATION', strength: range, range };
  } else {
    return { regime: 'MIXED', strength: change, range };
  }
}

/**
 * Calculate adaptive OBI threshold based on volatility
 * Higher volatility = lower threshold needed (smaller imbalances are significant)
 * Lower volatility = higher threshold needed (need bigger imbalances)
 */
function calculateAdaptiveThreshold(volatility) {
  // Normalize volatility (typical range 0 - 0.1 for prediction markets)
  const normalizedVol = Math.min(volatility / 0.1, 1);
  
  // Inverse relationship: high vol = low threshold
  const { minThreshold, maxThreshold } = ADAPTIVE_CONFIG;
  const threshold = maxThreshold - (normalizedVol * (maxThreshold - minThreshold));
  
  return parseFloat(threshold.toFixed(4));
}

/**
 * Fetch order book from Polymarket CLOB
 */
async function fetchOrderBook(tokenId) {
  try {
    const res = await fetch(`${CLOB_API}/book?token_id=${tokenId}`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      console.error(`Failed to fetch order book: ${res.status}`);
      return null;
    }
    
    return await res.json();
  } catch (err) {
    console.error(`Error fetching order book: ${err.message}`);
    return null;
  }
}

/**
 * Fetch market data from Gamma API
 */
async function fetchMarkets(limit = 50, minVolume = 10000) {
  const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=${limit}`);
  const markets = await res.json();
  
  return markets
    .filter(m => !m.closed && !m.archived && m.volumeNum > minVolume)
    .sort((a, b) => b.volumeNum - a.volumeNum)
    .map(m => ({
      id: m.id,
      conditionId: m.conditionId,
      slug: m.slug,
      question: m.question,
      volume: m.volumeNum,
      liquidity: m.liquidityNum,
      clobTokenIds: m.clobTokenIds ? JSON.parse(m.clobTokenIds) : [],
      outcomePrices: m.outcomePrices ? JSON.parse(m.outcomePrices) : [],
      priceChange24h: m.oneDayPriceChange || 0,
    }));
}

/**
 * Fetch midpoint price for a token
 */
async function fetchMidpoint(tokenId) {
  try {
    const res = await fetch(`${CLOB_API}/midpoint?token_id=${tokenId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return parseFloat(data.mid || 0);
  } catch (err) {
    return null;
  }
}

/**
 * Estimate volatility from spread and price change
 * Higher spread + higher price change = higher volatility
 */
function estimateVolatility(spread, priceChange24h) {
  // Spread contributes to volatility (wider spread = more uncertainty)
  const spreadComponent = Math.min(spread / 10, 0.05); // Cap at 5%
  
  // 24h price change is direct volatility measure
  const changeComponent = Math.abs(priceChange24h) * 0.5;
  
  return spreadComponent + changeComponent;
}

/**
 * Analyze a single market with OBI
 */
async function analyzeMarket(market) {
  if (!market.clobTokenIds || market.clobTokenIds.length === 0) {
    return { ...market, obi: null, error: 'No CLOB token IDs' };
  }

  const tokenId = market.clobTokenIds[0]; // YES token
  
  // Fetch order book
  const orderBook = await fetchOrderBook(tokenId);

  if (!orderBook) {
    return { ...market, obi: null, error: 'Failed to fetch order book' };
  }

  // Calculate OBI
  const obiData = calculateOBI(orderBook, 5);
  
  // Estimate volatility from spread and 24h price change
  const volatility = estimateVolatility(obiData.spread, market.priceChange24h || 0);
  const adaptiveThreshold = calculateAdaptiveThreshold(volatility);
  
  // Detect regime from 24h price change
  const priceChange = market.priceChange24h || 0;
  let regime;
  if (priceChange >= ADAPTIVE_CONFIG.trendThreshold) {
    regime = { regime: 'UPTREND', strength: priceChange };
  } else if (priceChange <= -ADAPTIVE_CONFIG.trendThreshold) {
    regime = { regime: 'DOWNTREND', strength: Math.abs(priceChange) };
  } else if (Math.abs(priceChange) <= ADAPTIVE_CONFIG.consolidationMax) {
    regime = { regime: 'CONSOLIDATION', strength: Math.abs(priceChange) };
  } else {
    regime = { regime: 'MIXED', strength: Math.abs(priceChange) };
  }

  // Generate signal
  const absObi = Math.abs(obiData.obi);
  const fixedSignal = absObi >= FIXED_OBI_THRESHOLD;
  const adaptiveSignal = absObi >= adaptiveThreshold;

  return {
    ...market,
    obi: obiData,
    volatility: parseFloat(volatility.toFixed(4)),
    regime,
    thresholds: {
      fixed: FIXED_OBI_THRESHOLD,
      adaptive: adaptiveThreshold
    },
    signals: {
      fixed: fixedSignal,
      adaptive: adaptiveSignal,
      direction: obiData.obi > 0 ? 'BULLISH' : obiData.obi < 0 ? 'BEARISH' : 'NEUTRAL'
    }
  };
}

/**
 * List markets with OBI data
 */
async function listMarkets() {
  console.log('📊 Fetching Polymarket markets with OBI analysis...\n');
  
  const markets = await fetchMarkets(30, 50000);
  console.log(`Found ${markets.length} markets with >$50k volume\n`);

  const results = [];
  
  for (const market of markets.slice(0, 15)) {
    process.stdout.write(`  Analyzing: ${market.question.slice(0, 40)}...`);
    const analysis = await analyzeMarket(market);
    results.push(analysis);
    
    if (analysis.obi) {
      const icon = analysis.obi.obi > 0.1 ? '🟢' : analysis.obi.obi < -0.1 ? '🔴' : '⚪';
      console.log(` OBI: ${icon} ${(analysis.obi.obi * 100).toFixed(1)}%`);
    } else {
      console.log(' ❌ No data');
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('📈 OBI SUMMARY');
  console.log('='.repeat(70));

  const withObi = results.filter(r => r.obi?.obi);
  const bullish = withObi.filter(r => r.obi.obi > 0.1);
  const bearish = withObi.filter(r => r.obi.obi < -0.1);

  console.log(`\n🟢 Bullish OBI (>10%): ${bullish.length}`);
  bullish.forEach(r => {
    console.log(`   ${(r.obi.obi * 100).toFixed(1).padStart(6)}% | ${r.question.slice(0, 50)}`);
  });

  console.log(`\n🔴 Bearish OBI (<-10%): ${bearish.length}`);
  bearish.forEach(r => {
    console.log(`   ${(r.obi.obi * 100).toFixed(1).padStart(6)}% | ${r.question.slice(0, 50)}`);
  });

  // Save results
  const filename = `obi-scan-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved to data/${filename}`);

  return results;
}

/**
 * Deep analyze a specific market
 */
async function deepAnalyze(marketId) {
  console.log(`🔍 Deep analyzing market: ${marketId}\n`);
  
  const markets = await fetchMarkets(100, 0);
  const market = markets.find(m => m.id === marketId || m.slug?.includes(marketId));
  
  if (!market) {
    console.error('Market not found');
    return null;
  }

  const analysis = await analyzeMarket(market);
  
  console.log('='.repeat(70));
  console.log('MARKET ANALYSIS');
  console.log('='.repeat(70));
  console.log(`\n📋 ${analysis.question}`);
  console.log(`   ID: ${analysis.id}`);
  console.log(`   Volume: $${(analysis.volume / 1000000).toFixed(2)}M`);
  console.log(`   Liquidity: $${(analysis.liquidity / 1000).toFixed(0)}k`);

  if (analysis.obi) {
    console.log('\n📊 ORDER BOOK IMBALANCE');
    console.log(`   OBI: ${(analysis.obi.obi * 100).toFixed(2)}%`);
    console.log(`   Bid Volume: $${analysis.obi.bidVolume.toFixed(0)}`);
    console.log(`   Ask Volume: $${analysis.obi.askVolume.toFixed(0)}`);
    console.log(`   Spread: ${analysis.obi.spread.toFixed(2)}%`);
    console.log(`   Best Bid: ${(analysis.obi.bestBid * 100).toFixed(1)}¢`);
    console.log(`   Best Ask: ${(analysis.obi.bestAsk * 100).toFixed(1)}¢`);

    console.log('\n📈 VOLATILITY & REGIME');
    console.log(`   24h Volatility: ${(analysis.volatility * 100).toFixed(2)}%`);
    console.log(`   Regime: ${analysis.regime.regime}`);
    console.log(`   Regime Strength: ${(analysis.regime.strength * 100).toFixed(2)}%`);

    console.log('\n🎯 THRESHOLDS');
    console.log(`   Fixed Threshold: ${(analysis.thresholds.fixed * 100).toFixed(1)}%`);
    console.log(`   Adaptive Threshold: ${(analysis.thresholds.adaptive * 100).toFixed(1)}%`);
    
    console.log('\n⚡ SIGNALS');
    console.log(`   Fixed Signal: ${analysis.signals.fixed ? '✅ YES' : '❌ NO'}`);
    console.log(`   Adaptive Signal: ${analysis.signals.adaptive ? '✅ YES' : '❌ NO'}`);
    console.log(`   Direction: ${analysis.signals.direction}`);
  }

  return analysis;
}

/**
 * Scan for OBI signals
 */
async function scanSignals() {
  console.log('🔎 Scanning for OBI signals...\n');
  
  const markets = await fetchMarkets(50, 25000);
  const signals = [];

  for (const market of markets) {
    const analysis = await analyzeMarket(market);
    
    if (analysis.signals?.adaptive || analysis.signals?.fixed) {
      signals.push(analysis);
      
      const icon = analysis.obi.obi > 0 ? '🟢' : '🔴';
      console.log(`${icon} ${analysis.signals.direction} signal on:`);
      console.log(`   ${analysis.question.slice(0, 60)}`);
      console.log(`   OBI: ${(analysis.obi.obi * 100).toFixed(1)}% | Threshold: ${(analysis.thresholds.adaptive * 100).toFixed(1)}%`);
      console.log(`   Regime: ${analysis.regime.regime}\n`);
    }
    
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n📊 Found ${signals.length} signals out of ${markets.length} markets scanned`);
  
  // Save signals
  if (signals.length > 0) {
    const filename = `signals-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(signals, null, 2));
    console.log(`💾 Saved to data/${filename}`);
  }

  return signals;
}

/**
 * Research: Compare adaptive vs fixed thresholds across regimes
 */
async function runResearch() {
  console.log('🧪 Running OBI Regime Research...\n');
  
  const markets = await fetchMarkets(30, 50000);
  const research = {
    timestamp: new Date().toISOString(),
    markets: [],
    summary: {
      totalMarkets: 0,
      regimeBreakdown: { UPTREND: 0, DOWNTREND: 0, CONSOLIDATION: 0, MIXED: 0, UNKNOWN: 0 },
      avgVolatility: 0,
      avgObi: 0,
      adaptiveVsFixed: {
        adaptiveOnlySignals: 0,
        fixedOnlySignals: 0,
        bothSignals: 0,
        noSignals: 0
      }
    }
  };

  let totalVol = 0;
  let totalObi = 0;
  let count = 0;

  for (const market of markets) {
    process.stdout.write(`Analyzing ${count + 1}/${markets.length}...\r`);
    
    const analysis = await analyzeMarket(market);
    
    if (analysis.obi?.obi !== undefined) {
      research.markets.push({
        question: analysis.question.slice(0, 60),
        obi: analysis.obi.obi,
        volatility: analysis.volatility,
        regime: analysis.regime.regime,
        fixedSignal: analysis.signals.fixed,
        adaptiveSignal: analysis.signals.adaptive,
        adaptiveThreshold: analysis.thresholds.adaptive
      });

      // Update stats
      research.summary.regimeBreakdown[analysis.regime.regime]++;
      totalVol += analysis.volatility;
      totalObi += Math.abs(analysis.obi.obi);
      count++;

      // Track signal comparison
      if (analysis.signals.adaptive && analysis.signals.fixed) {
        research.summary.adaptiveVsFixed.bothSignals++;
      } else if (analysis.signals.adaptive) {
        research.summary.adaptiveVsFixed.adaptiveOnlySignals++;
      } else if (analysis.signals.fixed) {
        research.summary.adaptiveVsFixed.fixedOnlySignals++;
      } else {
        research.summary.adaptiveVsFixed.noSignals++;
      }
    }
    
    await new Promise(r => setTimeout(r, 200));
  }

  research.summary.totalMarkets = count;
  research.summary.avgVolatility = parseFloat((totalVol / count).toFixed(4));
  research.summary.avgObi = parseFloat((totalObi / count).toFixed(4));

  // Print research results
  console.log('\n' + '='.repeat(70));
  console.log('🧪 OBI REGIME RESEARCH RESULTS');
  console.log('='.repeat(70));
  
  console.log(`\n📊 Markets Analyzed: ${research.summary.totalMarkets}`);
  console.log(`📈 Average Volatility: ${(research.summary.avgVolatility * 100).toFixed(2)}%`);
  console.log(`📉 Average |OBI|: ${(research.summary.avgObi * 100).toFixed(2)}%`);

  console.log('\n🏛️ REGIME BREAKDOWN:');
  Object.entries(research.summary.regimeBreakdown).forEach(([regime, count]) => {
    if (count > 0) console.log(`   ${regime}: ${count}`);
  });

  console.log('\n⚡ ADAPTIVE vs FIXED THRESHOLD COMPARISON:');
  console.log(`   Both triggered: ${research.summary.adaptiveVsFixed.bothSignals}`);
  console.log(`   Adaptive only: ${research.summary.adaptiveVsFixed.adaptiveOnlySignals}`);
  console.log(`   Fixed only: ${research.summary.adaptiveVsFixed.fixedOnlySignals}`);
  console.log(`   No signal: ${research.summary.adaptiveVsFixed.noSignals}`);

  // Key insight
  const adaptiveAdvantage = research.summary.adaptiveVsFixed.adaptiveOnlySignals;
  const fixedAdvantage = research.summary.adaptiveVsFixed.fixedOnlySignals;
  
  if (adaptiveAdvantage > fixedAdvantage) {
    console.log(`\n💡 INSIGHT: Adaptive threshold caught ${adaptiveAdvantage} signals that fixed missed!`);
    console.log('   This suggests volatility-adjusted thresholds add value.');
  } else if (fixedAdvantage > adaptiveAdvantage) {
    console.log(`\n💡 INSIGHT: Fixed threshold caught ${fixedAdvantage} signals that adaptive missed.`);
    console.log('   Consider tuning adaptive parameters.');
  }

  // Save research
  const filename = `research-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(research, null, 2));
  console.log(`\n💾 Research saved to data/${filename}`);

  return research;
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'markets':
        await listMarkets();
        break;
        
      case 'analyze':
        if (!args[1]) {
          console.log('Usage: node index.js analyze <market-id-or-slug>');
          process.exit(1);
        }
        await deepAnalyze(args[1]);
        break;
        
      case 'scan':
        await scanSignals();
        break;
        
      case 'research':
        await runResearch();
        break;
        
      case 'help':
      default:
        console.log(`
Adaptive OBI Filter - Prediction Market Order Book Analysis

Commands:
  markets              List active markets with OBI
  analyze <id|slug>    Deep analyze a specific market
  scan                 Scan for OBI signals
  research             Run regime research (adaptive vs fixed)

OBI (Order Book Imbalance) Formula:
  OBI = (BidVolume - AskVolume) / (BidVolume + AskVolume)
  
  Range: -1 (all sell) to +1 (all buy)
  
  Positive OBI → More buy pressure (bullish)
  Negative OBI → More sell pressure (bearish)

Adaptive Threshold Logic:
  - High volatility → Lower threshold (small imbalances matter)
  - Low volatility → Higher threshold (need bigger imbalances)
  - Trending regime → Lower threshold
  - Consolidation → Higher threshold

Research source: JARVIS-Koz on Moltbook m/trading
`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
