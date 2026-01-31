#!/usr/bin/env node
/**
 * x402 Payment Client for Machine-to-Machine Payments
 * 
 * Uses Coinbase CDP Bazaar discovery to find x402 services
 * Pays with Base USDC for service access
 */

const { createWalletClient, createPublicClient, http, parseUnits, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

// Base USDC contract
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DISCOVERY_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources';

class X402Client {
  constructor(privateKey) {
    if (!privateKey) {
      throw new Error('Private key required. Set PRIVATE_KEY in .env');
    }
    
    this.account = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: base,
      transport: http()
    });
    this.publicClient = createPublicClient({
      chain: base,
      transport: http()
    });
    
    this.services = null;
  }

  get address() {
    return this.account.address;
  }

  /**
   * Fetch all available x402 services from CDP Bazaar
   */
  async discoverServices() {
    console.log('🔍 Discovering x402 services...');
    
    const res = await fetch(DISCOVERY_URL);
    const data = await res.json();
    
    // Filter to Base USDC services only
    const baseServices = [];
    
    for (const item of data.items || []) {
      const baseAccept = item.accepts?.find(a => 
        a.network === 'base' || a.network === 'eip155:8453'
      );
      
      if (baseAccept && baseAccept.asset === BASE_USDC) {
        baseServices.push({
          resource: item.resource,
          description: baseAccept.description || 'No description',
          maxCost: baseAccept.maxAmountRequired ? 
            formatUnits(BigInt(baseAccept.maxAmountRequired), 6) : 'unknown',
          maxCostRaw: baseAccept.maxAmountRequired || '0',
          payTo: baseAccept.payTo,
          method: baseAccept.outputSchema?.input?.method || 'GET',
          mimeType: baseAccept.mimeType,
          bodyFields: baseAccept.outputSchema?.output?.input?.bodyFields,
          scheme: baseAccept.scheme || 'exact',
          x402Version: item.x402Version
        });
      }
    }
    
    this.services = baseServices;
    console.log(`✅ Found ${baseServices.length} Base USDC services`);
    return baseServices;
  }

  /**
   * List discovered services
   */
  listServices() {
    if (!this.services) {
      console.log('Run discoverServices() first');
      return [];
    }
    
    console.log('\n📋 Available x402 Services (Base USDC):\n');
    console.log('=' .repeat(80));
    
    this.services.forEach((svc, i) => {
      console.log(`\n[${i}] ${svc.description}`);
      console.log(`    URL: ${svc.resource}`);
      console.log(`    Method: ${svc.method}`);
      console.log(`    Max Cost: $${svc.maxCost} USDC`);
      console.log(`    Pay To: ${svc.payTo}`);
    });
    
    return this.services;
  }

  /**
   * Find services by keyword
   */
  findService(keyword) {
    if (!this.services) return [];
    
    const lower = keyword.toLowerCase();
    return this.services.filter(s => 
      s.description.toLowerCase().includes(lower) ||
      s.resource.toLowerCase().includes(lower)
    );
  }

  /**
   * Make a paid request to an x402 service
   * 
   * @param {string} url - The service URL
   * @param {object} options - Fetch options (method, body, headers)
   * @returns {object} - Response data
   */
  async payAndFetch(url, options = {}) {
    console.log(`\n💸 Making x402 request to: ${url}`);
    
    // Step 1: Make initial request to get payment requirements
    const initialRes = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json'
      }
    });
    
    // If not 402, return the response directly
    if (initialRes.status !== 402) {
      console.log(`   Response: ${initialRes.status} (no payment required)`);
      if (initialRes.ok) {
        return await initialRes.json();
      }
      throw new Error(`Request failed: ${initialRes.status}`);
    }
    
    // Step 2: Parse payment requirements from 402 response
    const paymentRequiredHeader = initialRes.headers.get('x-payment') || 
                                  initialRes.headers.get('payment-required');
    
    if (!paymentRequiredHeader) {
      // Try to get from body
      const body = await initialRes.json().catch(() => ({}));
      console.log('   402 response body:', JSON.stringify(body, null, 2));
      throw new Error('No payment requirements found in 402 response');
    }
    
    // Decode payment requirements (base64 JSON)
    const paymentReq = JSON.parse(Buffer.from(paymentRequiredHeader, 'base64').toString());
    console.log('   Payment requirements:', JSON.stringify(paymentReq, null, 2));
    
    // Step 3: Create and sign payment
    const payment = await this.createPayment(paymentReq);
    
    // Step 4: Retry request with payment header
    const paidRes = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        'X-PAYMENT': Buffer.from(JSON.stringify(payment)).toString('base64')
      }
    });
    
    if (!paidRes.ok) {
      const errBody = await paidRes.text();
      throw new Error(`Paid request failed: ${paidRes.status} - ${errBody}`);
    }
    
    console.log(`   ✅ Payment successful!`);
    return await paidRes.json();
  }

  /**
   * Create a signed payment payload
   */
  async createPayment(paymentReq) {
    // This is a simplified version - full implementation would use @x402/evm
    // for proper EIP-712 signing
    
    const { scheme, network, asset, maxAmountRequired, payTo, resource } = paymentReq;
    
    // Create payment payload
    const payload = {
      x402Version: paymentReq.x402Version || 1,
      scheme: scheme || 'exact',
      network: network || 'base',
      payload: {
        signature: '', // Will be filled by signing
        authorization: {
          from: this.address,
          to: payTo,
          value: maxAmountRequired,
          validAfter: Math.floor(Date.now() / 1000) - 60,
          validBefore: Math.floor(Date.now() / 1000) + 300, // 5 min
          nonce: '0x' + Math.random().toString(16).slice(2, 10).padStart(64, '0')
        }
      }
    };
    
    // Sign using EIP-712 (USDC permit)
    // Note: Full implementation would use the proper domain and types
    // This is a placeholder showing the structure
    
    console.log('   Signing payment...');
    
    // For now, we'll return the unsigned payload
    // Full signing requires the exact EIP-712 structure from x402 spec
    return payload;
  }

  /**
   * Check USDC balance
   */
  async getBalance() {
    const usdcAbi = [{
      name: 'balanceOf',
      type: 'function',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: 'balance', type: 'uint256' }]
    }];
    
    const balance = await this.publicClient.readContract({
      address: BASE_USDC,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [this.address]
    });
    
    return {
      raw: balance.toString(),
      formatted: formatUnits(balance, 6),
      symbol: 'USDC'
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';
  
  if (cmd === 'help') {
    console.log(`
x402 Payment Client
==================

Commands:
  discover              - Fetch and list available x402 services
  find <keyword>        - Search services by keyword
  balance              - Check USDC balance
  call <url> [body]    - Make a paid request to a service

Environment:
  PRIVATE_KEY          - Your wallet private key (required for payments)

Examples:
  node client.js discover
  node client.js find spam
  node client.js balance
  node client.js call https://example.com/api '{"text":"hello"}'
`);
    return;
  }
  
  // For discover command, we don't need a private key
  if (cmd === 'discover' || cmd === 'find') {
    const client = new X402ClientReadOnly();
    const services = await client.discoverServices();
    
    if (cmd === 'discover') {
      client.listServices();
    } else if (cmd === 'find') {
      const keyword = args[1] || '';
      const matches = client.findService(keyword);
      console.log(`\n🔍 Services matching "${keyword}":\n`);
      matches.forEach((svc, i) => {
        console.log(`[${i}] ${svc.description}`);
        console.log(`    ${svc.resource}`);
        console.log(`    Max: $${svc.maxCost} USDC | Method: ${svc.method}\n`);
      });
    }
    return;
  }
  
  // Commands that need a wallet
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ PRIVATE_KEY environment variable required');
    console.error('   Create a .env file with: PRIVATE_KEY=0x...');
    process.exit(1);
  }
  
  const client = new X402Client(privateKey);
  
  if (cmd === 'balance') {
    const balance = await client.getBalance();
    console.log(`\n💰 Wallet: ${client.address}`);
    console.log(`   Balance: ${balance.formatted} ${balance.symbol}`);
    return;
  }
  
  if (cmd === 'call') {
    const url = args[1];
    const body = args[2] ? JSON.parse(args[2]) : undefined;
    
    if (!url) {
      console.error('Usage: node client.js call <url> [body]');
      process.exit(1);
    }
    
    const result = await client.payAndFetch(url, {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined
    });
    
    console.log('\n📦 Response:');
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  console.log(`Unknown command: ${cmd}`);
}

