#!/usr/bin/env node
/**
 * x402 Fetch Client - Uses official @x402/fetch for proper payments
 * 
 * This is the production-ready client that can actually make paid requests
 */

const { wrapFetchWithPayment } = require('@x402/fetch');
const { createWalletClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

const DISCOVERY_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/**
 * Create an x402-enabled fetch function
 */
function createX402Fetch(privateKey) {
  const account = privateKeyToAccount(privateKey);
  
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });
  
  // Wrap fetch with x402 payment capabilities
  const x402Fetch = wrapFetchWithPayment(fetch, walletClient);
  
  return {
    fetch: x402Fetch,
    address: account.address,
    walletClient
  };
}

/**
 * Discover and categorize x402 services
 */
async function discoverServices() {
  const res = await fetch(DISCOVERY_URL);
  const data = await res.json();
  
  const services = {
    ai: [],
    defi: [],
    data: [],
    other: []
  };
  
  for (const item of data.items || []) {
    const baseAccept = item.accepts?.find(a => 
      (a.network === 'base' || a.network === 'eip155:8453') &&
      a.asset === BASE_USDC
    );
    
    if (!baseAccept) continue;
    
    const svc = {
      url: item.resource,
      description: baseAccept.description || 'No description',
      maxCostUSDC: baseAccept.maxAmountRequired ? 
        parseFloat(formatUnits(BigInt(baseAccept.maxAmountRequired), 6)) : 0,
      payTo: baseAccept.payTo,
      method: baseAccept.outputSchema?.input?.method || 'GET',
      bodyFields: baseAccept.outputSchema?.output?.input?.bodyFields
    };
    
    // Categorize
    const desc = svc.description.toLowerCase();
    if (desc.includes('sentiment') || desc.includes('ai') || desc.includes('spam') || 
        desc.includes('anonymize') || desc.includes('nlp')) {
      services.ai.push(svc);
    } else if (desc.includes('defi') || desc.includes('yield') || desc.includes('swap') ||
               desc.includes('arbitrage')) {
      services.defi.push(svc);
    } else if (desc.includes('agent') || desc.includes('reputation') || desc.includes('data')) {
      services.data.push(svc);
    } else {
      services.other.push(svc);
    }
  }
  
  return services;
}

/**
 * Example: Call spam detection service
 */
async function detectSpam(x402Fetch, text) {
  const url = 'https://x402.slinkylayer.ai/api/v1/proxy/00e31e91-413d-43f0-833d-56e6b6789aab/content-detect-spam';
  
  const res = await x402Fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text })
  });
  
  return await res.json();
}

/**
 * Example: Get sports arbitrage opportunities
 */
async function getSportsArbitrage(x402Fetch, sport = 'soccer') {
  const url = `https://sportsarbitrageapi-production.up.railway.app/api/opportunities/sport?sport=${sport}`;
  
  const res = await x402Fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  return await res.json();
}

/**
 * Example: Get agent reputation
 */
async function getAgentReputation(x402Fetch, agentId, chainId = 84532) {
  const url = 'https://x402.silverbackdefi.app/api/v1/agent-reputation';
  
  const res = await x402Fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, chainId, includeHistory: true })
  });
  
  return await res.json();
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'list';
  
  if (cmd === 'list') {
    console.log('🔍 Discovering x402 services on Base...\n');
    const services = await discoverServices();
    
    console.log('🤖 AI/NLP Services:');
    services.ai.forEach(s => {
      console.log(`  • ${s.description}`);
      console.log(`    $${s.maxCostUSDC.toFixed(4)} USDC | ${s.method} ${s.url}\n`);
    });
    
    console.log('💹 DeFi Services:');
    services.defi.forEach(s => {
      console.log(`  • ${s.description}`);
      console.log(`    $${s.maxCostUSDC.toFixed(4)} USDC | ${s.method} ${s.url}\n`);
    });
    
    console.log('📊 Data Services:');
    services.data.forEach(s => {
      console.log(`  • ${s.description}`);
      console.log(`    $${s.maxCostUSDC.toFixed(4)} USDC | ${s.method} ${s.url}\n`);
    });
    
    if (services.other.length) {
      console.log('📦 Other:');
      services.other.forEach(s => {
        console.log(`  • ${s.description}`);
        console.log(`    $${s.maxCostUSDC.toFixed(4)} USDC\n`);
      });
    }
    
    const total = services.ai.length + services.defi.length + 
                  services.data.length + services.other.length;
    console.log(`\nTotal: ${total} Base USDC services available`);
    return;
  }
  
  // Commands requiring wallet
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Set PRIVATE_KEY in .env for paid requests');
    process.exit(1);
  }
  
  const { fetch: x402Fetch, address } = createX402Fetch(privateKey);
  console.log(`💰 Wallet: ${address}\n`);
  
  if (cmd === 'spam') {
    const text = args[1] || 'Buy now! Limited offer! Click here!';
    console.log(`Checking spam: "${text}"\n`);
    const result = await detectSpam(x402Fetch, text);
    console.log('Result:', JSON.stringify(result, null, 2));
    return;
  }
  
  if (cmd === 'arbitrage') {
    const sport = args[1] || 'soccer';
    console.log(`Getting ${sport} arbitrage opportunities...\n`);
    const result = await getSportsArbitrage(x402Fetch, sport);
    console.log('Result:', JSON.stringify(result, null, 2));
    return;
  }
  
  if (cmd === 'reputation') {
    const agentId = parseInt(args[1]) || 17;
    console.log(`Getting reputation for agent ${agentId}...\n`);
    const result = await getAgentReputation(x402Fetch, agentId);
    console.log('Result:', JSON.stringify(result, null, 2));
    return;
  }
  
  console.log(`
x402 Fetch Client
================

Commands:
  list              - List all available x402 services
  spam <text>       - Check if text is spam ($0.10 USDC)
  arbitrage [sport] - Get sports betting arbitrage ($0.03 USDC)
  reputation [id]   - Get agent reputation ($0.001 USDC)

Requires PRIVATE_KEY in .env for paid commands.
`);
}

module.exports = { createX402Fetch, discoverServices, detectSpam, getSportsArbitrage, getAgentReputation };

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
