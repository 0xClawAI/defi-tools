const { createPublicClient, createWalletClient, http, parseAbi, formatEther, toHex, keccak256, concat, numberToHex, serializeTransaction, parseTransaction } = require('viem');
const { privateKeyToAccount, signMessage } = require('viem/accounts');
const { mainnet } = require('viem/chains');

// ═══════════════════════════════════════════
//    🚀 FLASHBOTS DIRECT API RESCUE
// ═══════════════════════════════════════════

const V1_KEY = '0x187d9f0c6cf881f5bf9bfbca7777b2afb3dc32eaa60c3229c0e14b0e1512f9d3';
const V3_KEY = '0xbd587042e0ed7278d5e8c89aa03306970e66d7b7ed6eb91868c80be6b8277ee3';
const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004 = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ID = 22583n;
const ENS_NODE = '0x79b59aaad31ac5d39c00bcaabb05724d18ebdaa559b308a61ba0712949a6e624';

const FLASHBOTS_RELAY = 'https://relay.flashbots.net';

async function flashbotsRescue() {
  console.log('🚀 FLASHBOTS DIRECT API RESCUE\n');
  
  const client = createPublicClient({ chain: mainnet, transport: http('https://eth.drpc.org') });
  
  const v1Account = privateKeyToAccount(V1_KEY);
  const v3Account = privateKeyToAccount(V3_KEY);
  
  const v1Wallet = createWalletClient({ account: v1Account, chain: mainnet, transport: http('https://eth.drpc.org') });
  const v3Wallet = createWalletClient({ account: v3Account, chain: mainnet, transport: http('https://eth.drpc.org') });
  
  // Auth signer for Flashbots
  const authAccount = privateKeyToAccount('0x' + require('crypto').randomBytes(32).toString('hex'));
  
  // Get state
  const [block, gasPrice, v1Nonce, v3Nonce, v3Bal] = await Promise.all([
    client.getBlockNumber(),
    client.getGasPrice(),
    client.getTransactionCount({ address: V1 }),
    client.getTransactionCount({ address: V3 }),
    client.getBalance({ address: V3 })
  ]);
  
  const maxFeePerGas = gasPrice * 3n;
  const maxPriorityFeePerGas = gasPrice;
  const fundAmount = maxFeePerGas * 250000n;
  
  console.log('Block:', block);
  console.log('Gas:', Number(gasPrice) / 1e9, 'gwei');
  console.log('V1 nonce:', v1Nonce);
  console.log('V3 nonce:', v3Nonce);
  console.log('V3 balance:', formatEther(v3Bal), 'ETH');
  console.log('Fund amount:', formatEther(fundAmount), 'ETH\n');
  
  // ABIs
  const erc721ABI = parseAbi(['function transferFrom(address from, address to, uint256 tokenId)']);
  const wrapperABI = parseAbi(['function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)']);
  
  // Sign transactions
  console.log('Signing transactions...\n');
  
  // TX1: V3 funds V1
  const signedTx1 = await v3Wallet.signTransaction({
    to: V1,
    value: fundAmount,
    gas: 21000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: v3Nonce,
    chainId: 1
  });
  console.log('TX1 signed: Fund V1');
  
  // TX2: V1 transfers ERC-8004
  const signedTx2 = await v1Wallet.signTransaction({
    to: ERC8004,
    data: '0x23b872dd' + // transferFrom selector
      V1.slice(2).toLowerCase().padStart(64, '0') +
      V3.slice(2).toLowerCase().padStart(64, '0') +
      AGENT_ID.toString(16).padStart(64, '0'),
    gas: 100000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: v1Nonce,
    chainId: 1
  });
  console.log('TX2 signed: Transfer ERC-8004');
  
  // TX3: V1 transfers ENS
  // safeTransferFrom(from, to, id, amount, data)
  const signedTx3 = await v1Wallet.signTransaction({
    to: ENS_WRAPPER,
    data: '0xf242432a' + // safeTransferFrom selector
      V1.slice(2).toLowerCase().padStart(64, '0') +
      V3.slice(2).toLowerCase().padStart(64, '0') +
      ENS_NODE.slice(2).padStart(64, '0') +
      '1'.padStart(64, '0') + // amount = 1
      'a0'.padStart(64, '0') + // offset to data
      '0'.padStart(64, '0'), // data length = 0
    gas: 150000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce: v1Nonce + 1,
    chainId: 1
  });
  console.log('TX3 signed: Transfer ENS\n');
  
  const bundle = [signedTx1, signedTx2, signedTx3];
  
  // Submit to Flashbots for next several blocks
  const targetBlock = block + 1n;
  
  console.log('Submitting to Flashbots for blocks', targetBlock.toString(), '-', (targetBlock + 9n).toString(), '...\n');
  
  for (let i = 0n; i < 10n; i++) {
    const blockNum = targetBlock + i;
    
    // Create Flashbots payload
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendBundle',
      params: [{
        txs: bundle,
        blockNumber: '0x' + blockNum.toString(16)
      }]
    };
    
    // Sign the payload
    const body = JSON.stringify(payload);
    const signature = await authAccount.signMessage({ message: keccak256(toHex(body)) });
    
    try {
      const response = await fetch(FLASHBOTS_RELAY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Flashbots-Signature': `${authAccount.address}:${signature}`
        },
        body
      });
      
      const result = await response.json();
      
      if (result.error) {
        console.log(`Block ${blockNum}: Error -`, result.error.message);
      } else {
        console.log(`Block ${blockNum}: Submitted - bundleHash:`, result.result?.bundleHash?.slice(0, 20) + '...');
      }
    } catch (e) {
      console.log(`Block ${blockNum}: Failed -`, e.message?.slice(0, 50));
    }
  }
  
  // Wait and check
  console.log('\n⏳ Waiting 30 seconds for inclusion...\n');
  await new Promise(r => setTimeout(r, 30000));
  
  // Check final ownership
  const ERC721_VIEW = parseAbi(['function ownerOf(uint256) view returns (address)']);
  const agentOwner = await client.readContract({ 
    address: ERC8004, 
    abi: ERC721_VIEW, 
    functionName: 'ownerOf', 
    args: [AGENT_ID] 
  });
  
  console.log('ERC-8004 #22583 owner:', agentOwner);
  console.log('Is V3?', agentOwner.toLowerCase() === V3.toLowerCase() ? '✅ YES!' : '❌ NO');
  
  // Check V1 balance and nonces
  const newV1Nonce = await client.getTransactionCount({ address: V1 });
  const v1Bal = await client.getBalance({ address: V1 });
  console.log('\nV1 nonce now:', newV1Nonce);
  console.log('V1 balance:', formatEther(v1Bal), 'ETH');
}

flashbotsRescue().catch(e => console.error('Error:', e.message?.slice(0, 500)));
