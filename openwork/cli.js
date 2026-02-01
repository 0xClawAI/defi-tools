#!/usr/bin/env node

/**
 * OpenWork CLI - Agent marketplace interactions
 * Usage:
 *   node cli.js status          - Check agent profile and balance
 *   node cli.js onboarding      - List onboarding jobs (if not activated)
 *   node cli.js jobs [--type X] - List open jobs
 *   node cli.js job <id>        - View job details + submissions
 *   node cli.js submit <id>     - Submit work to a job
 *   node cli.js mine            - List my submissions
 *   node cli.js review          - Check jobs I posted that need review
 *   node cli.js search <query>  - Search for agents
 */

const fs = require('fs');
const path = require('path');

// Config
const API_BASE = 'https://www.openwork.bot/api';
const API_KEY = 'ow_bf602af68505f45709e7dbbd1a08ec074136f5c8eba06ae6';
const AGENT_ID = '98afd578-f830-467c-9579-3861b6163e98';

// State file for tracking
const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastCheck: null, submittedJobIds: [], postedJobIds: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error(`Network error: ${error.message}`);
    }
    throw error;
  }
}

// Commands

async function status() {
  console.log('📊 OpenWork Agent Status\n');
  
  const profile = await api('/agents/me');
  
  console.log(`Name: ${profile.name}`);
  console.log(`Status: ${profile.status}`);
  console.log(`Reputation: ${profile.reputation || 0}`);
  console.log(`Jobs Completed: ${profile.jobs_completed || 0}`);
  console.log(`Balance: ${profile.balance || 0} $OPENWORK`);
  console.log(`Specialties: ${(profile.specialties || []).join(', ')}`);
  console.log(`Wallet: ${profile.wallet_address || 'Not set'}`);
  
  if (profile.status === 'onboarding') {
    console.log('\n⚠️  Status is "onboarding" - complete an intro job to activate!');
    console.log('Run: node cli.js onboarding');
  }
  
  return profile;
}

async function listOnboarding() {
  console.log('📋 Onboarding Jobs\n');
  
  const jobs = await api('/onboarding');
  
  if (!jobs || jobs.length === 0) {
    console.log('No onboarding jobs available');
    return;
  }
  
  for (const job of jobs) {
    console.log(`[${job.id}]`);
    console.log(`  Title: ${job.title}`);
    console.log(`  Description: ${job.description?.slice(0, 200)}...`);
    console.log('');
  }
  
  console.log(`\nTo submit: node cli.js submit <job-id> "<your work>"`);
}

async function listJobs(options = {}) {
  console.log('📋 Open Jobs\n');
  
  let endpoint = '/jobs?status=open';
  if (options.type) endpoint += `&type=${options.type}`;
  if (options.tag) endpoint += `&tag=${options.tag}`;
  
  const response = await api(endpoint);
  const jobs = response.jobs || response;
  
  if (!jobs || jobs.length === 0) {
    console.log('No open jobs found');
    return;
  }
  
  for (const job of jobs) {
    const reward = job.reward || 0;
    const typeTag = job.type ? `[${job.type}]` : '';
    console.log(`💼 ${job.title} ${typeTag}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Reward: ${reward} $OPENWORK`);
    console.log(`   Tags: ${(job.tags || []).join(', ') || 'none'}`);
    console.log(`   Submissions: ${job.submission_count || 0}`);
    console.log('');
  }
  
  console.log(`Found ${jobs.length} open jobs`);
}

async function viewJob(jobId) {
  console.log(`📋 Job Details: ${jobId}\n`);
  
  const job = await api(`/jobs/${jobId}`);
  
  console.log(`Title: ${job.title}`);
  console.log(`Type: ${job.type || 'general'}`);
  console.log(`Status: ${job.status}`);
  console.log(`Reward: ${job.reward || 0} $OPENWORK`);
  console.log(`Tags: ${(job.tags || []).join(', ') || 'none'}`);
  console.log(`\nDescription:\n${job.description}`);
  
  if (job.requirements?.length) {
    console.log('\nRequirements:');
    job.requirements.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  }
  
  if (job.checklist?.length) {
    console.log('\nChecklist:');
    job.checklist.forEach((c, i) => console.log(`  ☐ ${c}`));
  }
  
  // Try to get submissions
  try {
    const subs = await api(`/jobs/${jobId}/submissions`);
    const submissions = subs.submissions || subs;
    if (submissions?.length) {
      console.log(`\nSubmissions (${submissions.length}):`);
      for (const sub of submissions) {
        const score = sub.poster_score ? `⭐${sub.poster_score}` : '';
        console.log(`  - ${sub.agent_name || sub.agent_id} ${score}`);
        if (sub.poster_comment) {
          console.log(`    Feedback: ${sub.poster_comment}`);
        }
      }
    }
  } catch (e) {
    // Submissions might not be visible
  }
}

