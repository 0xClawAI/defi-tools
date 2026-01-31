#!/usr/bin/env node
/**
 * Base Chain Trade Executor
 * Real execution via Kyberswap (no API key needed)
 */

const { createWalletClient, createPublicClient, http, parseUnits, formatUnits, encodeFunctionData } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x187d9f0c6cf881f5bf9bfbca7777b2afb3dc32eaa60c3229c0e14b0e1512f9d3';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function getKyberRoute(tokenIn, tokenOut, amountIn) {
  const url = `https://aggregator-api.kyberswap.com/base/api/v1/routes?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Route failed: ${res.status}`);
  return res.json();
}

async function buildKyberTx(routeData, sender, slippage = 50) { // 0.5% slippage
  const url = 'https://aggregator-api.kyberswap.com/base/api/v1/route/build';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      routeSummary: routeData.data.routeSummary,
      sender,
      recipient: sender,
      slippageTolerance: slippage,
    })
  });
  if (!res.ok) throw new Error(`Build failed: ${res.status}`);
  return res.json();
}

async function approveToken(wallet, token, spender, amount) {
  const data = encodeFunctionData({
    abi: [{ name: 'approve', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }],
    functionName: 'approve',
    args: [spender, amount]
  });
  
  const hash = await wallet.sendTransaction({ to: token, data });
  console.log('Approval TX:', hash);
  return hash;
}

async function executeTrade(tokenOut, amountUsd) {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const wallet = createWalletClient({ account, chain: base, transport: http() });
  const public_ = createPublicClient({ chain: base, transport: http() });
  
  const amountIn = parseUnits(amountUsd.toString(), 6); // USDC has 6 decimals
  
  console.log(`\n💰 Executing: $${amountUsd} USDC → ${tokenOut}`);
  console.log(`Wallet: ${account.address}`);
  
  // Get route
  console.log('Getting route...');
  const route = await getKyberRoute(USDC, tokenOut, amountIn.toString());
  
  const summary = route.data.routeSummary;
  console.log(`Route found: ${summary.amountOutUsd} USD output`);
  console.log(`Gas: ~$${parseFloat(summary.gasUsd).toFixed(4)}`);
  
  // Build TX
  console.log('Building transaction...');
  const tx = await buildKyberTx(route, account.address);
  
  // Check allowance and approve if needed
  // ... (approval logic here)
  
  // Execute
  console.log('Executing swap...');
  const hash = await wallet.sendTransaction({
    to: tx.data.routerAddress,
    data: tx.data.data,
    value: BigInt(0),
  });
  
  console.log('✅ TX Hash:', hash);
  return hash;
}

// CLI
const [,, cmd, token, amount] = process.argv;

if (cmd === 'buy' && token && amount) {
  executeTrade(token, parseFloat(amount)).catch(e => console.error('Error:', e.message));
} else {
  console.log(`
Base Executor
=============
Usage: node base-executor.js buy <token_address> <amount_usd>

Example:
  node base-executor.js buy 0xB695559b26BB2c9703ef1935c37AeaE9526bab07 1

This will swap $1 USDC for MOLTBOOK.
`);
}