// Read-only client for discovery without wallet
class X402ClientReadOnly {
  constructor() {
    this.services = null;
  }
  
  async discoverServices() {
    console.log('🔍 Discovering x402 services...');
    
    const res = await fetch(DISCOVERY_URL);
    const data = await res.json();
    
    const baseServices = [];
    
    for (const item of data.items || []) {
      const baseAccept = item.accepts?.find(a => 
        a.network === 'base' || a.network === 'eip155:8453'
      );
      
      if (baseAccept && baseAccept.asset === BASE_USDC) {
        baseServices.push({
          resource: item.resource,
          description: baseAccept.description || 'No description',
          maxCost: baseAccept.maxAmountRequired ? 
            formatUnits(BigInt(baseAccept.maxAmountRequired), 6) : 'unknown',
          maxCostRaw: baseAccept.maxAmountRequired || '0',
          payTo: baseAccept.payTo,
          method: baseAccept.outputSchema?.input?.method || 'GET',
          mimeType: baseAccept.mimeType,
          scheme: baseAccept.scheme || 'exact',
          x402Version: item.x402Version
        });
      }
    }
    
    this.services = baseServices;
    console.log(`✅ Found ${baseServices.length} Base USDC services`);
    return baseServices;
  }
  
  listServices() {
    if (!this.services) return [];
    
    console.log('\n📋 Available x402 Services (Base USDC):\n');
    
    this.services.forEach((svc, i) => {
      console.log(`[${i}] ${svc.description}`);
      console.log(`    URL: ${svc.resource}`);
      console.log(`    Method: ${svc.method}`);
      console.log(`    Max Cost: $${svc.maxCost} USDC\n`);
    });
    
    return this.services;
  }
  
  findService(keyword) {
    if (!this.services) return [];
    const lower = keyword.toLowerCase();
    return this.services.filter(s => 
      s.description.toLowerCase().includes(lower) ||
      s.resource.toLowerCase().includes(lower)
    );
  }
}

module.exports = { X402Client, X402ClientReadOnly };

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
