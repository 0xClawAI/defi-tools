#!/usr/bin/env node
const { wrapFetchWithPaymentFromConfig } = require('@x402/fetch');
const { ExactEvmScheme } = require('@x402/evm');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config();

async function main() {
  if (!process.env.PRIVATE_KEY) {
    console.error('Set PRIVATE_KEY in .env');
    process.exit(1);
  }
  
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  console.log('Wallet:', account.address);
  
  const x402Fetch = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{
      network: 'eip155:8453', // Base mainnet
      client: new ExactEvmScheme(account)
    }]
  });
  
  console.log('Fetching overnight alpha ($0.01 USDC)...\n');
  
  const res = await x402Fetch('https://capable-grace-production-ab1c.up.railway.app/alpha/overnight', {
    method: 'GET'
  });
  
  if (!res.ok) {
    console.error('Failed:', res.status);
    const text = await res.text();
    console.error(text);
    process.exit(1);
  }
  
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
