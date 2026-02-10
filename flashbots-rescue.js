const { ethers } = require('ethers');
const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');

// Wallets
const V1_KEY = process.env.V1_KEY;
const V3_KEY = process.env.V3_KEY;
const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004 = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';

async function flashbotsRescue() {
  const provider = new ethers.providers.JsonRpcProvider('https://eth.drpc.org');
  const v1Wallet = new ethers.Wallet(V1_KEY, provider);
  const v3Wallet = new ethers.Wallet(V3_KEY, provider);
  
  // Create Flashbots provider
  const authSigner = ethers.Wallet.createRandom();
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    authSigner,
    'https://relay.flashbots.net'
  );
  
  console.log('🚀 Flashbots provider ready');
  
  const block = await provider.getBlockNumber();
  const gasPrice = ethers.utils.parseUnits('3', 'gwei'); // Use higher gas for Flashbots
  
  // Get nonces
  const v1Nonce = await provider.getTransactionCount(V1);
  const v3Nonce = await provider.getTransactionCount(V3);
  
  console.log('V1 nonce:', v1Nonce);
  console.log('V3 nonce:', v3Nonce);
  console.log('Current block:', block);
  
  // Create bundle:
  // 1. V3 funds V1
  // 2. V1 revokes delegation (via authorizationList - not supported in ethers v5 easily)
  // 3. V1 transfers ERC-8004
  // 4. V1 transfers ENS
  
  // Actually, ethers v5 doesn't support EIP-7702 authorizationList
  // We need to use viem for this
  
  console.log('\n❌ ethers v5 does not support EIP-7702 authorizationList');
  console.log('Need to use a different approach...');
}

flashbotsRescue().catch(console.error);
