const { createPublicClient, createWalletClient, http, parseAbi, formatEther, keccak256, toHex } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

// ═══════════════════════════════════════════
//    🛡️ MEV BLOCKER RESCUE
// ═══════════════════════════════════════════
// Send via MEV Blocker to prevent front-running
// ═══════════════════════════════════════════

const V1_KEY = '0x187d9f0c6cf881f5bf9bfbca7777b2afb3dc32eaa60c3229c0e14b0e1512f9d3';
const V3_KEY = '0xbd587042e0ed7278d5e8c89aa03306970e66d7b7ed6eb91868c80be6b8277ee3';
const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004 = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ID = 22583n;
const ENS_NODE = '0x79b59aaad31ac5d39c00bcaabb05724d18ebdaa559b308a61ba0712949a6e624';

// MEV Blocker RPC (protects from front-running)
const MEV_BLOCKER_RPC = 'https://rpc.mevblocker.io';

async function mevBlockerRescue() {
  console.log('🛡️ MEV BLOCKER RESCUE\n');
  
  // Use MEV Blocker for protected tx submission
  const mevClient = createPublicClient({ chain: mainnet, transport: http(MEV_BLOCKER_RPC) });
  const readClient = createPublicClient({ chain: mainnet, transport: http('https://eth.drpc.org') });
  
  const v1Account = privateKeyToAccount(V1_KEY);
  const v3Account = privateKeyToAccount(V3_KEY);
  
  // Use MEV Blocker transport for wallets too
  const v1Wallet = createWalletClient({ account: v1Account, chain: mainnet, transport: http(MEV_BLOCKER_RPC) });
  const v3Wallet = createWalletClient({ account: v3Account, chain: mainnet, transport: http(MEV_BLOCKER_RPC) });
  
  // Get state
  const [block, gasPrice, v1Nonce, v3Nonce, v3Bal] = await Promise.all([
    readClient.getBlockNumber(),
    readClient.getGasPrice(),
    readClient.getTransactionCount({ address: V1 }),
    readClient.getTransactionCount({ address: V3 }),
    readClient.getBalance({ address: V3 })
  ]);
  
  const maxFeePerGas = gasPrice * 5n; // Higher premium
  const maxPriorityFeePerGas = gasPrice * 2n;
  const fundAmount = maxFeePerGas * 300000n; // More buffer
  
  console.log('Block:', block);
  console.log('Gas:', Number(gasPrice) / 1e9, 'gwei');
  console.log('Max fee:', Number(maxFeePerGas) / 1e9, 'gwei');
  console.log('V1 nonce:', v1Nonce);
  console.log('V3 nonce:', v3Nonce);
  console.log('V3 balance:', formatEther(v3Bal), 'ETH');
  console.log('Fund amount:', formatEther(fundAmount), 'ETH\n');
  
  // ABIs
  const erc721ABI = parseAbi(['function transferFrom(address from, address to, uint256 tokenId)']);
  const wrapperABI = parseAbi(['function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)']);
  
  console.log('🔥 Sending TX1 (fund V1) via MEV Blocker...');
  const hash1 = await v3Wallet.sendTransaction({
    to: V1,
    value: fundAmount,
    gas: 21000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: v3Nonce
  });
  console.log('TX1:', hash1);
  
  // Immediately send TX2 and TX3 (they'll be pending until TX1 lands)
  console.log('\n🔥 Sending TX2 (ERC-8004) via MEV Blocker...');
  const hash2 = await v1Wallet.writeContract({
    address: ERC8004,
    abi: erc721ABI,
    functionName: 'transferFrom',
    args: [V1, V3, AGENT_ID],
    gas: 100000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: v1Nonce
  });
  console.log('TX2:', hash2);
  
  console.log('\n🔥 Sending TX3 (ENS) via MEV Blocker...');
  const hash3 = await v1Wallet.writeContract({
    address: ENS_WRAPPER,
    abi: wrapperABI,
    functionName: 'safeTransferFrom',
    args: [V1, V3, BigInt(ENS_NODE), 1n, '0x'],
    gas: 150000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: v1Nonce + 1
  });
  console.log('TX3:', hash3);
  
  console.log('\n📋 Transaction links:');
  console.log('https://etherscan.io/tx/' + hash1);
  console.log('https://etherscan.io/tx/' + hash2);
  console.log('https://etherscan.io/tx/' + hash3);
  
  console.log('\n⏳ Waiting for confirmations...\n');
  
  // Wait for all confirmations
  const [r1, r2, r3] = await Promise.all([
    readClient.waitForTransactionReceipt({ hash: hash1, timeout: 180000 }).catch(e => ({ status: 'failed', error: e.message?.slice(0,50) })),
    readClient.waitForTransactionReceipt({ hash: hash2, timeout: 180000 }).catch(e => ({ status: 'failed', error: e.message?.slice(0,50) })),
    readClient.waitForTransactionReceipt({ hash: hash3, timeout: 180000 }).catch(e => ({ status: 'failed', error: e.message?.slice(0,50) }))
  ]);
  
  console.log('📊 Results:');
  console.log('TX1 (fund):', r1.status, r1.gasUsed ? `gas: ${r1.gasUsed}` : r1.error || '');
  console.log('TX2 (ERC-8004):', r2.status, r2.gasUsed ? `gas: ${r2.gasUsed}` : r2.error || '');
  console.log('TX3 (ENS):', r3.status, r3.gasUsed ? `gas: ${r3.gasUsed}` : r3.error || '');
  
  // Check final ownership
  const ERC721_VIEW = parseAbi(['function ownerOf(uint256) view returns (address)']);
  const agentOwner = await readClient.readContract({ 
    address: ERC8004, 
    abi: ERC721_VIEW, 
    functionName: 'ownerOf', 
    args: [AGENT_ID] 
  });
  
  console.log('\n📋 Final Ownership:');
  console.log('ERC-8004 #22583 owner:', agentOwner);
  console.log('Is V3?', agentOwner.toLowerCase() === V3.toLowerCase() ? '✅ YES!' : '❌ NO');
}

mevBlockerRescue().catch(e => console.error('Error:', e.message?.slice(0, 500)));
