#!/usr/bin/env node
/**
 * Moltbook Registration Watcher v3.0
 * 
 * Alpha insight: New agents appear on Moltbook before Twitter announcements.
 * Watch /agents/recent endpoint for new registrations.
 * 
 * v3.0: Switched to /agents/recent endpoint (posts.author is null now)
 * v2.1: Added robust timeout/retry logic for slow API
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
  MOLTBOOK_API: 'https://www.moltbook.com/api/v1',
  API_KEY: process.env.MOLTBOOK_API_KEY || 'moltbook_sk_Kdhy1tp7Yl7CXtwI585TPXNIeIQYqi1w',
  
  POLL_INTERVAL_MS: 300000,  // 5 minutes
  FETCH_LIMIT: 50,           // Agents per fetch
  
  // Timeout/Retry
  REQUEST_TIMEOUT_MS: 15000,  // 15 second timeout per request
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,  // Start with 2s, exponential backoff
  
  // Filtering
  MIN_OWNER_FOLLOWERS: 0,    // Min Twitter followers to alert (0 = all)
  ALERT_ON_VERIFIED: true,   // Extra emphasis on verified accounts
  
  // Paths
  DATA_DIR: path.join(__dirname, 'data'),
  SEEN_FILE: path.join(__dirname, 'data', 'seen-agents.json'),
  LOG_FILE: path.join(__dirname, 'data', 'new-agents.jsonl'),
};

// Fetch with timeout and retry
async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      const isTimeout = error.name === 'AbortError';
      
      console.log(`  Attempt ${attempt}/${retries} failed: ${isTimeout ? 'timeout' : error.message}`);
      
      if (attempt < retries) {
        const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`  Retrying in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.log(`  All ${retries} attempts failed`);
        return null;
      }
    }
  }
  return null;
}

// Track seen agents
function loadSeen() {
  if (fs.existsSync(CONFIG.SEEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(CONFIG.SEEN_FILE, 'utf8'));
    return {
      agents: new Set(data.agents || []),
      lastCheck: data.lastCheck || null,
      totalCount: data.totalCount || 0,
    };
  }
  return { agents: new Set(), lastCheck: null, totalCount: 0 };
}

function saveSeen(data) {
  fs.writeFileSync(CONFIG.SEEN_FILE, JSON.stringify({
    agents: [...data.agents],
    lastCheck: new Date().toISOString(),
    totalCount: data.totalCount || 0,
  }, null, 2));
}

// Fetch recent agents directly from the /agents/recent endpoint
async function fetchRecentAgents() {
  const data = await fetchWithRetry(
    `${CONFIG.MOLTBOOK_API}/agents/recent?limit=${CONFIG.FETCH_LIMIT}`,
    {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (!data || !data.success) return { agents: [], totalCount: 0 };
  return {
    agents: data.agents || [],
    totalCount: data.total_count || 0,
  };
}

// Format agent for display
function formatAgent(agent) {
  const owner = agent.owner || {};
  const handle = owner.x_handle || null;
  const followers = owner.x_follower_count || 0;
  const verified = owner.x_verified || false;
  
  let line = `🆕 ${agent.name}`;
  
  if (handle) {
    line += ` → @${handle}`;
    if (followers > 0) line += ` (${followers.toLocaleString()} followers)`;
    if (verified) line += ' ✓';
  }
  
  if (agent.description) {
    const desc = agent.description.length > 80 
      ? agent.description.substring(0, 77) + '...' 
      : agent.description;
    line += `\n   "${desc}"`;
  }
  
  return line;
}

// Alert on new agent detection
async function alertNewAgent(agent) {
  const owner = agent.owner || {};
  const handle = owner.x_handle || null;
  const followers = owner.x_follower_count || 0;
  const verified = owner.x_verified || false;
  
  // Skip if below follower threshold (unless 0 = alert all)
  if (CONFIG.MIN_OWNER_FOLLOWERS > 0 && followers < CONFIG.MIN_OWNER_FOLLOWERS) {
    return false;
  }
  
  const msg = formatAgent(agent);
  console.log(msg);
  console.log('');
  
  // Determine alert severity
  let severity = 'info';
  if (verified) severity = 'critical';
  else if (followers >= 10000) severity = 'warning';
  else if (followers >= 1000) severity = 'info';
  
  if (alertHub) {
    await alertHub.sendAlert({
      message: `🦞 New Moltbook Agent: ${agent.name}` +
        (handle ? ` (@${handle}${followers > 0 ? `, ${followers.toLocaleString()} followers` : ''})` : '') +
        (verified ? ' ✓ VERIFIED' : '') +
        (agent.description ? `\n"${agent.description.substring(0, 100)}"` : ''),
      severity,
      source: 'custom',
      type: 'moltbook_new_agent',
      coin: agent.name,
    });
  }
  
  // Log to file
  fs.appendFileSync(CONFIG.LOG_FILE, JSON.stringify({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    karma: agent.karma || 0,
    owner_handle: handle,
    owner_followers: followers,
    owner_verified: verified,
    created_at: agent.created_at,
    claimed_at: agent.claimed_at,
    detected_at: new Date().toISOString(),
  }) + '\n');
  
  return true;
}

// Main scan
async function scanOnce() {
  const now = new Date().toISOString();
  console.log(`\n[${now}] Checking Moltbook for new agents...`);
  
  const state = loadSeen();
  const initialSize = state.agents.size;
  
  // Fetch recent agents
  const { agents, totalCount } = await fetchRecentAgents();
  
  if (agents.length === 0) {
    console.log('  ⚠️ API returned no agents (may be slow/down)');
    return [];
  }
  
  console.log(`  ✓ Fetched ${agents.length} recent agents (total: ${totalCount.toLocaleString()})`);
  
  // Track total count changes
  const prevTotal = state.totalCount;
  const newRegistrations = prevTotal > 0 ? totalCount - prevTotal : 0;
  if (newRegistrations > 0) {
    console.log(`  📈 +${newRegistrations} new registrations since last check`);
  }
  state.totalCount = totalCount;
  
  // Find new agents
  const newAgents = [];
  for (const agent of agents) {
    const id = agent.id || agent.name;
    if (!state.agents.has(id)) {
      state.agents.add(id);
      newAgents.push(agent);
    }
  }
  
  console.log(`  Known agents: ${initialSize} → ${state.agents.size}`);
  console.log(`  New in batch: ${newAgents.length}`);
  
  // Process new agents (newest first)
  let alertedCount = 0;
  for (const agent of newAgents.reverse()) {
    const alerted = await alertNewAgent(agent);
    if (alerted) alertedCount++;
    
    // Small delay between alerts
    await new Promise(r => setTimeout(r, 200));
  }
  
  if (alertedCount > 0) {
    console.log(`  📤 Sent ${alertedCount} alerts`);
  }
  
  saveSeen(state);
  return newAgents;
}

async function runLoop() {
  console.log('🦞 Moltbook Agent Watcher v3.0 Starting...');
  console.log(`Endpoint: /agents/recent`);
  console.log(`Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000 / 60} minutes`);
  console.log(`Request timeout: ${CONFIG.REQUEST_TIMEOUT_MS / 1000}s`);
  console.log(`Max retries: ${CONFIG.MAX_RETRIES}`);
  console.log(`Min followers for alert: ${CONFIG.MIN_OWNER_FOLLOWERS}`);
  console.log('');
  
  await scanOnce();
  
  setInterval(scanOnce, CONFIG.POLL_INTERVAL_MS);
}

// Show detection history
function showHistory(limit = 20) {
  if (!fs.existsSync(CONFIG.LOG_FILE)) {
    console.log('No agents detected yet.');
    return;
  }
  
  const lines = fs.readFileSync(CONFIG.LOG_FILE, 'utf8').trim().split('\n');
  const recent = lines.slice(-limit).map(l => JSON.parse(l)).reverse();
  
  console.log(`📋 Recently Detected Agents (${Math.min(limit, recent.length)} of ${lines.length})\n`);
  for (const r of recent) {
    console.log(`  ${r.name}${r.owner_handle ? ` → @${r.owner_handle}` : ''}`);
    if (r.owner_followers > 0) console.log(`    Followers: ${r.owner_followers.toLocaleString()}`);
    console.log(`    Created: ${r.created_at}`);
    console.log(`    Detected: ${r.detected_at}`);
    console.log('');
  }
}

// Show stats
function showStats() {
  const state = loadSeen();
  console.log('📊 Watcher Stats\n');
  console.log(`  Known agents: ${state.agents.size.toLocaleString()}`);
  console.log(`  Total on platform: ${state.totalCount.toLocaleString()}`);
  console.log(`  Last check: ${state.lastCheck || 'never'}`);
  
  if (fs.existsSync(CONFIG.LOG_FILE)) {
    const lines = fs.readFileSync(CONFIG.LOG_FILE, 'utf8').trim().split('\n');
    console.log(`  Agents logged: ${lines.length}`);
    
    // Stats on logged agents
    const logged = lines.map(l => JSON.parse(l));
    const withTwitter = logged.filter(a => a.owner_handle).length;
    const verified = logged.filter(a => a.owner_verified).length;
    const highFollowers = logged.filter(a => a.owner_followers >= 1000).length;
    
    console.log(`\n  With Twitter: ${withTwitter} (${Math.round(withTwitter/logged.length*100)}%)`);
    console.log(`  Verified: ${verified}`);
    console.log(`  1k+ followers: ${highFollowers}`);
  }
}

// Test API connectivity
async function testApi() {
  console.log('🧪 Testing Moltbook API connectivity...\n');
  
  console.log('1. Testing /agents/recent endpoint...');
  const { agents, totalCount } = await fetchRecentAgents();
  
  if (agents.length > 0) {
    console.log(`   ✓ Success! Got ${agents.length} agents (total: ${totalCount.toLocaleString()})`);
    const sample = agents[0];
    console.log(`   Sample: ${sample.name}`);
    if (sample.owner?.x_handle) {
      console.log(`     Owner: @${sample.owner.x_handle} (${sample.owner.x_follower_count} followers)`);
    }
    console.log(`     Created: ${sample.created_at}`);
  } else {
    console.log('   ✗ Failed - no agents returned');
  }
  
  console.log('\n2. Testing /agents/leaderboard endpoint...');
  const leaderboard = await fetchWithRetry(
    `${CONFIG.MOLTBOOK_API}/agents/leaderboard?limit=3`,
    {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  
  if (leaderboard?.success && leaderboard.leaderboard?.length > 0) {
    console.log(`   ✓ Success! Top agent: ${leaderboard.leaderboard[0].name} (${leaderboard.leaderboard[0].karma} karma)`);
  } else {
    console.log('   ✗ Failed - no leaderboard data');
  }
  
  console.log('\n3. Testing /agents/profile endpoint...');
  const profile = await fetchWithRetry(
    `${CONFIG.MOLTBOOK_API}/agents/profile?name=0xClaw`,
    {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
    },
    2
  );
  
  if (profile) {
    console.log(`   ✓ Success! Profile: ${profile.name || profile.agent?.name || 'found'}`);
  } else {
    console.log('   ✗ Failed - profile not found');
  }
  
  console.log('\n✅ API test complete.');
}

// Find notable agents (high-follower owners, verified, etc)
async function findNotable(minFollowers = 1000) {
  console.log(`🔍 Finding notable agents (owners with ${minFollowers}+ followers)...\n`);
  
  if (!fs.existsSync(CONFIG.LOG_FILE)) {
    console.log('No agents logged yet. Run a scan first.');
    return;
  }
  
  const lines = fs.readFileSync(CONFIG.LOG_FILE, 'utf8').trim().split('\n');
  const agents = lines.map(l => JSON.parse(l));
  
  const notable = agents
    .filter(a => a.owner_followers >= minFollowers || a.owner_verified)
    .sort((a, b) => (b.owner_followers || 0) - (a.owner_followers || 0));
  
  if (notable.length === 0) {
    console.log('No notable agents found yet.');
    return;
  }
  
  console.log(`Found ${notable.length} notable agents:\n`);
  for (const a of notable.slice(0, 20)) {
    console.log(`  ${a.name} → @${a.owner_handle}`);
    console.log(`    ${a.owner_followers.toLocaleString()} followers${a.owner_verified ? ' ✓ VERIFIED' : ''}`);
    if (a.description) console.log(`    "${a.description.substring(0, 60)}..."`);
    console.log('');
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
    case 'stats':
      showStats();
      break;
    case 'test':
      await testApi();
      break;
    case 'notable':
      await findNotable(parseInt(args[1]) || 1000);
      break;
    default:
      console.log(`
Moltbook Agent Watcher v3.0

Usage:
  node watcher.js scan        Single scan for new agents
  node watcher.js loop        Continuous monitoring
  node watcher.js history     Show recently detected agents
  node watcher.js stats       Show watcher statistics
  node watcher.js test        Test API connectivity
  node watcher.js notable     Find high-profile agent owners

Features:
  - Uses /agents/recent endpoint directly
  - Tracks total registration count
  - Filters by owner follower count
  - Extra alerts for verified accounts
  - 15s request timeout with retries

Alpha insight: New agents often precede Twitter announcements.
Watch for agents owned by high-follower accounts!
`);
  }
})();
