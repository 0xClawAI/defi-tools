#!/usr/bin/env node
/**
 * OpenWork Bounty Scanner
 * Monitors for new high-value bounties matching our specialties
 * 
 * Usage:
 *   node bounty-scanner.js           # Check for new bounties
 *   node bounty-scanner.js --watch   # Continuous monitoring
 *   node bounty-scanner.js --list    # List tracked bounties
 *   node bounty-scanner.js --clear   # Clear state
 */

const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE = 'https://www.openwork.bot/api';
const API_KEY = process.env.OPENWORK_API_KEY || 'ow_bf602af68505f45709e7dbbd1a08ec074136f5c8eba06ae6';
const STATE_FILE = path.join(__dirname, 'bounty-scanner-state.json');

// Our specialties - match against bounty tags
const SPECIALTIES = [
  'research', 'coding', 'trading', 'defi', 'automation',
  'smart-contracts', 'api-design', 'analysis', 'crypto',
  'debugging', 'nodejs', 'documentation', 'security-audit'
];

// Minimum reward to alert on (in $OPENWORK)
const MIN_REWARD = 50;

// Load state
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading state:', e.message);
  }
  return { seenJobs: {}, lastCheck: null };
}

// Save state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Fetch jobs from OpenWork
async function fetchJobs() {
  const url = `${API_BASE}/jobs?limit=100`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.jobs || data || [];
}

// Check if bounty matches our specialties
function matchesSpecialties(tags) {
  if (!tags || !Array.isArray(tags)) return false;
  const normalizedTags = tags.map(t => t.toLowerCase());
  return SPECIALTIES.some(s => normalizedTags.includes(s));
}

// Parse reward amount
function parseReward(rewardStr) {
  if (!rewardStr) return 0;
  const match = String(rewardStr).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Format bounty for display
function formatBounty(job, isNew = false) {
  const reward = parseReward(job.reward);
  const rewardStr = reward > 0 ? `${reward.toLocaleString()} $OPENWORK` : 'No reward';
  const matchedTags = job.tags?.filter(t => SPECIALTIES.includes(t.toLowerCase())) || [];
  
  let output = '';
  if (isNew) {
    output += '🆕 NEW BOUNTY ALERT!\n';
  }
  output += `💼 ${job.title}\n`;
  output += `   💰 Reward: ${rewardStr}\n`;
  output += `   🏷️  Tags: ${job.tags?.join(', ') || 'none'}\n`;
  if (matchedTags.length > 0) {
    output += `   ✅ Matches: ${matchedTags.join(', ')}\n`;
  }
  output += `   📋 ID: ${job.id}\n`;
  
  return output;
}

// Send alert (integrate with alert-hub if available)
async function sendAlert(message) {
  console.log('\n' + '='.repeat(60));
  console.log(message);
  console.log('='.repeat(60) + '\n');
  
  // Try to use alert-hub for Telegram notification
  const alertHubPath = path.join(__dirname, '..', 'alert-hub', 'index.js');
  if (fs.existsSync(alertHubPath)) {
    try {
      const alertHub = require(alertHubPath);
      await alertHub.sendAlert({
        type: 'OPENWORK_BOUNTY',
        priority: 'high',
        source: 'bounty-scanner',
        message: message
      });
    } catch (e) {
      // Silent fail - console already shows the alert
    }
  }
}

// Main scan function
async function scan() {
  const state = loadState();
  const now = Date.now();
  
  console.log('🔍 Scanning OpenWork for bounties...');
  console.log(`   Specialties: ${SPECIALTIES.slice(0, 5).join(', ')}...`);
  console.log(`   Min reward: ${MIN_REWARD} $OPENWORK\n`);
  
  try {
    const jobs = await fetchJobs();
    console.log(`📋 Found ${jobs.length} total jobs\n`);
    
    const newBounties = [];
    const highValueBounties = [];
    
    for (const job of jobs) {
      const reward = parseReward(job.reward);
      const matches = matchesSpecialties(job.tags);
      const isNew = !state.seenJobs[job.id];
      
      // Track all jobs we've seen
      if (isNew) {
        state.seenJobs[job.id] = {
          title: job.title,
          reward: reward,
          firstSeen: now,
          tags: job.tags
        };
      }
      
      // Alert on new high-value bounties matching specialties
      if (isNew && reward >= MIN_REWARD && matches) {
        newBounties.push(job);
      }
      
      // Track all high-value matching bounties
      if (reward >= MIN_REWARD && matches) {
        highValueBounties.push(job);
      }
    }
    
    // Alert on new bounties
    if (newBounties.length > 0) {
      for (const job of newBounties) {
        await sendAlert(formatBounty(job, true));
      }
    } else {
      console.log('✅ No new high-value bounties matching specialties\n');
    }
    
    // Summary
    console.log('📊 Summary:');
    console.log(`   Total jobs scanned: ${jobs.length}`);
    console.log(`   High-value matches: ${highValueBounties.length}`);
    console.log(`   New alerts sent: ${newBounties.length}`);
    
    // Update state
    state.lastCheck = now;
    saveState(state);
    
    return { newBounties, highValueBounties };
    
  } catch (error) {
    console.error('❌ Error scanning:', error.message);
    return { error: error.message };
  }
}

// List tracked bounties
function listBounties() {
  const state = loadState();
  const bounties = Object.entries(state.seenJobs);
  
  console.log(`📋 Tracked Bounties (${bounties.length} total)\n`);
  
  // Sort by reward descending
  bounties.sort((a, b) => (b[1].reward || 0) - (a[1].reward || 0));
  
  // Show top 20
  for (const [id, info] of bounties.slice(0, 20)) {
    const reward = info.reward > 0 ? `${info.reward.toLocaleString()} $OPENWORK` : 'No reward';
    console.log(`💼 ${info.title}`);
    console.log(`   💰 ${reward}`);
    console.log(`   📋 ${id}\n`);
  }
  
  if (state.lastCheck) {
    console.log(`\n⏰ Last scan: ${new Date(state.lastCheck).toLocaleString()}`);
  }
}

// Clear state
function clearState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    console.log('✅ State cleared');
  } else {
    console.log('ℹ️  No state file to clear');
  }
}

// Watch mode (continuous monitoring)
async function watch(intervalMs = 5 * 60 * 1000) {
  console.log('👀 Starting watch mode...');
  console.log(`   Interval: ${intervalMs / 1000}s\n`);
  
  // Initial scan
  await scan();
  
  // Continuous scanning
  setInterval(async () => {
    console.log('\n' + '-'.repeat(60));
    console.log(`🔄 Re-scanning at ${new Date().toLocaleString()}`);
    console.log('-'.repeat(60) + '\n');
    await scan();
  }, intervalMs);
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list') || args.includes('-l')) {
    listBounties();
  } else if (args.includes('--clear')) {
    clearState();
  } else if (args.includes('--watch') || args.includes('-w')) {
    await watch();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
OpenWork Bounty Scanner
Monitors for high-value bounties matching your specialties

Usage:
  node bounty-scanner.js           # One-time scan
  node bounty-scanner.js --watch   # Continuous monitoring (5min interval)
  node bounty-scanner.js --list    # List tracked bounties
  node bounty-scanner.js --clear   # Clear state

Configuration:
  MIN_REWARD: ${MIN_REWARD} $OPENWORK
  SPECIALTIES: ${SPECIALTIES.join(', ')}
`);
  } else {
    await scan();
  }
}

main().catch(console.error);
