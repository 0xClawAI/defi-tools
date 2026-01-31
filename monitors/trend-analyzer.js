const fs = require('fs');
const path = require('path');

const LOG_DIR = '/home/clawdbot/projects/defi-tools/data/price-logs';
const PREDICTIONS_FILE = '/home/clawdbot/projects/defi-tools/data/predictions.jsonl';
const today = new Date().toISOString().split('T')[0];

// DISABLED: Tokens with invalidated patterns or unreliable data
// MOLTBOOK: 0% accuracy, -77% avg vs predicted, pattern invalidated 2026-01-31
const DISABLED_TOKENS = ['MOLTBOOK'];
const logFile = path.join(LOG_DIR, `${today}.jsonl`);

function loadRecentData(minutes = 15) {
  if (!fs.existsSync(logFile)) return [];
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
  const cutoff = Date.now() - (minutes * 60 * 1000);
  return lines
    .map(l => JSON.parse(l))
    .filter(e => new Date(e.timestamp).getTime() > cutoff);
}

function analyzeTrends(data) {
  if (data.length < 3) return { error: 'Need more data points' };
  
  const symbols = [...new Set(data.flatMap(d => d.tokens.map(t => t.symbol)))];
  const trends = {};
  
  symbols.forEach(sym => {
    const prices = data.map(d => {
      const t = d.tokens.find(x => x.symbol === sym);
      return t ? { time: d.timestamp, price: t.price, buys: t.buys, sells: t.sells } : null;
    }).filter(x => x);
    
    if (prices.length < 2) return;
    
    const first = prices[0];
    const last = prices[prices.length - 1];
    const priceChange = ((last.price - first.price) / first.price * 100).toFixed(2);
    const avgRatio = prices.reduce((a, p) => a + (p.buys / (p.sells || 1)), 0) / prices.length;
    
    // Simple momentum: price direction + buy/sell pressure
    // UPDATED: Removed DIP_BUY signal (caused -74% paper losses)
    let signal = 'HOLD';
    if (priceChange > 2 && avgRatio > 1.3) signal = 'BULLISH';
    else if (priceChange < -2 && avgRatio < 0.8) signal = 'BEARISH';
    else if (priceChange > 0 && avgRatio > 1.2) signal = 'ACCUMULATING';
    // DIP_BUY removed - high ratio during downtrend is exit liquidity, not accumulation
    // else if (priceChange < 0 && avgRatio > 1.2) signal = 'DIP_BUY';
    
    trends[sym] = {
      priceChange: parseFloat(priceChange),
      avgBuySellRatio: parseFloat(avgRatio.toFixed(2)),
      dataPoints: prices.length,
      signal,
      currentPrice: last.price
    };
  });
  
  return trends;
}

function makePredictions(trends) {
  const predictions = [];
  Object.entries(trends).forEach(([symbol, data]) => {
    // Skip disabled tokens
    if (DISABLED_TOKENS.includes(symbol)) return;
    
    // CRITICAL FIX: Only predict UP when price is ALREADY rising
    // Lesson learned: High buy ratio during downtrend = exit liquidity, not accumulation
    // See: .learnings/LEARNINGS.md "Trading Pattern Failure"
    
    if (data.signal === 'BULLISH') {
      // Price AND ratio both positive - safer signal
      predictions.push({
        symbol,
        prediction: 'UP',
        confidence: 'medium',
        reason: `+${data.priceChange}% with ${data.avgBuySellRatio}x buy ratio`,
        targetMove: '+5-10%',
        currentPrice: data.currentPrice
      });
    }
    
    // REMOVED: DIP_BUY signal - this was the main cause of -74% paper losses
    // The "buy the dip" strategy failed 100% of the time during sustained downtrends
    // Keeping this commented as a reminder:
    // else if (data.signal === 'DIP_BUY') {
    //   // DANGER: This predicted REVERSAL_UP during dumps, resulting in:
    //   // - MOLTBOOK: -82% vs predicted reversal
    //   // - LEPUS: -81% vs predicted reversal
    //   // DO NOT UNCOMMENT unless trend validation is added
    // }
    
    else if (data.signal === 'BEARISH') {
      predictions.push({
        symbol,
        prediction: 'DOWN',
        confidence: 'medium',
        reason: `${data.priceChange}% with weak ${data.avgBuySellRatio}x ratio`,
        targetMove: '-5-10%',
        currentPrice: data.currentPrice
      });
    }
  });
  return predictions;
}

async function run() {
  console.log('📈 Trend Analysis - ' + new Date().toISOString());
  
  const data = loadRecentData(15);
  console.log(`  Data points: ${data.length} (last 15 min)`);
  
  if (data.length < 3) {
    console.log('  ⏳ Need more data. Run minute-logger a few times first.');
    return;
  }
  
  const trends = analyzeTrends(data);
  console.log('\n  Trends:');
  Object.entries(trends)
    .filter(([sym]) => !DISABLED_TOKENS.includes(sym))
    .forEach(([sym, t]) => {
      console.log(`  ${sym}: ${t.signal} | Δ${t.priceChange}% | B/S:${t.avgBuySellRatio}`);
    });
  
  const predictions = makePredictions(trends);
  if (predictions.length > 0) {
    console.log('\n  Predictions:');
    predictions.forEach(p => {
      console.log(`  ${p.symbol}: ${p.prediction} (${p.confidence}) - ${p.reason}`);
    });
    
    // Log predictions for later verification
    const entry = { timestamp: new Date().toISOString(), predictions };
    fs.appendFileSync(PREDICTIONS_FILE, JSON.stringify(entry) + '\n');
  }
}

run();
