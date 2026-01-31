const fs = require('fs');

const PREDICTIONS_FILE = '/home/clawdbot/projects/defi-tools/data/predictions.jsonl';
const RESULTS_FILE = '/home/clawdbot/projects/defi-tools/data/prediction-results.jsonl';

async function fetchPrice(symbol) {
  const addresses = {
    'LEPUS': { chain: 'solana', addr: 'kiJUVYSiVYjyBbG7eJ7rsxrBox74oxvPWvyPYdPpump' },
    'MOLTBOOK': { chain: 'solana', addr: 'B1ECK8ZBH7iCsf5nRbdPLhYCHCfUx6xhtMgBJ345pump' },
    'VIRTUAL': { chain: 'base', addr: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b' },
    'MOLT': { chain: 'solana', addr: '9m5qkFpGMSqC88QZXLH93tqotFweGjJVW9ux9JvcJV2D' }
  };
  
  const t = addresses[symbol];
  if (!t) return null;
  
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${t.chain}/${t.addr}`);
    const data = await res.json();
    return data[0]?.priceUsd ? parseFloat(data[0].priceUsd) : null;
  } catch { return null; }
}

async function run() {
  if (!fs.existsSync(PREDICTIONS_FILE)) {
    console.log('No predictions to verify yet');
    return;
  }
  
  const lines = fs.readFileSync(PREDICTIONS_FILE, 'utf8').trim().split('\n');
  const cutoff = Date.now() - (15 * 60 * 1000); // Check predictions from 15+ min ago
  
  console.log('🔍 Verifying Predictions - ' + new Date().toISOString());
  
  for (const line of lines) {
    const entry = JSON.parse(line);
    const entryTime = new Date(entry.timestamp).getTime();
    
    if (entryTime > cutoff) continue; // Too recent
    
    for (const pred of entry.predictions) {
      const currentPrice = await fetchPrice(pred.symbol);
      if (!currentPrice) continue;
      
      const actualMove = ((currentPrice - pred.currentPrice) / pred.currentPrice * 100).toFixed(2);
      let correct = false;
      
      if (pred.prediction === 'UP' && actualMove > 2) correct = true;
      if (pred.prediction === 'DOWN' && actualMove < -2) correct = true;
      if (pred.prediction === 'REVERSAL_UP' && actualMove > 0) correct = true;
      
      console.log(`  ${pred.symbol}: Predicted ${pred.prediction} | Actual: ${actualMove}% | ${correct ? '✅' : '❌'}`);
      
      const result = {
        timestamp: new Date().toISOString(),
        predictionTime: entry.timestamp,
        symbol: pred.symbol,
        prediction: pred.prediction,
        priceAtPrediction: pred.currentPrice,
        priceNow: currentPrice,
        actualMove: parseFloat(actualMove),
        correct
      };
      
      fs.appendFileSync(RESULTS_FILE, JSON.stringify(result) + '\n');
    }
  }
}

run();
