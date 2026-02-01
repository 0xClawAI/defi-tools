#!/usr/bin/env node
/**
 * DeFi Tools Healthcheck - Verify all components are working
 * 
 * Usage:
 *   node healthcheck.js       # Full check
 *   node healthcheck.js --fix # Fix common issues
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CHECKS = [];

function check(name, fn) {
  CHECKS.push({ name, fn });
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

// Check: Wallet config exists
check('Wallet Config', () => {
  const wallet = loadJson(path.join(process.env.HOME, '.config/0xclaw/wallet-v2.json'));
  if (!wallet?.address) return { ok: false, msg: 'wallet-v2.json missing or invalid' };
  return { ok: true, msg: `${wallet.address.slice(0, 10)}...` };
});

// Check: Alert Hub data directory
check('Alert Hub', () => {
  const dir = path.join(__dirname, 'alert-hub', 'data');
  if (!fs.existsSync(dir)) return { ok: false, msg: 'data/ dir missing', fix: () => fs.mkdirSync(dir, { recursive: true }) };
  const histFile = path.join(dir, 'history.jsonl');
  if (fs.existsSync(histFile)) {
    const lines = fs.readFileSync(histFile, 'utf-8').split('\n').filter(Boolean).length;
    return { ok: true, msg: `${lines} alerts logged` };
  }
  return { ok: true, msg: 'ready (no history yet)' };
});

// Check: Moltbook watcher
check('Moltbook Watcher', () => {
  const seenFile = path.join(__dirname, 'moltbook-watcher', 'data', 'seen-agents.json');
  if (!fs.existsSync(seenFile)) return { ok: false, msg: 'not initialized - run scan' };
  const seen = loadJson(seenFile);
  return { ok: true, msg: `tracking ${seen?.agents?.length || 0} agents` };
});

// Check: Trade Journal
check('Trade Journal', () => {
  const dir = path.join(__dirname, 'trade-journal', 'data');
  if (!fs.existsSync(dir)) return { ok: false, msg: 'data/ dir missing', fix: () => fs.mkdirSync(dir, { recursive: true }) };
  const journalFile = path.join(dir, 'journal.json');
  if (fs.existsSync(journalFile)) {
    const journal = loadJson(journalFile);
    return { ok: true, msg: `${journal?.trades?.length || 0} trades recorded` };
  }
  return { ok: true, msg: 'ready (no trades yet)' };
});

// Check: Momentum Scanner
check('Momentum Scanner', () => {
  const scannerPath = path.join(__dirname, 'momentum-scanner', 'scanner.js');
  if (!fs.existsSync(scannerPath)) return { ok: false, msg: 'scanner.js missing' };
  
  // Check if it can run
  try {
    const output = execSync('node momentum-scanner/scanner.js --help 2>&1', { 
      cwd: __dirname, 
      encoding: 'utf-8',
      timeout: 5000
    });
    return { ok: true, msg: 'ready' };
  } catch (e) {
    return { ok: false, msg: 'failed to run' };
  }
});

// Check: Funding Scanner data
check('Funding Scanner', () => {
  const dataDir = path.join(__dirname, 'funding-scanner', 'data');
  if (!fs.existsSync(dataDir)) return { ok: false, msg: 'data/ dir missing', fix: () => fs.mkdirSync(dataDir, { recursive: true }) };
  
  const latest = path.join(dataDir, 'latest-rates.json');
  if (fs.existsSync(latest)) {
    const rates = loadJson(latest);
    return { ok: true, msg: `${rates?.length || 0} rates cached` };
  }
  return { ok: true, msg: 'ready (no data yet)' };
});

// Check: Status Board
check('Status Board', () => {
  const statusPath = path.join(__dirname, 'status-board', 'index.js');
  if (!fs.existsSync(statusPath)) return { ok: false, msg: 'index.js missing' };
  return { ok: true, msg: 'ready' };
});

// Check: PoI CLI
check('Proof of Intelligence', () => {
  const poiPath = path.join(process.env.HOME, 'projects', 'proof-of-intelligence', 'client', 'cli.js');
  if (!fs.existsSync(poiPath)) return { ok: false, msg: 'CLI not found' };
  
  try {
    const output = execSync('node cli.js status 2>&1', {
      cwd: path.dirname(poiPath),
      encoding: 'utf-8',
      timeout: 15000
    });
    
    const match = output.match(/Days Until Expiry:\s*(\d+\.?\d*)/);
    if (match) {
      const days = parseFloat(match[1]);
      if (days <= 2) return { ok: false, msg: `⚠️ Expires in ${days.toFixed(1)} days!` };
      return { ok: true, msg: `expires in ${days.toFixed(1)} days` };
    }
    return { ok: true, msg: 'connected' };
  } catch (e) {
    return { ok: false, msg: 'failed to check status' };
  }
});

// Check: Price Alerts
check('Price Alerts', () => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) return { ok: false, msg: 'data/ dir missing', fix: () => fs.mkdirSync(dataDir, { recursive: true }) };
  
  const alertsFile = path.join(dataDir, 'price-alerts.json');
  if (fs.existsSync(alertsFile)) {
    const data = loadJson(alertsFile);
    return { ok: true, msg: `${data?.alerts?.length || 0} active alerts` };
  }
  return { ok: true, msg: 'ready (no alerts)' };
});

// Check: Git status
check('Git Repo', () => {
  try {
    const status = execSync('git status --porcelain 2>&1', { 
      cwd: __dirname, 
      encoding: 'utf-8',
      timeout: 5000
    });
    const lines = status.trim().split('\n').filter(Boolean);
    if (lines.length > 0) {
      return { ok: true, msg: `${lines.length} uncommitted change(s)` };
    }
    return { ok: true, msg: 'clean' };
  } catch {
    return { ok: false, msg: 'not a git repo' };
  }
});

// Check: Node modules
check('Dependencies', () => {
  const nodeModules = path.join(__dirname, 'node_modules');
  if (!fs.existsSync(nodeModules)) return { ok: false, msg: 'node_modules missing', fix: 'npm install' };
  
  // Check for ethers
  const ethers = path.join(nodeModules, 'ethers');
  if (!fs.existsSync(ethers)) return { ok: false, msg: 'ethers missing', fix: 'npm install ethers' };
  
  return { ok: true, msg: 'installed' };
});

async function runChecks(fix = false) {
  console.log('\n🔧 DeFi Tools Healthcheck\n');
  console.log('─'.repeat(50));
  
  let passed = 0;
  let failed = 0;
  let fixed = 0;
  
  for (const { name, fn } of CHECKS) {
    const result = await fn();
    
    if (result.ok) {
      console.log(`✅ ${name.padEnd(20)} ${result.msg}`);
      passed++;
    } else {
      console.log(`❌ ${name.padEnd(20)} ${result.msg}`);
      failed++;
      
      if (fix && result.fix) {
        try {
          if (typeof result.fix === 'function') {
            result.fix();
          } else {
            execSync(result.fix, { cwd: __dirname, encoding: 'utf-8' });
          }
          console.log(`   🔧 Fixed!`);
          fixed++;
        } catch (e) {
          console.log(`   ⚠️ Auto-fix failed: ${e.message}`);
        }
      }
    }
  }
  
  console.log('─'.repeat(50));
  console.log(`\n${passed} passed, ${failed} failed${fixed > 0 ? `, ${fixed} fixed` : ''}`);
  
  if (failed > 0) {
    console.log('\nRun with --fix to attempt auto-fixes');
    return 1;
  }
  
  console.log('\n✅ All systems operational!');
  return 0;
}

const fix = process.argv.includes('--fix');
runChecks(fix)
  .then(code => process.exit(code))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
