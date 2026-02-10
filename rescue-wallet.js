const { createPublicClient, createWalletClient, http, parseEther, formatEther, parseAbi, namehash } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

// ═══════════════════════════════════════════
//       🚨 WALLET RESCUE SCRIPT v2 🚨
// ═══════════════════════════════════════════

// V1 wallet (compromised but has NFTs)
const V1_PRIVATE_KEY = process.env.V1_KEY;
const V1_ADDRESS = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';

// V3 wallet (safe destination)
const V3_ADDRESS = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

// Contracts on Ethereum mainnet
const ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const AGENT_ID = 22583n;

// ENS contracts
const ENS_NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const ENS_NAME = '0xclaw.eth';

// RPC - multiple for redundancy
const RPC_URLS = [
  'https://eth.drpc.org',
  'https://rpc.mevblocker.io', 
  'https://ethereum.publicnode.com',
  'https://1rpc.io/eth'
];

let currentRpcIndex = 0;

function getClient() {
  return createPublicClient({ 
    chain: mainnet, 
    transport: http(RPC_URLS[currentRpcIndex]) 
  });
}

function getWalletClient() {
  const account = privateKeyToAccount(V1_PRIVATE_KEY);
  return createWalletClient({ 
    account, 
    chain: mainnet, 
    transport: http(RPC_URLS[currentRpcIndex]) 
  });
}

// ABIs
const ERC721_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)'
]);

const NAME_WRAPPER_ABI = parseAbi([
  'function ownerOf(uint256 id) view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)'
]);

async function checkOwnership() {
  const client = getClient();
  console.log('\n🔍 Checking NFT ownership...\n');
  
  // Check ERC-8004
  try {
    const agentOwner = await client.readContract({
      address: ERC8004_REGISTRY,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [AGENT_ID]
    });
    console.log(`ERC-8004 Agent #${AGENT_ID}:`);
    console.log(`  Owner: ${agentOwner}`);
    console.log(`  Ours: ${agentOwner.toLowerCase() === V1_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO (LOST)'}`);
  } catch (e) {
    console.log(`ERC-8004: Error - ${e.message?.slice(0, 100)}`);
  }
  
  // Check ENS via NameWrapper
  try {
    const node = namehash(ENS_NAME);
    const ensOwner = await client.readContract({
      address: ENS_NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'ownerOf',
      args: [BigInt(node)]
    });
    console.log(`\nENS ${ENS_NAME}:`);
    console.log(`  Owner: ${ensOwner}`);
    console.log(`  Ours: ${ensOwner.toLowerCase() === V1_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO (LOST)'}`);
  } catch (e) {
    console.log(`\nENS: Error - ${e.message?.slice(0, 100)}`);
  }
}

async function estimateGas() {
  const client = getClient();
  console.log('\n⛽ Estimating gas costs on Ethereum mainnet...\n');
  
  const gasPrice = await client.getGasPrice();
  const gweiPrice = Number(gasPrice) / 1e9;
  console.log(`Current gas price: ${gweiPrice.toFixed(2)} gwei`);
  
  // Gas estimates (conservative)
  const erc8004Gas = 80000n;  // ERC-721 transfer
  const ensGas = 100000n;     // NameWrapper transfer (more complex)
  const ethTransferGas = 21000n;
  
  // Calculate costs with 1.5x buffer
  const buffer = 15n;
  const erc8004Cost = (gasPrice * erc8004Gas * buffer) / 10n;
  const ensCost = (gasPrice * ensGas * buffer) / 10n;
  const ethCost = (gasPrice * ethTransferGas * buffer) / 10n;
  const totalCost = erc8004Cost + ensCost + ethCost;
  
  // Safe amount with 2x buffer for gas spikes
  const safeTotal = totalCost * 2n;
  const ethPrice = 2700; // Approximate ETH price
  
  console.log(`\nGas estimates (with 1.5x buffer):`);
  console.log(`  ERC-8004 transfer: ${formatEther(erc8004Cost)} ETH`);
  console.log(`  ENS transfer:      ${formatEther(ensCost)} ETH`);
  console.log(`  ETH sweep:         ${formatEther(ethCost)} ETH`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total needed:      ${formatEther(totalCost)} ETH`);
  console.log(`  Safe amount (2x):  ${formatEther(safeTotal)} ETH`);
  console.log(`  In USD (~$${ethPrice}/ETH): $${(Number(formatEther(safeTotal)) * ethPrice).toFixed(2)}`);
  
  return safeTotal;
}

async function checkBalance() {
  const client = getClient();
  const balance = await client.getBalance({ address: V1_ADDRESS });
  console.log(`\n💰 V1 Wallet balance: ${formatEther(balance)} ETH`);
  return balance;
}

async function executeRescue() {
  console.log('\n🚀 ═══════════════════════════════════════════');
  console.log('   EXECUTING RESCUE - GO GO GO!');
  console.log('═══════════════════════════════════════════\n');
  
  const client = getClient();
  const wallet = getWalletClient();
  
  // Get current nonce
  let nonce = await client.getTransactionCount({ address: V1_ADDRESS });
  console.log(`Starting nonce: ${nonce}`);
  
  // Get gas price and add 30% for speed (race the sweeper!)
  const gasPrice = await client.getGasPrice();
  const fastGasPrice = (gasPrice * 130n) / 100n;
  console.log(`Using gas price: ${(Number(fastGasPrice) / 1e9).toFixed(2)} gwei (base + 30%)`);
  
  const txHashes = [];
  
  // 1. Transfer ERC-8004 FIRST (most important)
  try {
    console.log('\n📤 [1/3] Transferring ERC-8004 Agent #22583...');
    const hash1 = await wallet.writeContract({
      address: ERC8004_REGISTRY,
      abi: ERC721_ABI,
      functionName: 'transferFrom',
      args: [V1_ADDRESS, V3_ADDRESS, AGENT_ID],
      gas: 100000n,
      gasPrice: fastGasPrice,
      nonce: nonce++
    });
    console.log(`  ✅ TX: ${hash1}`);
    txHashes.push({ name: 'ERC-8004', hash: hash1 });
  } catch (e) {
    console.log(`  ❌ FAILED: ${e.message?.slice(0, 200)}`);
  }
  
  // 2. Transfer ENS via NameWrapper
  try {
    console.log('\n📤 [2/3] Transferring ENS 0xclaw.eth via NameWrapper...');
    const node = namehash(ENS_NAME);
    const hash2 = await wallet.writeContract({
      address: ENS_NAME_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [V1_ADDRESS, V3_ADDRESS, BigInt(node), 1n, '0x'],
      gas: 150000n,
      gasPrice: fastGasPrice,
      nonce: nonce++
    });
    console.log(`  ✅ TX: ${hash2}`);
    txHashes.push({ name: 'ENS', hash: hash2 });
  } catch (e) {
    console.log(`  ❌ FAILED: ${e.message?.slice(0, 200)}`);
  }
  
  // 3. Sweep remaining ETH
  try {
    console.log('\n📤 [3/3] Sweeping remaining ETH...');
    const balance = await client.getBalance({ address: V1_ADDRESS });
    const gasCost = fastGasPrice * 21000n;
    const toSend = balance - gasCost - (gasCost / 2n); // Extra buffer
    
    if (toSend > 0n) {
      const hash3 = await wallet.sendTransaction({
        to: V3_ADDRESS,
        value: toSend,
        gas: 21000n,
        gasPrice: fastGasPrice,
        nonce: nonce++
      });
      console.log(`  ✅ TX: ${hash3}`);
      console.log(`  Amount: ${formatEther(toSend)} ETH`);
      txHashes.push({ name: 'ETH', hash: hash3 });
    } else {
      console.log('  ⚠️  Insufficient remaining ETH to sweep');
    }
  } catch (e) {
    console.log(`  ❌ FAILED: ${e.message?.slice(0, 200)}`);
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('   RESCUE COMPLETE - CHECK RESULTS');
  console.log('═══════════════════════════════════════════\n');
  
  if (txHashes.length > 0) {
    console.log('📋 Transaction links:');
    txHashes.forEach(tx => {
      console.log(`  ${tx.name}: https://etherscan.io/tx/${tx.hash}`);
    });
  }
  
  return txHashes;
}

