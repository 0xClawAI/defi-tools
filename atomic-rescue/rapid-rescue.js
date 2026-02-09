const { createPublicClient, createWalletClient, http, parseAbi, namehash, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

const V1_KEY = '0x187d9f0c6cf881f5bf9bfbca7777b2afb3dc32eaa60c3229c0e14b0e1512f9d3';
const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3_KEY = '0xbd587042e0ed7278d5e8c89aa03306970e66d7b7ed6eb91868c80be6b8277ee3';
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004 = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ID = 22583n;

const ERC721_ABI = parseAbi(['function transferFrom(address from, address to, uint256 tokenId)']);
const NAME_WRAPPER_ABI = parseAbi(['function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)']);

async function rapidRescue() {
  console.log('🚀 RAPID RESCUE - Sending all txs simultaneously\n');
  
  const client = createPublicClient({ chain: mainnet, transport: http('https://eth.drpc.org') });
  const v1Account = privateKeyToAccount(V1_KEY);
  const v3Account = privateKeyToAccount(V3_KEY);
  
  const v1Wallet = createWalletClient({ account: v1Account, chain: mainnet, transport: http('https://eth.drpc.org') });
  const v3Wallet = createWalletClient({ account: v3Account, chain: mainnet, transport: http('https://eth.drpc.org') });
  
  // Get state
  const [v1Nonce, v3Nonce, gasPrice, v3Bal] = await Promise.all([
    client.getTransactionCount({ address: V1 }),
    client.getTransactionCount({ address: V3 }),
    client.getGasPrice(),
    client.getBalance({ address: V3 })
  ]);
  
  const fastGas = gasPrice * 3n; // 3x for speed
  const fundAmount = fastGas * 250000n; // enough for both transfers
  
  console.log('V1 nonce:', v1Nonce);
  console.log('V3 nonce:', v3Nonce);
  console.log('Gas price:', Number(gasPrice) / 1e9, 'gwei');
  console.log('Using:', Number(fastGas) / 1e9, 'gwei (3x premium)');
  console.log('Fund amount:', formatEther(fundAmount), 'ETH');
  console.log('V3 balance:', formatEther(v3Bal), 'ETH\n');
  
  if (v3Bal < fundAmount + (fastGas * 50000n)) {
    console.log('❌ V3 needs more ETH');
    return;
  }
  
  // Sign revocation first (V1 authorizes delegation to zero = revoke)
  console.log('Signing V1 revocation...');
  const revocation = await v1Wallet.signAuthorization({
    contractAddress: '0x0000000000000000000000000000000000000000'
  });
  console.log('Revocation nonce:', revocation.nonce);
  
  // After authorization is processed, V1 nonce becomes revocation.nonce + 1
  const v1PostRevokeNonce = Number(revocation.nonce) + 1;
  console.log('V1 nonce after revoke:', v1PostRevokeNonce);
  
  console.log('\n🔥 SENDING ALL TRANSACTIONS NOW...\n');
  
  const ensNode = namehash('0xclaw.eth');
  
  // Send all simultaneously
  const startTime = Date.now();
  
  const [hash1Promise, hash2Promise, hash3Promise] = await Promise.all([
    // TX1: Fund V1 + revoke delegation
    v3Wallet.sendTransaction({
      to: V1,
      value: fundAmount,
      gas: 55000n,
      maxFeePerGas: fastGas,
      maxPriorityFeePerGas: fastGas / 2n,
      authorizationList: [revocation],
      nonce: v3Nonce
    }),
    
    // TX2: Transfer ERC-8004 (depends on TX1 for both revocation and gas)
    v1Wallet.writeContract({
      address: ERC8004,
      abi: ERC721_ABI,
      functionName: 'transferFrom',
      args: [V1, V3, AGENT_ID],
      gas: 100000n,
      maxFeePerGas: fastGas,
      maxPriorityFeePerGas: fastGas / 2n,
      nonce: v1PostRevokeNonce
    }),
    
    // TX3: Transfer ENS
    v1Wallet.writeContract({
      address: ENS_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [V1, V3, BigInt(ensNode), 1n, '0x'],
      gas: 150000n,
      maxFeePerGas: fastGas,
      maxPriorityFeePerGas: fastGas / 2n,
      nonce: v1PostRevokeNonce + 1
    })
  ]);
  
  const sendTime = Date.now() - startTime;
  console.log(`All txs sent in ${sendTime}ms\n`);
  
  console.log('TX1 (fund+revoke):', hash1Promise);
  console.log('TX2 (ERC-8004):', hash2Promise);
  console.log('TX3 (ENS):', hash3Promise);
  
  console.log('\nhttps://etherscan.io/tx/' + hash1Promise);
  console.log('https://etherscan.io/tx/' + hash2Promise);
  console.log('https://etherscan.io/tx/' + hash3Promise);
  
  // Wait for confirmations
  console.log('\n⏳ Waiting for confirmations...\n');
  
  const receipts = await Promise.allSettled([
    client.waitForTransactionReceipt({ hash: hash1Promise, timeout: 180000 }),
    client.waitForTransactionReceipt({ hash: hash2Promise, timeout: 180000 }),
    client.waitForTransactionReceipt({ hash: hash3Promise, timeout: 180000 })
  ]);
  
  console.log('📊 Results:');
  receipts.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`TX${i+1}: ${r.value.status} | gas: ${r.value.gasUsed} | block: ${r.value.blockNumber}`);
    } else {
      console.log(`TX${i+1}: FAILED - ${r.reason?.message?.slice(0,100)}`);
    }
  });
  
  // Check final ownership
  const ERC721_VIEW = parseAbi(['function ownerOf(uint256) view returns (address)']);
  const [agentOwner, ensOwner] = await Promise.all([
    client.readContract({ address: ERC8004, abi: ERC721_VIEW, functionName: 'ownerOf', args: [AGENT_ID] }),
    client.readContract({ address: ENS_WRAPPER, abi: ERC721_VIEW, functionName: 'ownerOf', args: [BigInt(ensNode)] })
  ]);
  
  console.log('\n📋 Final Ownership:');
  console.log('ERC-8004 #22583:', agentOwner, agentOwner.toLowerCase() === V3.toLowerCase() ? '✅' : '❌');
  console.log('ENS 0xclaw.eth:', ensOwner, ensOwner.toLowerCase() === V3.toLowerCase() ? '✅' : '❌');
}

rapidRescue().catch(e => console.error('Error:', e.message?.slice(0, 500)));
