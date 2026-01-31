#!/usr/bin/env node
/**
 * Moltbook Claims Monitor
 * Watches for high-profile Moltbook registrations
 * 
 * Data sources (in order of speed):
 * 1. Moltbook introductions submolt (agents post here after claiming)
 * 2. Twitter search for claim pattern
 * 3. Moltbook search API
 */

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const MOLTBOOK_KEY = process.env.MOLTBOOK_API_KEY || 'moltbook_sk_Kdhy1tp7Yl7CXtwI585TPXNIeIQYqi1w';

// Known high-value accounts to watch for
const WATCHLIST = [
  'elonmusk', 'sama', 'karpathy', 'vitalikbuterin', 'brian_armstrong',
  'cabormarket', 'jessepollak', 'balabormarket', 'cdixon', 'naval',
  'chamath', 'paulg', 'benedictevans', 'pmarca'
];

async function checkIntroductions() {
  try {
    const res = await fetch(`${MOLTBOOK_API}/posts?submolt=introductions&sort=new&limit=20`, {
      headers: { 'Authorization': `Bearer ${MOLTBOOK_KEY}` }
    });
    const data = await res.json();
    
    if (!data.success) return [];
    
    const newAgents = data.posts.map(p => ({
      name: p.author?.name,
      owner: p.author?.owner?.x_handle,
      karma: p.author?.karma || 0,
      postedAt: p.created_at,
      title: p.title
    }));
    
    return newAgents;
  } catch (e) {
    console.error('Failed to fetch introductions:', e.message);
    return [];
  }
}

async function checkForHighProfile(agents) {
  const alerts = [];
  
  for (const agent of agents) {
    const ownerLower = (agent.owner || '').toLowerCase();
    
    // Check against watchlist
    if (WATCHLIST.some(w => ownerLower.includes(w))) {
      alerts.push({
        type: 'WATCHLIST_MATCH',
        agent: agent.name,
        owner: agent.owner,
        message: `🚨 HIGH PROFILE: ${agent.owner} registered agent "${agent.name}"`
      });
    }
  }
  
  return alerts;
}

async function main() {
  console.log(`🔍 Moltbook Claims Monitor - ${new Date().toISOString()}`);
  
  const agents = await checkIntroductions();
  console.log(`Found ${agents.length} recent introductions`);
  
  if (agents.length > 0) {
    console.log('\nRecent agents:');
    agents.slice(0, 5).forEach(a => {
      console.log(`  - ${a.name} (@${a.owner || 'unclaimed'})`);
    });
  }
  
  const alerts = await checkForHighProfile(agents);
  if (alerts.length > 0) {
    console.log('\n🚨 ALERTS:');
    alerts.forEach(a => console.log(a.message));
  }
  
  console.log('\n✅ Check complete');
}

main().catch(console.error);
