#!/usr/bin/env node
/**
 * Base Chain Swap Executor
 * Uses 0x API for best execution
 */

const { createWalletClient, createPublicClient, http, parseUnits, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');
require('dotenv').config({ path: __dirname + '/x402-client/.env' });

const TOKENS = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WETH: '0x4200000000000000000000000000000000000006',
};

async function getQuote(sellToken, buyToken, sellAmount) {
  const params = new URLSearchParams({
    sellToken,
    buyToken,
    sellAmount: sellAmount.toString(),
    chainId: '8453',
  });
  
  const url = `https://api.0x.org/swap/v1/quote?${params}`;
  console.log('Getting quote from 0x...');
  
  const res = await fetch(url, {
    headers: { '0x-api-key': process.env.ZRX_API_KEY || '' }
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Quote failed: ${error}`);
  }
  
  return res.json();
}

async function executeSwap(quote) {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: http()
  });
  
  console.log('Executing swap...');
  console.log('From:', account.address);
  console.log('To:', quote.to);
  console.log('Value:', quote.value);
  
  const hash = await wallet.sendTransaction({
    to: quote.to,
    data: quote.data,
    value: BigInt(quote.value || 0),
    gas: BigInt(quote.gas),
  });
  
  console.log('TX Hash:', hash);
  return hash;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log(`
Base Swap
=========
Usage: node base-swap.js <sell_token> <buy_token> <amount>

Examples:
  node base-swap.js USDC ETH 0.01    # Swap 0.01 USDC for ETH
  node base-swap.js ETH USDC 0.001   # Swap 0.001 ETH for USDC

Tokens: ETH, USDC, WETH, or contract address
`);
    return;
  }
  
  const [sellSymbol, buySymbol, amount] = args;
  
  const sellToken = TOKENS[sellSymbol.toUpperCase()] || sellSymbol;
  const buyToken = TOKENS[buySymbol.toUpperCase()] || buySymbol;
  
  // Determine decimals
  const decimals = sellSymbol.toUpperCase() === 'USDC' ? 6 : 18;
  const sellAmount = parseUnits(amount, decimals);
  
  console.log(`Swapping ${amount} ${sellSymbol} → ${buySymbol}`);
  
  try {
    const quote = await getQuote(sellToken, buyToken, sellAmount);
    console.log('Quote received:');
    console.log('- Buy amount:', quote.buyAmount);
    console.log('- Gas estimate:', quote.estimatedGas);
    console.log('- Price:', quote.price);
    
    // For now just show quote, don't execute without confirmation
    console.log('\nTo execute, uncomment executeSwap() in code');
    // const hash = await executeSwap(quote);
    // console.log('Success! TX:', hash);
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
