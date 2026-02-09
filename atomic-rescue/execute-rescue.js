const { 
  createPublicClient, 
  createWalletClient, 
  http, 
  parseAbi,
  formatEther,
  namehash,
  encodeFunctionData
} = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet, sepolia } = require('viem/chains');

// ═══════════════════════════════════════════
//    🚨 ATOMIC RESCUE EXECUTION
// ═══════════════════════════════════════════
// 
// This uses EIP-7702 to atomically:
// 1. Delegate V1 to our rescue contract
// 2. Execute the rescue (transfer NFTs to V3)
// All in ONE TRANSACTION - no race condition!
// ═══════════════════════════════════════════

// Wallet keys (already exposed, this is the rescue operation)
const V1_PRIVATE_KEY = process.env.V1_KEY || '0x187d9f0c6cf881f5bf9bfbca7777b2afb3dc32eaa60c3229c0e14b0e1512f9d3';
const V3_PRIVATE_KEY = process.env.V3_KEY || '0xbd587042e0ed7278d5e8c89aa03306970e66d7b7ed6eb91868c80be6b8277ee3';

const V1_ADDRESS = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3_ADDRESS = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

// Contract addresses
const ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ID = 22583n;
const ENS_NAME = '0xclaw.eth';

// RPC endpoints
const RPC_MAINNET = 'https://eth.drpc.org';
const RPC_SEPOLIA = 'https://rpc.sepolia.org';

// Rescue contract ABI (just the function we need)
const RESCUE_ABI = parseAbi([
  'function execute() external',
  'function canRescue() external view returns (bool hasAgent, bool hasENS)'
]);

// NFT ABIs for checking
const ERC721_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function transferFrom(address from, address to, uint256 tokenId)'
]);

const NAME_WRAPPER_ABI = parseAbi([
  'function ownerOf(uint256 id) view returns (address)'
]);

async function checkStatus(network = 'mainnet') {
  const chain = network === 'mainnet' ? mainnet : sepolia;
  const rpc = network === 'mainnet' ? RPC_MAINNET : RPC_SEPOLIA;
  const client = createPublicClient({ chain, transport: http(rpc) });
  
  console.log(`\n📊 STATUS CHECK (${network})\n`);
  
  // Check V1 delegation
  const code = await client.getCode({ address: V1_ADDRESS });
  if (code && code !== '0x' && code.startsWith('0xef0100')) {
    const delegateAddr = '0x' + code.slice(8);
    console.log('⚠️  V1 DELEGATED TO:', delegateAddr);
  } else if (code && code !== '0x') {
    console.log('V1 has code:', code.slice(0, 50) + '...');
  } else {
    console.log('✅ V1 has no delegation');
  }
  
  // Check balances
  const v1Bal = await client.getBalance({ address: V1_ADDRESS });
  const v3Bal = await client.getBalance({ address: V3_ADDRESS });
  console.log(`\nV1 Balance: ${formatEther(v1Bal)} ETH`);
  console.log(`V3 Balance: ${formatEther(v3Bal)} ETH`);
  
  // Check NFT ownership (mainnet only)
  if (network === 'mainnet') {
    try {
      const agentOwner = await client.readContract({
        address: ERC8004_REGISTRY,
        abi: ERC721_ABI,
        functionName: 'ownerOf',
        args: [AGENT_ID]
      });
      console.log(`\nERC-8004 #${AGENT_ID} owner: ${agentOwner}`);
      console.log(`  V1 owns it: ${agentOwner.toLowerCase() === V1_ADDRESS.toLowerCase() ? '✅' : '❌'}`);
    } catch(e) {
      console.log('ERC-8004 check failed:', e.message?.slice(0,100));
    }
    
    try {
      const node = namehash(ENS_NAME);
      const ensOwner = await client.readContract({
        address: ENS_NAME_WRAPPER,
        abi: NAME_WRAPPER_ABI,
        functionName: 'ownerOf',
        args: [BigInt(node)]
      });
      console.log(`\nENS ${ENS_NAME} owner: ${ensOwner}`);
      console.log(`  V1 owns it: ${ensOwner.toLowerCase() === V1_ADDRESS.toLowerCase() ? '✅' : '❌'}`);
    } catch(e) {
      console.log('ENS check failed:', e.message?.slice(0,100));
    }
  }
  
  return { v1Bal, v3Bal };
}