async function submitWork(jobId, submission) {
  if (!submission) {
    console.log('Usage: node cli.js submit <job-id> "<submission text>"');
    console.log('\nOr pipe submission from stdin:');
    console.log('  cat submission.md | node cli.js submit <job-id>');
    return;
  }
  
  console.log(`📤 Submitting to job ${jobId}...\n`);
  
  const result = await api(`/jobs/${jobId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ submission })
  });
  
  console.log('✅ Submission sent!');
  console.log(`Submission ID: ${result.id || result.submission_id}`);
  
  // Update state
  const state = loadState();
  if (!state.submittedJobIds.includes(jobId)) {
    state.submittedJobIds.push(jobId);
  }
  state.lastCheck = new Date().toISOString();
  saveState(state);
  
  return result;
}

async function mySubmissions() {
  console.log('📋 My Submissions\n');
  
  const response = await api('/agents/me/submissions');
  const submissions = response.submissions || response;
  
  if (!submissions || submissions.length === 0) {
    console.log('No submissions yet');
    return;
  }
  
  for (const sub of submissions) {
    const status = sub.selected ? '✅ WINNER' : sub.poster_score ? `⭐${sub.poster_score}` : '⏳';
    console.log(`${status} ${sub.job_title || sub.job_id}`);
    console.log(`   Submitted: ${new Date(sub.created_at).toLocaleDateString()}`);
    if (sub.poster_comment) {
      console.log(`   Feedback: ${sub.poster_comment}`);
    }
    if (sub.reward_earned) {
      console.log(`   Earned: ${sub.reward_earned} $OPENWORK`);
    }
    console.log('');
  }
}

async function checkReview() {
  console.log('📋 Jobs Needing Review\n');
  
  const response = await api('/jobs/mine?needs_review=true');
  const jobs = response.jobs || response;
  
  if (!jobs || jobs.length === 0 || response.total === 0) {
    console.log('✅ No jobs need review');
    return;
  }
  
  console.log(`⚠️  ${jobs.length} job(s) need your review!\n`);
  
  for (const job of jobs) {
    console.log(`💼 ${job.title}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Submissions: ${job.submission_count || 0}`);
    console.log('');
  }
  
  console.log('Run: node cli.js job <id> to view submissions');
}

async function searchAgents(query) {
  console.log(`🔍 Searching agents: "${query}"\n`);
  
  const response = await api(`/agents/search?q=${encodeURIComponent(query)}&available=true`);
  const agents = response.agents || response;
  
  if (!agents || agents.length === 0) {
    console.log('No agents found');
    return;
  }
  
  for (const agent of agents) {
    console.log(`🤖 ${agent.name}`);
    console.log(`   ID: ${agent.id}`);
    console.log(`   Reputation: ${agent.reputation || 0}`);
    console.log(`   Specialties: ${(agent.specialties || []).join(', ')}`);
    console.log(`   Rate: ${agent.hourly_rate || 'N/A'} $OPENWORK/hr`);
    console.log('');
  }
}

async function heartbeat() {
  console.log('💓 OpenWork Heartbeat Check\n');
  
  // 1. Check for jobs needing review first
  try {
    const review = await api('/jobs/mine?needs_review=true');
    if (review.total > 0) {
      console.log(`⚠️  ${review.total} job(s) need review - handle first!`);
    }
  } catch (e) {
    // May not have posted any jobs
  }
  
  // 2. Check profile status
  const profile = await api('/agents/me');
  console.log(`Status: ${profile.status} | Rep: ${profile.reputation || 0} | Balance: ${profile.balance || 0}`);
  
  // 3. If onboarding, show intro jobs
  if (profile.status === 'onboarding') {
    console.log('\n📋 Complete an onboarding job to activate:');
    await listOnboarding();
    return;
  }
  
  // 4. Show open jobs matching our specialties
  console.log('\n📋 Jobs matching your skills:');
  const ourSkills = profile.specialties || ['coding', 'research'];
  const jobs = await api('/jobs?status=open');
  const jobList = jobs.jobs || jobs;
  
  const matching = jobList.filter(j => 
    (j.tags || []).some(t => ourSkills.includes(t.toLowerCase())) ||
    ourSkills.includes((j.type || '').toLowerCase())
  );
  
  if (matching.length > 0) {
    for (const job of matching.slice(0, 5)) {
      console.log(`  💼 ${job.title} - ${job.reward || 0} $OPENWORK`);
    }
  } else {
    console.log('  No matching jobs right now');
  }
  
  // Update state
  const state = loadState();
  state.lastCheck = new Date().toISOString();
  saveState(state);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  
  try {
    switch (command) {
      case 'status':
        await status();
        break;
        
      case 'onboarding':
        await listOnboarding();
        break;
        
      case 'jobs':
        const jobOpts = {};
        if (args.includes('--type')) {
          jobOpts.type = args[args.indexOf('--type') + 1];
        }
        if (args.includes('--tag')) {
          jobOpts.tag = args[args.indexOf('--tag') + 1];
        }
        await listJobs(jobOpts);
        break;
        
      case 'job':
        if (!args[1]) {
          console.log('Usage: node cli.js job <job-id>');
          process.exit(1);
        }
        await viewJob(args[1]);
        break;
        
      case 'submit':
        if (!args[1]) {
          console.log('Usage: node cli.js submit <job-id> "<submission>"');
          process.exit(1);
        }
        // If no submission in args, read from stdin
        let submission = args.slice(2).join(' ');
        if (!submission && !process.stdin.isTTY) {
          const chunks = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk);
          }
          submission = Buffer.concat(chunks).toString();
        }
        await submitWork(args[1], submission);
        break;
        
      case 'mine':
        await mySubmissions();
        break;
        
      case 'review':
        await checkReview();
        break;
        
      case 'search':
        await searchAgents(args.slice(1).join(' ') || 'coding');
        break;
        
      case 'heartbeat':
        await heartbeat();
        break;
        
      default:
        console.log(`Unknown command: ${command}`);
        console.log('\nCommands:');
        console.log('  status      - Check agent profile');
        console.log('  onboarding  - List intro jobs');
        console.log('  jobs        - List open jobs');
        console.log('  job <id>    - View job details');
        console.log('  submit      - Submit work');
        console.log('  mine        - My submissions');
        console.log('  review      - Jobs I posted needing review');
        console.log('  search      - Search agents');
        console.log('  heartbeat   - Full status check');
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
