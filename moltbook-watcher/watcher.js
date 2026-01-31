#!/usr/bin/env node
/**
 * Moltbook Registration Watcher
 * 
 * Alpha insight: Moltbook registrations happen via API before Twitter announcements.
 * Monitoring new registrations could front-run Twitter verification tweets.
 * 
 * Source: 2026-01-31 insight - Karpathy token pumped BEFORE his Twitter announcement
 */

const fs = require('fs');
const path = require('path');

// Alert Hub integration
let alertHub;
try {
  alertHub = require('../alert-hub/alerter');
} catch (e) {
  alertHub = null;
}

// Config
const CONFIG = {
  MOLTBOOK_API: 'https://moltbook.com/api/v1',
  API_KEY: process.env.MOLTBOOK_API_KEY || 'moltbook_sk_Kdhy1tp7Yl7CXtwI585TPXNIeIQYqi1w',
  
  // Thresholds for "notable" registrations
  MIN_KARMA_NOTABLE: 10000,
  POLL_INTERVAL_MS: 300000,  // 5 minutes
  
  // Paths
  DATA_DIR: path.join(__dirname, 'data'),
  SEEN_FILE: path.join(__dirname, 'data', 'seen-agents.json'),
};

// Track seen agents
function loadSeen() {
  if (fs.existsSync(CONFIG.SEEN_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(CONFIG.SEEN_FILE, 'utf8')));
  }
  return new Set();
}

function saveSeen(seen) {
  fs.writeFileSync(CONFIG.SEEN_FILE, JSON.stringify([...seen]));
}

// Fetch recent agents
async function fetchRecentAgents() {
  try {
    const response = await fetch(`${CONFIG.MOLTBOOK_API}/agents?sort=newest&limit=50`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.log(`API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.agents || data.data || [];
  } catch (error) {
    console.error('Fetch error:', error.message);
    return [];
  }
}

// Fetch agent details
async function fetchAgentDetails(agentId) {
  try {
    const response = await fetch(`${CONFIG.MOLTBOOK_API}/agents/${agentId}`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    return null;
  }
}

// Check for new notable agents
async function checkNewAgents(seen) {
  const agents = await fetchRecentAgents();
  const newNotable = [];
  
  for (const agent of agents) {
    const id = agent.id || agent.address;
    if (!id || seen.has(id)) continue;
    
    seen.add(id);
    
    // Check if notable (high karma, verified, or known human)
    const karma = agent.karma || 0;
    const isVerified = agent.verified || agent.humanVerified;
    const humanHandle = agent.humanTwitter || agent.humanAccount;
    
    if (karma > CONFIG.MIN_KARMA_NOTABLE || isVerified || humanHandle) {
      newNotable.push({
        id,
        name: agent.name || agent.username,
        karma,
        verified: isVerified,
        human: humanHandle,
        createdAt: agent.createdAt || new Date().toISOString(),
      });
    }
  }
  
  return newNotable;
}

// Alert on notable registration
async function alertNotable(agent) {
  const msg = `🆕 Notable Moltbook registration: ${agent.name}` +
    (agent.human ? ` (human: @${agent.human})` : '') +
    ` - Karma: ${agent.karma || 0}` +
    (agent.verified ? ' ✓ VERIFIED' : '');
  
  console.log(msg);
  
  if (alertHub) {
    await alertHub.sendAlert({
      message: msg,
      severity: agent.verified ? 'warning' : 'info',
      source: 'custom',
      type: 'moltbook_registration',
      coin: agent.name,
    });
  }
  
  // Log to file
  const logFile = path.join(CONFIG.DATA_DIR, 'notable-registrations.jsonl');
  fs.appendFileSync(logFile, JSON.stringify({
    ...agent,
    alertedAt: new Date().toISOString(),
  }) + '\n');
}

// Main scan
async function scanOnce() {
  const now = new Date().toISOString();
  console.log(`\n[${now}] Checking Moltbook registrations...`);
  
  const seen = loadSeen();
  const initialSize = seen.size;
  
  const newNotable = await checkNewAgents(seen);
  
  saveSeen(seen);
  
  console.log(`  Seen agents: ${initialSize} → ${seen.size}`);
  console.log(`  New notable: ${newNotable.length}`);
  
  for (const agent of newNotable) {
    await alertNotable(agent);
  }
  
  return newNotable;
}

async function runLoop() {
  console.log('🔍 Moltbook Registration Watcher Starting...');
  console.log(`Notable threshold: ${CONFIG.MIN_KARMA_NOTABLE} karma`);
  console.log(`Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000 / 60} minutes`);
  console.log('');
  
  await scanOnce();
  
  setInterval(scanOnce, CONFIG.POLL_INTERVAL_MS);
}

// Show recent notable registrations
function showHistory(limit = 20) {
  const logFile = path.join(CONFIG.DATA_DIR, 'notable-registrations.jsonl');
  
  if (!fs.existsSync(logFile)) {
    console.log('No registrations logged yet.');
    return;
  }
  
  const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
  const recent = lines.slice(-limit).map(l => JSON.parse(l));
  
  console.log(`📋 Recent Notable Registrations (${recent.length})\n`);
  for (const r of recent) {
    console.log(`  ${r.name}${r.human ? ` (@${r.human})` : ''} - ${r.karma || 0} karma${r.verified ? ' ✓' : ''}`);
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'scan';

// Ensure data dir exists
if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

(async () => {
  switch (command) {
    case 'scan':
    case '--once':
      await scanOnce();
      break;
    case 'loop':
    case '--loop':
      await runLoop();
      break;
    case 'history':
      showHistory(parseInt(args[1]) || 20);
      break;
    default:
      console.log(`
Moltbook Registration Watcher

Usage:
  node watcher.js scan      Single scan for new registrations
  node watcher.js loop      Continuous monitoring
  node watcher.js history   Show recent notable registrations

Alpha: Moltbook registrations precede Twitter announcements.
Notable agents could signal upcoming token pumps.
`);
  }
})();