async function executeAtomicRescue(rescueContractAddress, dryRun = true) {
  console.log('\n🚀 ═══════════════════════════════════════════');
  console.log('   ATOMIC RESCUE EXECUTION');
  console.log('═══════════════════════════════════════════\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No transaction will be sent\n');
  }
  
  const v1Account = privateKeyToAccount(V1_PRIVATE_KEY);
  const v3Account = privateKeyToAccount(V3_PRIVATE_KEY);
  
  const client = createPublicClient({ 
    chain: mainnet, 
    transport: http(RPC_MAINNET) 
  });
  
  // Check balances first
  const v3Bal = await client.getBalance({ address: V3_ADDRESS });
  console.log(`V3 Balance: ${formatEther(v3Bal)} ETH`);
  
  const minRequired = 2000000000000000n; // 0.002 ETH minimum
  if (v3Bal < minRequired) {
    console.log(`\n❌ Need at least ${formatEther(minRequired)} ETH in V3 for gas`);
    console.log(`   Current: ${formatEther(v3Bal)} ETH`);
    console.log(`   Shortfall: ${formatEther(minRequired - v3Bal)} ETH`);
    return;
  }
  
  // Step 1: V1 signs authorization to delegate to rescue contract
  console.log('Step 1: Signing V1 authorization...');
  console.log(`  Delegating to: ${rescueContractAddress}`);
  
  const v1Wallet = createWalletClient({
    account: v1Account,
    chain: mainnet,
    transport: http(RPC_MAINNET)
  });
  
  const authorization = await v1Wallet.signAuthorization({
    contractAddress: rescueContractAddress,
  });
  
  console.log('  ✅ Authorization signed');
  console.log(`     nonce: ${authorization.nonce}`);
  console.log(`     address: ${authorization.contractAddress}`);
  
  // Step 2: V3 submits transaction with V1's authorization + execute call
  console.log('\nStep 2: Preparing rescue transaction...');
  
  const v3Wallet = createWalletClient({
    account: v3Account,
    chain: mainnet,
    transport: http(RPC_MAINNET)
  });
  
  // Encode the execute() call
  const executeData = encodeFunctionData({
    abi: RESCUE_ABI,
    functionName: 'execute'
  });
  
  // Get gas price
  const gasPrice = await client.getGasPrice();
  const fastGasPrice = (gasPrice * 150n) / 100n; // 50% premium for speed
  console.log(`  Gas price: ${Number(gasPrice) / 1e9} gwei`);
  console.log(`  Using: ${Number(fastGasPrice) / 1e9} gwei (1.5x premium)`);
  
  // Estimate gas
  let gasEstimate;
  try {
    gasEstimate = await client.estimateGas({
      account: v3Account,
      to: V1_ADDRESS,
      data: executeData,
      authorizationList: [authorization],
    });
    console.log(`  Estimated gas: ${gasEstimate}`);
  } catch(e) {
    console.log(`  Gas estimation failed: ${e.message?.slice(0, 200)}`);
    gasEstimate = 300000n; // Fallback
    console.log(`  Using fallback: ${gasEstimate}`);
  }
  
  const totalCost = fastGasPrice * gasEstimate;
  console.log(`  Estimated cost: ${formatEther(totalCost)} ETH`);
  
  if (dryRun) {
    console.log('\n📋 TRANSACTION PREVIEW:');
    console.log(`   from: ${V3_ADDRESS}`);
    console.log(`   to: ${V1_ADDRESS}`);
    console.log(`   data: ${executeData}`);
    console.log(`   authorizationList: [V1 -> ${rescueContractAddress}]`);
    console.log(`   gas: ${gasEstimate}`);
    console.log(`   gasPrice: ${fastGasPrice}`);
    console.log('\n⚠️  Run with --execute to send transaction');
    return;
  }
  
  // Execute for real
  console.log('\n🔥 EXECUTING RESCUE...\n');
  
  try {
    const hash = await v3Wallet.sendTransaction({
      to: V1_ADDRESS,
      data: executeData,
      gas: gasEstimate + 50000n, // Extra buffer
      gasPrice: fastGasPrice,
      authorizationList: [authorization],
    });
    
    console.log('✅ Transaction sent!');
    console.log(`   Hash: ${hash}`);
    console.log(`   https://etherscan.io/tx/${hash}`);
    
    console.log('\n⏳ Waiting for confirmation...');
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120000 });
    
    console.log(`\n✅ Confirmed in block ${receipt.blockNumber}`);
    console.log(`   Status: ${receipt.status === 'success' ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);
    
    // Check final status
    console.log('\n📊 POST-RESCUE STATUS:');
    await checkStatus('mainnet');
    
    return receipt;
  } catch(e) {
    console.log('\n❌ TRANSACTION FAILED');
    console.log(`   Error: ${e.message}`);
    throw e;
  }
}

async function deployRescueContract(network = 'sepolia') {
  console.log(`\n🏗️  Deploying AtomicRescue to ${network}...\n`);
  console.log('⚠️  Contract deployment requires a Solidity compiler.');
  console.log('   Use Foundry, Hardhat, or Remix to deploy AtomicRescue.sol');
  console.log(`   Constructor arg: ${V3_ADDRESS} (rescue destination)`);
  console.log('\nAfter deployment, run:');
  console.log('   node execute-rescue.js rescue <CONTRACT_ADDRESS> --execute');
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('═══════════════════════════════════════════');
  console.log('   🚨 ATOMIC RESCUE v1.0');
  console.log('═══════════════════════════════════════════');
  console.log(`V1 (compromised): ${V1_ADDRESS}`);
  console.log(`V3 (destination): ${V3_ADDRESS}`);
  
  switch(command) {
    case 'status':
      await checkStatus(args[1] || 'mainnet');
      break;
    
    case 'deploy':
      await deployRescueContract(args[1] || 'sepolia');
      break;
    
    case 'rescue':
      if (!args[1]) {
        console.log('\n❌ Missing rescue contract address');
        console.log('   Usage: node execute-rescue.js rescue <CONTRACT_ADDRESS> [--execute]');
        return;
      }
      const dryRun = !args.includes('--execute');
      await executeAtomicRescue(args[1], dryRun);
      break;
    
    default:
      console.log('\nUsage:');
      console.log('  node execute-rescue.js status [mainnet|sepolia]');
      console.log('  node execute-rescue.js deploy [network]');
      console.log('  node execute-rescue.js rescue <CONTRACT_ADDRESS> [--execute]');
      console.log('\nWorkflow:');
      console.log('  1. Deploy AtomicRescue.sol with V3 as destination');
      console.log('  2. Run: node execute-rescue.js rescue <ADDRESS>');
      console.log('  3. Verify the dry run looks correct');
      console.log('  4. Run: node execute-rescue.js rescue <ADDRESS> --execute');
  }
}

main().catch(console.error);
