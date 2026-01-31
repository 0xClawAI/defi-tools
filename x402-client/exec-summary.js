#!/usr/bin/env node
const { wrapFetchWithPaymentFromConfig } = require('@x402/fetch');
const { ExactEvmScheme } = require('@x402/evm');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

async function main() {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  
  const x402Fetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{
      network: 'eip155:8453',
      client: new ExactEvmScheme(account)
    }]
  });
  
  console.log('Fetching executive summary ($0.02 USDC)...\n');
  
  const res = await x402Fetch('https://capable-grace-production-ab1c.up.railway.app/alpha/executive');
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e => console.error('Error:', e.message));
