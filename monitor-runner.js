#!/usr/bin/env node
/**
 * Monitor Runner - Unified execution of all defi monitors
 * 
 * Runs:
 * - Momentum Scanner (buy/sell ratios)
 * - Funding Scanner (perp funding rates)
 * - Liquidation Tracker (OI changes)
 * - Status Board (wallet + positions)
 * 
 * Usage:
 *   node monitor-runner.js          # Run all monitors
 *   node monitor-runner.js --quick  # Quick scan (skip slow checks)
 *   node monitor-runner.js --json   # Output JSON for scripting
 */

const { spawn } = require('child_process');
const path = require('path');

const BASE_DIR = __dirname;
const MONITORS = [
  {
    name: 'momentum',
    script: 'momentum-scanner/scanner.js',
    args: ['--once'],
    timeout: 120000,
    skip_quick: false,
  },
  {
    name: 'funding',
    script: 'funding-scanner/scanner.js',
    args: [],
    timeout: 30000,
    skip_quick: false,
  },
  {
    name: 'price-alerts',
    script: 'price-alerts.js',
    args: ['check'],
    timeout: 60000,
    skip_quick: false,
  },
  {
    name: 'status',
    script: 'status-board/index.js',
    args: ['--fast'],
    timeout: 60000,
    skip_quick: true,  // Skip status in quick mode
  },
];

function runMonitor(monitor) {
  return new Promise((resolve) => {
    const scriptPath = path.join(BASE_DIR, monitor.script);
    const start = Date.now();
    let output = '';
    let error = '';

    const proc = spawn('node', [scriptPath, ...monitor.args], {
      cwd: BASE_DIR,
      timeout: monitor.timeout,
    });

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { error += data.toString(); });

    proc.on('close', (code) => {
      resolve({
        name: monitor.name,
        success: code === 0,
        duration: Date.now() - start,
        output: output.trim(),
        error: error.trim(),
      });
    });

    proc.on('error', (err) => {
      resolve({
        name: monitor.name,
        success: false,
        duration: Date.now() - start,
        output: '',
        error: err.message,
      });
    });

    // Timeout fallback
    setTimeout(() => {
      proc.kill('SIGKILL');
    }, monitor.timeout + 1000);
  });
}

function parseSignals(output) {
  const signals = [];
  
  // Parse momentum signals
  const signalMatch = output.match(/found (\d+) signals?/i);
  if (signalMatch && parseInt(signalMatch[1]) > 0) {
    signals.push(`📈 Momentum: ${signalMatch[1]} signal(s) detected`);
  }
  
  // Parse funding extremes
  const fundingMatch = output.match(/extreme.*funding/i);
  if (fundingMatch) {
    signals.push(`💰 Funding: Extreme rates detected`);
  }
  
  // Parse wallet balance
  const walletMatch = output.match(/Total:\s*\$([\d,\.]+)/);
  if (walletMatch) {
    signals.push(`💳 Wallet: $${walletMatch[1]}`);
  }
  
  return signals;
}

async function main() {
  const args = process.argv.slice(2);
  const isQuick = args.includes('--quick');
  const isJson = args.includes('--json');
  
  const timestamp = new Date().toISOString();
  
  if (!isJson) {
    console.log(`\n🦞 Monitor Runner - ${timestamp}`);
    console.log('═'.repeat(50));
  }
  
  const monitorsToRun = MONITORS.filter(m => !isQuick || !m.skip_quick);
  const results = [];
  
  for (const monitor of monitorsToRun) {
    if (!isJson) {
      process.stdout.write(`Running ${monitor.name}... `);
    }
    
    const result = await runMonitor(monitor);
    results.push(result);
    
    if (!isJson) {
      if (result.success) {
        console.log(`✅ (${result.duration}ms)`);
      } else {
        console.log(`❌ (${result.error.slice(0, 50)})`);
      }
    }
  }
  
  // Parse signals from all outputs
  const allOutput = results.map(r => r.output).join('\n');
  const signals = parseSignals(allOutput);
  
  if (isJson) {
    console.log(JSON.stringify({
      timestamp,
      results: results.map(r => ({
        name: r.name,
        success: r.success,
        duration: r.duration,
      })),
      signals,
    }, null, 2));
  } else {
    console.log('─'.repeat(50));
    
    if (signals.length > 0) {
      console.log('\n📋 Summary:');
      signals.forEach(s => console.log(`   ${s}`));
    } else {
      console.log('\n✅ All monitors ran - no signals');
    }
    
    // Show any errors
    const errors = results.filter(r => !r.success);
    if (errors.length > 0) {
      console.log('\n⚠️ Errors:');
      errors.forEach(e => console.log(`   ${e.name}: ${e.error.slice(0, 60)}`));
    }
    
    console.log();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