async function watchAndRescue(minBalance) {
  console.log('\n👀 ═══════════════════════════════════════════');
  console.log('   WATCHING FOR INCOMING FUNDS');
  console.log('═══════════════════════════════════════════\n');
  console.log(`Target wallet: ${V1_ADDRESS}`);
  console.log(`Min balance needed: ${formatEther(minBalance)} ETH`);
  console.log(`Checking every 1 second...\n`);
  
  let lastBalance = 0n;
  let checks = 0;
  
  const check = async () => {
    checks++;
    try {
      const client = getClient();
      const balance = await client.getBalance({ address: V1_ADDRESS });
      
      if (balance !== lastBalance) {
        console.log(`[${new Date().toISOString()}] Balance: ${formatEther(balance)} ETH`);
        lastBalance = balance;
      }
      
      if (balance >= minBalance) {
        console.log('\n🚨 FUNDS DETECTED! EXECUTING RESCUE NOW!\n');
        await executeRescue();
        return true;
      }
      
      // Status every 30 checks
      if (checks % 30 === 0) {
        process.stdout.write('.');
      }
    } catch (e) {
      // Rotate RPC on error
      currentRpcIndex = (currentRpcIndex + 1) % RPC_URLS.length;
      console.log(`[RPC error, switching to ${RPC_URLS[currentRpcIndex]}]`);
    }
    return false;
  };
  
  // Check immediately
  if (await check()) return;
  
  // Then check every second
  const interval = setInterval(async () => {
    if (await check()) {
      clearInterval(interval);
      process.exit(0);
    }
  }, 1000);
  
  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\nStopping watcher...');
    clearInterval(interval);
    process.exit(0);
  });
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('═══════════════════════════════════════════');
  console.log('       🚨 WALLET RESCUE SCRIPT v2 🚨');
  console.log('═══════════════════════════════════════════');
  console.log(`V1 (compromised): ${V1_ADDRESS}`);
  console.log(`V3 (destination): ${V3_ADDRESS}`);
  
  switch(command) {
    case 'check':
      await checkOwnership();
      await checkBalance();
      break;
    case 'estimate':
      await estimateGas();
      break;
    case 'rescue':
      await executeRescue();
      break;
    case 'watch':
      const minBalance = await estimateGas();
      await watchAndRescue(minBalance);
      break;
    default:
      console.log('\nUsage:');
      console.log('  node rescue-wallet.js check    - Check NFT ownership & balance');
      console.log('  node rescue-wallet.js estimate - Estimate gas costs');
      console.log('  node rescue-wallet.js rescue   - Execute rescue NOW');
      console.log('  node rescue-wallet.js watch    - Watch for funds & auto-rescue');
  }
}

main().catch(console.error);
