const { createPublicClient, createWalletClient, http, parseAbi, namehash, formatEther, encodeFunctionData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

// Flashbots bundle approach: fund V1 + transfer NFTs in one atomic block

const V1_KEY = process.env.V1_KEY;
const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3_KEY = process.env.V3_KEY;
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004 = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ID = 22583n;

const ERC721_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId)'
]);

const NAME_WRAPPER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)'
]);

async function bundleTransfer() {
  const client = createPublicClient({ chain: mainnet, transport: http('https://eth.drpc.org') });
  const v1Account = privateKeyToAccount(V1_KEY);
  const v3Account = privateKeyToAccount(V3_KEY);
  
  const v1Wallet = createWalletClient({ account: v1Account, chain: mainnet, transport: http('https://eth.drpc.org') });
  const v3Wallet = createWalletClient({ account: v3Account, chain: mainnet, transport: http('https://eth.drpc.org') });
  
  console.log('🚀 Flashbots-style atomic transfer\n');
  
  // Get current state
  const v3Bal = await client.getBalance({ address: V3 });
  const gasPrice = await client.getGasPrice();
  const fastGas = (gasPrice * 200n) / 100n; // 2x for speed
  
  console.log('V3 Balance:', formatEther(v3Bal), 'ETH');
  console.log('Gas price:', Number(gasPrice) / 1e9, 'gwei');
  console.log('Using:', Number(fastGas) / 1e9, 'gwei (2x)\n');
  
  // Get nonces
  const v1Nonce = await client.getTransactionCount({ address: V1 });
  const v3Nonce = await client.getTransactionCount({ address: V3 });
  console.log('V1 nonce:', v1Nonce);
  console.log('V3 nonce:', v3Nonce);
  
  // First, V1 needs to revoke the delegation to be able to send transactions
  // Or we can include a revocation in the first V1 tx
  
  // Check if V1 is delegated
  const code = await client.getCode({ address: V1 });
  const isDelegated = code && code.startsWith('0xef0100');
  console.log('V1 is delegated:', isDelegated);
  
  if (isDelegated) {
    console.log('\nNeed to revoke delegation first...');
    
    // Sign revocation
    const revocation = await v1Wallet.signAuthorization({
      contractAddress: '0x0000000000000000000000000000000000000000'
    });
    
    // Calculate gas needed for transfers
    const erc8004Gas = 80000n;
    const ensGas = 120000n;
    const fundAmount = fastGas * (erc8004Gas + ensGas + 21000n); // gas for both transfers + buffer
    
    console.log('Funding amount:', formatEther(fundAmount), 'ETH');
    
    // Strategy: 
    // 1. V3 sends tx with V1's revocation (this clears V1's delegation)
    //    AND sends ETH to V1 in the same tx
    // 2. V1 immediately sends ERC-8004 transfer
    // 3. V1 immediately sends ENS transfer
    
    // Actually, EIP-7702 revocation doesn't require V1 to have gas
    // V3 can include V1's revocation authorization in V3's transaction
    
    console.log('\n📋 Bundle Plan:');
    console.log('  TX1 (V3): Send ETH to V1 + include V1 revocation');
    console.log('  TX2 (V1): Transfer ERC-8004 to V3');
    console.log('  TX3 (V1): Transfer ENS to V3');
    console.log('\n⚠️ Without Flashbots relay, these are separate txs');
    console.log('⚠️ Sweeper could steal between TX1 and TX2');
    
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    await new Promise(resolve => {
      rl.question('\nProceed? (yes/no): ', async (answer) => {
        rl.close();
        if (answer !== 'yes') {
          console.log('Aborted');
          process.exit(0);
        }
        resolve();
      });
    });
    
    // TX1: V3 sends ETH to V1 with V1's revocation included
    console.log('\n[TX1] Funding V1 + revoking delegation...');
    const hash1 = await v3Wallet.sendTransaction({
      to: V1,
      value: fundAmount,
      gas: 50000n,
      maxFeePerGas: fastGas,
      maxPriorityFeePerGas: fastGas / 2n,
      authorizationList: [revocation],
      nonce: v3Nonce
    });
    console.log('TX1:', hash1);
    
    // Don't wait for confirmation - send TX2 immediately
    console.log('\n[TX2] Transferring ERC-8004...');
    const hash2 = await v1Wallet.writeContract({
      address: ERC8004,
      abi: ERC721_ABI,
      functionName: 'transferFrom',
      args: [V1, V3, AGENT_ID],
      gas: erc8004Gas,
      maxFeePerGas: fastGas,
      maxPriorityFeePerGas: fastGas / 2n,
      nonce: v1Nonce + 1 // +1 because revocation increments nonce
    });
    console.log('TX2:', hash2);
    
    // TX3: Transfer ENS
    console.log('\n[TX3] Transferring ENS...');
    const ensNode = namehash('0xclaw.eth');
    const hash3 = await v1Wallet.writeContract({
      address: ENS_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [V1, V3, BigInt(ensNode), 1n, '0x'],
      gas: ensGas,
      maxFeePerGas: fastGas,
      maxPriorityFeePerGas: fastGas / 2n,
      nonce: v1Nonce + 2
    });
    console.log('TX3:', hash3);
    
    // Wait for all
    console.log('\n⏳ Waiting for confirmations...');
    const [r1, r2, r3] = await Promise.all([
      client.waitForTransactionReceipt({ hash: hash1, timeout: 120000 }),
      client.waitForTransactionReceipt({ hash: hash2, timeout: 120000 }),
      client.waitForTransactionReceipt({ hash: hash3, timeout: 120000 })
    ]);
    
    console.log('\n📊 Results:');
    console.log('TX1 (fund+revoke):', r1.status, 'gas:', r1.gasUsed);
    console.log('TX2 (ERC-8004):', r2.status, 'gas:', r2.gasUsed);
    console.log('TX3 (ENS):', r3.status, 'gas:', r3.gasUsed);
    
    // Check final ownership
    const ERC721_VIEW = parseAbi(['function ownerOf(uint256) view returns (address)']);
    const agentOwner = await client.readContract({
      address: ERC8004,
      abi: ERC721_VIEW,
      functionName: 'ownerOf',
      args: [AGENT_ID]
    });
    console.log('\nERC-8004 #22583 owner:', agentOwner);
    console.log('Is V3?', agentOwner.toLowerCase() === V3.toLowerCase() ? '✅ YES!' : '❌ NO');
  }
}

bundleTransfer().catch(console.error);
