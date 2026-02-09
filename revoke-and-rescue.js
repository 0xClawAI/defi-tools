const { createWalletClient, createPublicClient, http, parseAbi, namehash, formatEther, encodeFunctionData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

// ═══════════════════════════════════════════
//    🛡️ EIP-7702 REVOKE & RESCUE v2
// ═══════════════════════════════════════════
//
// Strategy: Use V3 wallet to submit a transaction that:
// 1. Includes V1's revocation authorization
// 2. Calls NFT contracts to transfer TO V3
// But wait - V1 owns the NFTs, so transfers must come FROM V1...
//
// Alternative: Submit from V1 with authorization list
// The authorization is processed FIRST, revoking delegation
// Then the transaction executes (NFT transfer)
// ═══════════════════════════════════════════

const V1_PRIVATE_KEY = '0x187d9f0c6cf881f5bf9bfbca7777b2afb3dc32eaa60c3229c0e14b0e1512f9d3';
const V1_ADDRESS = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3_PRIVATE_KEY = '0xbd587042e0ed7278d5e8c89aa03306970e66d7b7ed6eb91868c80be6b8277ee3';
const V3_ADDRESS = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const AGENT_ID = 22583n;
const ENS_NAME_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const ENS_NAME = '0xclaw.eth';

const RPC = 'https://eth.drpc.org';

const ERC721_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256 tokenId) view returns (address)'
]);

const NAME_WRAPPER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function ownerOf(uint256 id) view returns (address)'
]);

async function checkStatus() {
  const client = createPublicClient({ chain: mainnet, transport: http(RPC) });
  
  console.log('\n📊 STATUS CHECK\n');
  
  // Check delegation
  const code = await client.getCode({ address: V1_ADDRESS });
  if (code && code !== '0x' && code.startsWith('0xef0100')) {
    const delegateAddr = '0x' + code.slice(8, 48);
    console.log('⚠️  V1 DELEGATED TO:', delegateAddr);
  } else {
    console.log('✅ V1 has no delegation');
  }
  
  // Check balances
  const v1Bal = await client.getBalance({ address: V1_ADDRESS });
  const v3Bal = await client.getBalance({ address: V3_ADDRESS });
  console.log(`\nV1 Balance: ${formatEther(v1Bal)} ETH`);
  console.log(`V3 Balance: ${formatEther(v3Bal)} ETH`);
  
  // Check NFT ownership
  try {
    const agentOwner = await client.readContract({
      address: ERC8004_REGISTRY,
      abi: ERC721_ABI,
      functionName: 'ownerOf',
      args: [AGENT_ID]
    });
    console.log(`\nERC-8004 #${AGENT_ID} owner: ${agentOwner}`);
    console.log(`  Ours: ${agentOwner.toLowerCase() === V1_ADDRESS.toLowerCase() ? '✅' : '❌'}`);
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
    console.log(`  Ours: ${ensOwner.toLowerCase() === V1_ADDRESS.toLowerCase() ? '✅' : '❌'}`);
  } catch(e) {
    console.log('ENS check failed:', e.message?.slice(0,100));
  }
}

async function revokeWithAuthList() {
  console.log('\n🛡️ ATTEMPTING REVOCATION WITH AUTH LIST\n');
  
  const v1Account = privateKeyToAccount(V1_PRIVATE_KEY);
  const client = createPublicClient({ chain: mainnet, transport: http(RPC) });
  
  // Get nonce
  const nonce = await client.getTransactionCount({ address: V1_ADDRESS });
  console.log('V1 nonce:', nonce);
  
  // EIP-7702 revocation: sign authorization to zero address
  // This should clear the delegation when included in a tx
  
  const wallet = createWalletClient({
    account: v1Account,
    chain: mainnet,
    transport: http(RPC)
  });
  
  // Try to send a tx with authorization list that revokes
  // The trick: authorizationList is processed BEFORE tx execution
  try {
    console.log('\nSigning authorization to revoke delegation...');
    
    // Per EIP-7702, to revoke we authorize to address(0)
    const authorization = await wallet.signAuthorization({
      contractAddress: '0x0000000000000000000000000000000000000000',
    });
    
    console.log('Authorization signed:', authorization);
    
    // Now we need to submit a transaction that includes this authorization
    // The transaction sender needs ETH for gas
    // We can send FROM V3 with V1's authorization included
    
    return authorization;
  } catch(e) {
    console.log('Error:', e.message);
  }
}

async function rescueWithV3Sponsor() {
  console.log('\n🚀 RESCUE ATTEMPT: V3 SPONSORS GAS\n');
  
  const v1Account = privateKeyToAccount(V1_PRIVATE_KEY);
  const v3Account = privateKeyToAccount(V3_PRIVATE_KEY);
  const client = createPublicClient({ chain: mainnet, transport: http(RPC) });
  
  // Check V3 balance
  const v3Bal = await client.getBalance({ address: V3_ADDRESS });
  console.log(`V3 Balance: ${formatEther(v3Bal)} ETH`);
  
  if (v3Bal < 1000000000000000n) { // < 0.001 ETH
    console.log('❌ V3 needs at least 0.001 ETH for gas');
    console.log(`   Send ETH to: ${V3_ADDRESS}`);
    return;
  }
  
  // Sign V1's revocation authorization
  const v1Wallet = createWalletClient({
    account: v1Account,
    chain: mainnet,
    transport: http(RPC)
  });
  
  console.log('Signing V1 revocation authorization...');
  const authorization = await v1Wallet.signAuthorization({
    contractAddress: '0x0000000000000000000000000000000000000000',
  });
  console.log('Authorization:', authorization);
  
  // Now V3 submits a transaction including V1's authorization
  const v3Wallet = createWalletClient({
    account: v3Account,
    chain: mainnet,
    transport: http(RPC)
  });
  
  console.log('\nSubmitting revocation tx from V3...');
  
  try {
    // Send a simple tx that includes the auth list
    // This should process V1's revocation without V1 needing gas
    const hash = await v3Wallet.sendTransaction({
      to: V3_ADDRESS, // Just send to self
      value: 0n,
      authorizationList: [authorization],
    });
    
    console.log('✅ Revocation TX:', hash);
    console.log(`   https://etherscan.io/tx/${hash}`);
    
    // Wait for confirmation then check status
    console.log('\nWaiting for confirmation...');
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log('Confirmed in block:', receipt.blockNumber);
    
    // Check if delegation is revoked
    await checkStatus();
    
  } catch(e) {
    console.log('❌ Error:', e.message?.slice(0, 500));
  }
}

async function main() {
  const cmd = process.argv[2];
  
  console.log('═══════════════════════════════════════════');
  console.log('   🛡️ EIP-7702 REVOKE & RESCUE');
  console.log('═══════════════════════════════════════════');
  
  switch(cmd) {
    case 'status':
      await checkStatus();
      break;
    case 'revoke':
      await revokeWithAuthList();
      break;
    case 'rescue':
      await rescueWithV3Sponsor();
      break;
    default:
      console.log('\nUsage:');
      console.log('  node revoke-and-rescue.js status  - Check current status');
      console.log('  node revoke-and-rescue.js revoke  - Create revocation auth');
      console.log('  node revoke-and-rescue.js rescue  - V3 sponsors revocation');
  }
}

main().catch(console.error);
