#!/usr/bin/env node
/**
 * Moltbook Registration Watcher v2.0
 * 
 * Alpha insight: New agents appear on Moltbook before Twitter announcements.
 * Watch for new agent names in posts/comments to detect early activity.
 * 
 * Approach: Track unique agent names from /posts feed, alert on new ones.
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
  
  // Paths
  DATA_DIR: path.join(__dirname, 'data'),
  SEEN_FILE: path.join(__dirname, 'data', 'seen-agents.json'),
  LOG_FILE: path.join(__dirname, 'data', 'new-agents.jsonl'),
};

// Track seen agents
function loadSeen() {
  if (fs.existsSync(CONFIG.SEEN_FILE)) {
    const data = JSON.parse(fs.readFileSync(CONFIG.SEEN_FILE, 'utf8'));
    return {
      agents: new Set(data.agents || []),
      lastCheck: data.lastCheck || null,
    };
  }
  return { agents: new Set(), lastCheck: null };
}

function saveSeen(data) {
  fs.writeFileSync(CONFIG.SEEN_FILE, JSON.stringify({
    agents: [...data.agents],
    lastCheck: new Date().toISOString(),
  }, null, 2));
}

// Fetch recent posts (which include author info)
async function fetchRecentPosts() {
  try {
    const response = await fetch(`${CONFIG.MOLTBOOK_API}/posts?sort=new&limit=50`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.log(`  Posts API returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.posts || data.data || [];
  } catch (error) {
    console.error('  Fetch error:', error.message);
    return [];
  }
}

// Fetch agent profile details
async function fetchAgentProfile(name) {
  try {
    const response = await fetch(`${CONFIG.MOLTBOOK_API}/agents/profile?name=${encodeURIComponent(name)}`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    return data.agent || data;
  } catch (error) {
    return null;
  }
}

// Extract unique agent names from posts
function extractAgents(posts) {
  const agents = new Map();
  
  for (const post of posts) {
    if (post.author_name || post.author?.name) {
      const name = post.author_name || post.author?.name;
      if (!agents.has(name)) {
        agents.set(name, {
          name,
          firstSeenPost: post.id,
          postTitle: post.title,
          createdAt: post.created_at,
        });
      }
    }
  }
  
  return agents;
}

// Alert on new agent detection
async function alertNewAgent(agent, profile) {
  const human = profile?.owner?.x_handle || null;
  const karma = profile?.karma || 0;
  
  const msg = `🆕 New Moltbook agent: ${agent.name}` +
    (human ? ` (human: @${human})` : '') +
    ` - Karma: ${karma}` +
    `\nFirst post: "${agent.postTitle?.substring(0, 50)}..."`;
  
  console.log(msg);
  console.log('');
  
  if (alertHub) {
    await alertHub.sendAlert({
      message: msg,
      severity: karma > 100 ? 'warning' : 'info',
      source: 'custom',
      type: 'moltbook_new_agent',
      coin: agent.name,
    });
  }
  
  // Log to file
  fs.appendFileSync(CONFIG.LOG_FILE, JSON.stringify({
    ...agent,
    human,
    karma,
    detectedAt: new Date().toISOString(),
  }) + '\n');
}

// Main scan
async function scanOnce() {
  const now = new Date().toISOString();
  console.log(`\n[${now}] Checking Moltbook for new agents...`);
  
  const state = loadSeen();
  const initialSize = state.agents.size;
  
  // Fetch recent posts
  const posts = await fetchRecentPosts();
  console.log(`  Fetched ${posts.length} recent posts`);
  
  // Extract unique agent names
  const postsAgents = extractAgents(posts);
  console.log(`  Found ${postsAgents.size} unique authors`);
  
  // Find new agents
  const newAgents = [];
  for (const [name, info] of postsAgents) {
    if (!state.agents.has(name)) {
      state.agents.add(name);
      newAgents.push(info);
    }
  }
  
  console.log(`  Known agents: ${initialSize} → ${state.agents.size}`);
  console.log(`  New agents: ${newAgents.length}`);
  
  // Process new agents
  for (const agent of newAgents) {
    // Fetch profile for more details
    const profile = await fetchAgentProfile(agent.name);
    await alertNewAgent(agent, profile);
    
    // Small delay between profile fetches
    await new Promise(r => setTimeout(r, 200));
  }
  
  saveSeen(state);
  return newAgents;
}

async function runLoop() {
  console.log('🔍 Moltbook Agent Watcher Starting...');
  console.log(`Poll interval: ${CONFIG.POLL_INTERVAL_MS / 1000 / 60} minutes`);
  console.log(`API: ${CONFIG.MOLTBOOK_API}`);
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
  const recent = lines.slice(-limit).map(l => JSON.parse(l));
  
  console.log(`📋 Recently Detected Agents (${recent.length})\n`);
  for (const r of recent) {
    console.log(`  ${r.name}${r.human ? ` (@${r.human})` : ''} - ${r.karma || 0} karma`);
    console.log(`    Detected: ${r.detectedAt}`);
    console.log('');
  }
}

// Show stats
function showStats() {
  const state = loadSeen();
  console.log('📊 Watcher Stats\n');
  console.log(`  Known agents: ${state.agents.size}`);
  console.log(`  Last check: ${state.lastCheck || 'never'}`);
  
  if (fs.existsSync(CONFIG.LOG_FILE)) {
    const lines = fs.readFileSync(CONFIG.LOG_FILE, 'utf8').trim().split('\n');
    console.log(`  Total detected: ${lines.length}`);
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
    default:
      console.log(`
Moltbook Agent Watcher v2.0

Usage:
  node watcher.js scan      Single scan for new agents
  node watcher.js loop      Continuous monitoring
  node watcher.js history   Show recently detected agents
  node watcher.js stats     Show watcher statistics

Detects new agents by watching who posts on Moltbook.
New agent activity often precedes Twitter announcements.
`);
  }
})();
