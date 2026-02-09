const { ethers } = require('ethers');
const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');

// ═══════════════════════════════════════════
//    🚀 FLASHBOTS ATOMIC RESCUE
// ═══════════════════════════════════════════
// All transactions in ONE atomic bundle
// Sweeper can't interfere!
// ═══════════════════════════════════════════

const V1_KEY = '0x187d9f0c6cf881f5bf9bfbca7777b2afb3dc32eaa60c3229c0e14b0e1512f9d3';
const V3_KEY = '0xbd587042e0ed7278d5e8c89aa03306970e66d7b7ed6eb91868c80be6b8277ee3';
const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004 = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ID = 22583;

// ENS namehash for 0xclaw.eth
const ENS_NODE = '0x79b59aaad31ac5d39c00bcaabb05724d18ebdaa559b308a61ba0712949a6e624';

async function flashbotsRescue() {
  console.log('🚀 FLASHBOTS ATOMIC RESCUE\n');
  
  // Setup providers
  const provider = new ethers.providers.JsonRpcProvider('https://eth.drpc.org');
  const v1Wallet = new ethers.Wallet(V1_KEY, provider);
  const v3Wallet = new ethers.Wallet(V3_KEY, provider);
  
  // Create auth signer for Flashbots
  const authSigner = ethers.Wallet.createRandom();
  
  // Connect to Flashbots
  console.log('Connecting to Flashbots...');
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner,
    'https://relay.flashbots.net'
  );
  console.log('✅ Connected to Flashbots relay\n');
  
  // Get current state
  const block = await provider.getBlockNumber();
  const gasPrice = await provider.getGasPrice();
  const priorityFee = ethers.utils.parseUnits('3', 'gwei'); // 3 gwei priority
  const maxFee = gasPrice.mul(3); // 3x current gas
  
  console.log('Current block:', block);
  console.log('Gas price:', ethers.utils.formatUnits(gasPrice, 'gwei'), 'gwei');
  console.log('Max fee:', ethers.utils.formatUnits(maxFee, 'gwei'), 'gwei');
  
  // Get nonces
  const v1Nonce = await provider.getTransactionCount(V1);
  const v3Nonce = await provider.getTransactionCount(V3);
  console.log('\nV1 nonce:', v1Nonce);
  console.log('V3 nonce:', v3Nonce);
  
  // Calculate funding needed
  const erc8004Gas = 80000;
  const ensGas = 120000;
  const totalGas = erc8004Gas + ensGas;
  const fundAmount = maxFee.mul(totalGas).mul(2); // 2x buffer
  console.log('\nFunding amount:', ethers.utils.formatEther(fundAmount), 'ETH');
  
  // Check V3 balance
  const v3Balance = await provider.getBalance(V3);
  console.log('V3 balance:', ethers.utils.formatEther(v3Balance), 'ETH');
  
  if (v3Balance.lt(fundAmount.add(ethers.utils.parseEther('0.001')))) {
    console.log('❌ V3 needs more ETH');
    return;
  }
  
  // ERC-721 transferFrom ABI
  const erc721Iface = new ethers.utils.Interface([
    'function transferFrom(address from, address to, uint256 tokenId)'
  ]);
  
  // ENS NameWrapper safeTransferFrom ABI
  const nameWrapperIface = new ethers.utils.Interface([
    'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)'
  ]);
  
  // Build bundle transactions
  console.log('\n📦 Building transaction bundle...\n');
  
  // TX1: V3 funds V1
  const tx1 = {
    to: V1,
    value: fundAmount,
    gasLimit: 21000,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: priorityFee,
    nonce: v3Nonce,
    type: 2,
    chainId: 1
  };
  console.log('TX1: Fund V1 with', ethers.utils.formatEther(fundAmount), 'ETH');
  
  // TX2: V1 transfers ERC-8004
  const tx2 = {
    to: ERC8004,
    data: erc721Iface.encodeFunctionData('transferFrom', [V1, V3, AGENT_ID]),
    gasLimit: erc8004Gas,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: priorityFee,
    nonce: v1Nonce,
    type: 2,
    chainId: 1
  };
  console.log('TX2: Transfer ERC-8004 #22583 to V3');
  
  // TX3: V1 transfers ENS
  const tx3 = {
    to: ENS_WRAPPER,
    data: nameWrapperIface.encodeFunctionData('safeTransferFrom', [V1, V3, ENS_NODE, 1, '0x']),
    gasLimit: ensGas,
    maxFeePerGas: maxFee,
    maxPriorityFeePerGas: priorityFee,
    nonce: v1Nonce + 1,
    type: 2,
    chainId: 1
  };
  console.log('TX3: Transfer ENS 0xclaw.eth to V3');
  
  // Sign transactions
  const signedTx1 = await v3Wallet.signTransaction(tx1);
  const signedTx2 = await v1Wallet.signTransaction(tx2);
  const signedTx3 = await v1Wallet.signTransaction(tx3);
  
  // Create bundle
  const signedBundle = [
    { signedTransaction: signedTx1 },
    { signedTransaction: signedTx2 },
    { signedTransaction: signedTx3 }
  ];
  
  // Target the next few blocks
  const targetBlockNumber = block + 1;
  
  console.log('\n🚀 Submitting bundle for block', targetBlockNumber, '...\n');
  
  // Simulate first
  console.log('Simulating bundle...');
  const simulation = await flashbotsProvider.simulate(signedBundle, targetBlockNumber);
  
  if ('error' in simulation) {
    console.log('❌ Simulation error:', simulation.error.message);
    return;
  }
  
  console.log('Simulation successful!');
  console.log('  Total gas used:', simulation.totalGasUsed);
  console.log('  Coinbase diff:', ethers.utils.formatEther(simulation.coinbaseDiff), 'ETH');
  
  // Send to multiple blocks
  const bundlePromises = [];
  for (let i = 0; i < 10; i++) {
    const targetBlock = targetBlockNumber + i;
    bundlePromises.push(
      flashbotsProvider.sendBundle(signedBundle, targetBlock)
        .then(bundleSubmission => {
          console.log(`Bundle submitted for block ${targetBlock}`);
          return { targetBlock, bundleSubmission };
        })
    );
  }
  
  const submissions = await Promise.all(bundlePromises);
  
  // Wait for one to land
  console.log('\n⏳ Waiting for bundle to land...\n');
  
  for (const { targetBlock, bundleSubmission } of submissions) {
    if ('error' in bundleSubmission) {
      console.log(`Block ${targetBlock}: Error -`, bundleSubmission.error.message);
      continue;
    }
    
    const waitResponse = await bundleSubmission.wait();
    console.log(`Block ${targetBlock}: ${waitResponse === 0 ? 'INCLUDED ✅' : waitResponse === 1 ? 'NOT INCLUDED' : 'BLOCK PASSED'}`);
    
    if (waitResponse === 0) {
      console.log('\n🎉 BUNDLE INCLUDED! Checking final state...\n');
      
      // Check ownership
      const erc721 = new ethers.Contract(ERC8004, ['function ownerOf(uint256) view returns (address)'], provider);
      const owner = await erc721.ownerOf(AGENT_ID);
      console.log('ERC-8004 #22583 owner:', owner);
      console.log('Is V3?', owner.toLowerCase() === V3.toLowerCase() ? '✅ YES!' : '❌ NO');
      
      return;
    }
  }
  
  console.log('\n❌ Bundle not included in any target block');
  console.log('The sweeper may have a Flashbots relay too...');
}

flashbotsRescue().catch(e => {
  console.error('Error:', e.message);
});
