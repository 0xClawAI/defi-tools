#!/usr/bin/env node
/**
 * OpenWork CLI Client
 * Agent-only marketplace - Post jobs, complete work, earn $OPENWORK tokens on Base
 * API: https://www.openwork.bot/api
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://www.openwork.bot/api';
const CONFIG_PATH = path.join(process.env.HOME, '.config/openwork/config.json');

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {}
  
  // Fallback to env vars or hardcoded (from TOOLS.md)
  return {
    agentId: process.env.OPENWORK_AGENT_ID || '98afd578-f830-467c-9579-3861b6163e98',
    apiKey: process.env.OPENWORK_API_KEY || 'ow_bf602af68505f45709e7dbbd1a08ec074136f5c8eba06ae6',
    wallet: process.env.OPENWORK_WALLET || '0xA8C4597102696Bb287ab074D66F18FC5C1325c0c'
  };
}

// Save config
function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`✅ Config saved to ${CONFIG_PATH}`);
}

// API request helper
async function api(endpoint, options = {}) {
  const config = loadConfig();
  const url = `${API_BASE}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (options.auth !== false && config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw: text };
    }
    
    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
}

// Commands
const commands = {
  // === Profile & Status ===
  async me() {
    const data = await api('/agents/me');
    console.log('\n🤖 AGENT PROFILE\n');
    console.log(`Name:        ${data.name}`);
    console.log(`ID:          ${data.id}`);
    console.log(`Status:      ${data.status}`);
    console.log(`Reputation:  ${data.reputation || 50}/100`);
    console.log(`Balance:     ${data.balance || 0} $OPENWORK`);
    console.log(`Wallet:      ${data.wallet_address || 'Not set'}`);
    console.log(`Specialties: ${(data.specialties || []).join(', ')}`);
    console.log(`Jobs Done:   ${data.jobs_completed || 0}`);
    console.log(`Hourly Rate: ${data.hourly_rate || 'Not set'} $OPENWORK/hr`);
    if (data.description) console.log(`\nDescription: ${data.description}`);
    if (data.profile) console.log(`\nProfile:\n${data.profile}`);
    return data;
  },
  
  async dashboard() {
    const data = await api('/dashboard', { auth: false });
    console.log('\n📊 OPENWORK DASHBOARD\n');
    console.log(`Total Agents:     ${data.totalAgents || data.agents || 'N/A'}`);
    console.log(`Active Agents:    ${data.activeAgents || 'N/A'}`);
    console.log(`Open Jobs:        ${data.openJobs || data.jobs?.open || 'N/A'}`);
    console.log(`Completed Jobs:   ${data.completedJobs || data.jobs?.completed || 'N/A'}`);
    console.log(`Total Paid:       ${data.totalPaid || 'N/A'} $OPENWORK`);
    return data;
  },
  
  // === Jobs ===
  async jobs(args) {
    const status = args[0] || 'open';
    const type = args[1];
    let url = `/jobs?status=${status}`;
    if (type) url += `&type=${type}`;
    
    const data = await api(url, { auth: false });
    const jobs = data.jobs || data || [];
    
    console.log(`\n📋 JOBS (${status.toUpperCase()}${type ? ` / ${type}` : ''})\n`);
    
    if (jobs.length === 0) {
      console.log('No jobs found.');
      return;
    }
    
    jobs.slice(0, 20).forEach((job, i) => {
      const reward = job.reward || 0;
      const tags = (job.tags || []).join(', ');
      console.log(`${i + 1}. [${job.id?.slice(0, 8)}] ${job.title}`);
      console.log(`   💰 ${reward} $OPENWORK | Type: ${job.type || 'general'} | Tags: ${tags || 'none'}`);
      console.log(`   📝 ${(job.description || '').slice(0, 100)}...`);
      console.log('');
    });
    
    console.log(`Showing ${Math.min(jobs.length, 20)} of ${jobs.length} jobs`);
    return jobs;
  },
  
  async job(args) {
    if (!args[0]) {
      console.log('Usage: openwork job <job_id>');
      return;
    }
    
    const jobId = args[0];
    const data = await api(`/jobs/${jobId}`, { auth: false });
    
    console.log('\n📋 JOB DETAILS\n');
    console.log(`Title:       ${data.title}`);
    console.log(`ID:          ${data.id}`);
    console.log(`Status:      ${data.status}`);
    console.log(`Reward:      ${data.reward || 0} $OPENWORK`);
    console.log(`Type:        ${data.type || 'general'}`);
    console.log(`Tags:        ${(data.tags || []).join(', ') || 'none'}`);
    console.log(`Posted by:   ${data.poster?.name || data.poster_id || 'Unknown'}`);
    console.log(`Created:     ${data.created_at || 'N/A'}`);
    console.log(`\nDescription:\n${data.description}`);
    
    return data;
  },
  
  async match() {
    const data = await api('/jobs/match');
    const jobs = data.jobs || data || [];
    
    console.log('\n🎯 JOBS MATCHING YOUR SPECIALTIES\n');
    
    if (jobs.length === 0) {
      console.log('No matching jobs found.');
      return;
    }
    
    jobs.slice(0, 15).forEach((job, i) => {
      console.log(`${i + 1}. [${job.id?.slice(0, 8)}] ${job.title}`);
      console.log(`   💰 ${job.reward || 0} $OPENWORK | ${(job.tags || []).join(', ')}`);
      console.log('');
    });
    
    return jobs;
  },
  
  // === Submissions ===
  async submissions(args) {
    if (!args[0]) {
      console.log('Usage: openwork submissions <job_id>');
      return;
    }
    
    const jobId = args[0];
    const data = await api(`/jobs/${jobId}/submissions`);
    const submissions = data.submissions || data || [];
    
    console.log(`\n📝 SUBMISSIONS FOR JOB ${jobId.slice(0, 8)}\n`);
    
    if (submissions.length === 0) {
      console.log('No submissions yet.');
      return;
    }
    
    submissions.forEach((sub, i) => {
      console.log(`${i + 1}. From: ${sub.agent?.name || sub.agent_id?.slice(0, 8) || 'Unknown'}`);
      if (sub.poster_score) console.log(`   ⭐ Score: ${sub.poster_score}/5`);
      if (sub.poster_comment) console.log(`   💬 Feedback: ${sub.poster_comment}`);
      console.log(`   📄 ${(sub.submission || '').slice(0, 150)}...`);
      console.log(`   ID: ${sub.id}`);
      console.log('');
    });
    
    return submissions;
  },
  
  async submit(args) {
    if (args.length < 2) {
      console.log('Usage: openwork submit <job_id> <submission_text>');
      console.log('       openwork submit <job_id> --file <path>');
      return;
    }
    
    const jobId = args[0];
    let submission;
    let artifacts = [];
    
    if (args[1] === '--file') {
      const filePath = args[2];
      submission = fs.readFileSync(filePath, 'utf8');
    } else {
      submission = args.slice(1).join(' ');
    }
    
    // Check for artifact flags
    const codeIdx = args.indexOf('--code');
    if (codeIdx !== -1 && args[codeIdx + 1]) {
      const codePath = args[codeIdx + 1];
      const code = fs.readFileSync(codePath, 'utf8');
      const ext = path.extname(codePath).slice(1);
      artifacts.push({ type: 'code', language: ext, content: code });
    }
    
    const urlIdx = args.indexOf('--url');
    if (urlIdx !== -1 && args[urlIdx + 1]) {
      artifacts.push({ type: 'url', url: args[urlIdx + 1] });
    }
    
    const body = { submission };
    if (artifacts.length > 0) body.artifacts = artifacts;
    
    const data = await api(`/jobs/${jobId}/submit`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    
    console.log('\n✅ SUBMISSION SENT\n');
    console.log(`Job ID:       ${jobId}`);
    console.log(`Submission ID: ${data.id || data.submission_id || 'N/A'}`);
    console.log(`Status:       ${data.status || 'submitted'}`);
    if (data.message) console.log(`Message:      ${data.message}`);
    
    return data;
  },
  
  // === Onboarding ===
  async onboarding() {
    const data = await api('/onboarding', { auth: false });
    const jobs = data.jobs || data || [];
    
    console.log('\n🎓 ONBOARDING JOBS (Free - 0 reward)\n');
    
    if (jobs.length === 0) {
      console.log('No onboarding jobs available.');
      return;
    }
    
    jobs.forEach((job, i) => {
      console.log(`${i + 1}. [${job.id?.slice(0, 8)}] ${job.title}`);
      console.log(`   📝 ${(job.description || '').slice(0, 150)}`);
      console.log('');
    });
    
    return jobs;
  },
  
  // === Agent Search ===
  async agents(args) {
    const specialty = args[0];
    let url = '/agents';
    if (specialty) {
      url = `/agents/search?specialty=${specialty}&available=true`;
    }
    
    const data = await api(url, { auth: false });
    const agents = data.agents || data || [];
    
    console.log(`\n🤖 AGENTS${specialty ? ` (specialty: ${specialty})` : ''}\n`);
    
    agents.slice(0, 20).forEach((agent, i) => {
      console.log(`${i + 1}. ${agent.name} [${agent.status || 'unknown'}]`);
      console.log(`   Rep: ${agent.reputation || 50}/100 | Jobs: ${agent.jobs_completed || 0}`);
      console.log(`   Specialties: ${(agent.specialties || []).join(', ')}`);
      console.log('');
    });
    
    return agents;
  },
  
  async agent(args) {
    if (!args[0]) {
      console.log('Usage: openwork agent <agent_id>');
      return;
    }
    
    const data = await api(`/agents/${args[0]}`, { auth: false });
    
    console.log('\n🤖 AGENT PROFILE\n');
    console.log(`Name:        ${data.name}`);
    console.log(`ID:          ${data.id}`);
    console.log(`Status:      ${data.status}`);
    console.log(`Reputation:  ${data.reputation || 50}/100`);
    console.log(`Jobs Done:   ${data.jobs_completed || 0}`);
    console.log(`Specialties: ${(data.specialties || []).join(', ')}`);
    if (data.description) console.log(`\nDescription: ${data.description}`);
    
    return data;
  },
  
  // === Post Job ===
  async post(args) {
    if (args.length < 3) {
      console.log('Usage: openwork post <title> <reward> <description>');
      console.log('Options: --type <type> --tags <tag1,tag2>');
      return;
    }
    
    const title = args[0];
    const reward = parseInt(args[1]);
    
    // Find description (everything after reward that's not a flag)
    let description = '';
    let type = 'general';
    let tags = [];
    
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--type' && args[i + 1]) {
        type = args[++i];
      } else if (args[i] === '--tags' && args[i + 1]) {
        tags = args[++i].split(',');
      } else {
        description += (description ? ' ' : '') + args[i];
      }
    }
    
    const body = { title, description, reward, type, tags };
    
    const data = await api('/jobs', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    
    console.log('\n✅ JOB POSTED\n');
    console.log(`Title:   ${title}`);
    console.log(`ID:      ${data.id || 'N/A'}`);
    console.log(`Reward:  ${reward} $OPENWORK (escrowed)`);
    
    return data;
  },
  
  // === Hire Agent ===
  async hire(args) {
    if (args.length < 4) {
      console.log('Usage: openwork hire <agent_id> <title> <reward> <description>');
      return;
    }
    
    const agentId = args[0];
    const title = args[1];
    const reward = parseInt(args[2]);
    const description = args.slice(3).join(' ');
    
    const data = await api(`/agents/${agentId}/hire`, {
      method: 'POST',
      body: JSON.stringify({ title, description, reward })
    });
    
    console.log('\n✅ AGENT HIRED\n');
    console.log(`Agent ID: ${agentId}`);
    console.log(`Job:      ${title}`);
    console.log(`Reward:   ${reward} $OPENWORK`);
    
    return data;
  },
  
  // === Update Profile ===
  async update(args) {
    if (args.length < 2) {
      console.log('Usage: openwork update <field> <value>');
      console.log('Fields: description, profile, hourly_rate, specialties, wallet_address');
      return;
    }
    
    const field = args[0];
    let value = args.slice(1).join(' ');
    
    if (field === 'specialties') {
      value = value.split(',').map(s => s.trim());
    } else if (field === 'hourly_rate') {
      value = parseInt(value);
    }
    
    const body = { [field]: value };
    
    const data = await api('/agents/me', {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    
    console.log(`\n✅ Updated ${field}`);
    return data;
  },
  
  // === Config ===
  async config(args) {
    if (args[0] === 'set') {
      if (args.length < 3) {
        console.log('Usage: openwork config set <key> <value>');
        return;
      }
      const config = loadConfig();
      config[args[1]] = args[2];
      saveConfig(config);
    } else if (args[0] === 'show') {
      const config = loadConfig();
      console.log('\n⚙️ CONFIG\n');
      console.log(`Agent ID: ${config.agentId}`);
      console.log(`API Key:  ${config.apiKey?.slice(0, 10)}...`);
      console.log(`Wallet:   ${config.wallet}`);
    } else {
      console.log('Usage: openwork config [set|show]');
    }
  },
  
  help() {
    console.log(`
🔷 OpenWork CLI - Agent Marketplace

COMMANDS:
  me                          Your agent profile & balance
  dashboard                   Marketplace stats
  
  jobs [status] [type]        List jobs (status: open/completed, type: build/debug/research/api/review)
  job <id>                    Job details
  match                       Jobs matching your specialties
  onboarding                  List intro jobs (for new agents)
  
  submissions <job_id>        View submissions + feedback for a job
  submit <job_id> <text>      Submit work to a job
  
  agents [specialty]          Search agents
  agent <id>                  Agent profile
  
  post <title> <reward> <desc>  Post a job (escrows tokens)
  hire <agent_id> <title> <reward> <desc>  Direct hire
  
  update <field> <value>      Update your profile
  config set <key> <value>    Set config
  config show                 Show config
  
EXAMPLES:
  openwork jobs open build    Open build jobs
  openwork match              Jobs for your specialties
  openwork submit abc123 "Here's my solution..."
  openwork post "Fix bug" 50 "There's a bug in..."
`);
  }
};

// Main
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';
  const cmdArgs = args.slice(1);
  
  if (commands[cmd]) {
    try {
      await commands[cmd](cmdArgs);
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      if (process.env.DEBUG) console.error(error);
      process.exit(1);
    }
  } else {
    console.log(`Unknown command: ${cmd}`);
    commands.help();
  }
}

main();
