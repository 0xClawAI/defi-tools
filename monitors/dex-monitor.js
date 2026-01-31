#!/usr/bin/env node
/**
 * DEXScreener Automated Monitor
 * Runs continuously, logs new/trending tokens, tracks price movements
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const DATA_DIR = path.join(__dirname, '../data');
const ALERT_FILE = path.join(DATA_DIR, 'alerts.json');

// Ensure directories exist
[LOG_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Load previous state
function loadState() {
  const stateFile = path.join(DATA_DIR, 'monitor-state.json');
  if (fs.existsSync(stateFile)) {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  }
  return { seenTokens: {}, lastCheck: null, alerts: [] };
}

function saveState(state) {
  const stateFile = path.join(DATA_DIR, 'monitor-state.json');
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// Fetch boosted tokens
async function fetchBoostedTokens() {
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch boosted:', e.message);
    return [];
  }
}

// Fetch token details
async function fetchTokenDetails(chainId, tokenAddress) {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chainId}/${tokenAddress}`);
    const data = await res.json();
    return data[0] || null;
  } catch (e) {
    return null;
  }
}

// Check for AI/agent related tokens
function isAIRelated(token) {
  const keywords = ['ai', 'agent', 'moltbook', 'clawd', 'openclaw', 'autonomous', 'gpt', 'llm', 'bot'];
  const desc = (token.description || '').toLowerCase();
  const name = (token.baseToken?.name || '').toLowerCase();
  return keywords.some(k => desc.includes(k) || name.includes(k));
}

// Log finding
function logFinding(type, data) {
  const timestamp = new Date().toISOString();
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().split('T')[0]}.log`);
  const entry = `[${timestamp}] ${type}: ${JSON.stringify(data)}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(`📝 ${type}:`, data.symbol || data.name || 'unknown');
}

// Main monitor loop
async function monitor() {
  const state = loadState();
  console.log(`\n🔍 DEX Monitor - ${new Date().toISOString()}`);
  
  // Fetch boosted tokens
  const boosted = await fetchBoostedTokens();
  console.log(`Found ${boosted.length} boosted tokens`);
  
  let newTokens = 0;
  let aiTokens = 0;
  
  for (const token of boosted.slice(0, 20)) {
    const key = `${token.chainId}:${token.tokenAddress}`;
    const isNew = !state.seenTokens[key];
    const isAI = isAIRelated(token);
    
    if (isNew) {
      newTokens++;
      state.seenTokens[key] = {
        firstSeen: new Date().toISOString(),
        boosts: token.totalAmount,
        description: token.description?.slice(0, 100)
      };
      
      // Get more details
      const details = await fetchTokenDetails(token.chainId, token.tokenAddress);
      if (details) {
        state.seenTokens[key].price = details.priceUsd;
        state.seenTokens[key].fdv = details.fdv;
        state.seenTokens[key].socials = details.info?.socials || [];
        
        logFinding('NEW_TOKEN', {
          symbol: details.baseToken?.symbol,
          name: details.baseToken?.name,
          chain: token.chainId,
          boosts: token.totalAmount,
          price: details.priceUsd,
          fdv: details.fdv,
          socials: details.info?.socials?.map(s => s.url) || []
        });
      }
    }
    
    if (isAI) {
      aiTokens++;
      if (isNew) {
        logFinding('AI_TOKEN', {
          name: token.description?.slice(0, 50),
          chain: token.chainId,
          boosts: token.totalAmount
        });
      }
    }
  }
  
  state.lastCheck = new Date().toISOString();
  saveState(state);
  
  console.log(`✅ Check complete: ${newTokens} new tokens, ${aiTokens} AI-related`);
  console.log(`📊 Total tracked: ${Object.keys(state.seenTokens).length} tokens`);
}

// Run once or continuous
const args = process.argv.slice(2);
if (args.includes('--once')) {
  monitor().then(() => process.exit(0));
} else if (args.includes('--loop')) {
  const interval = parseInt(args[args.indexOf('--interval') + 1]) || 300000; // 5 min default
  console.log(`Starting continuous monitor (interval: ${interval/1000}s)`);
  monitor();
  setInterval(monitor, interval);
} else {
  monitor().then(() => process.exit(0));
}
