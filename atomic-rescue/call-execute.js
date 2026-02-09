const { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3_KEY = '0xbd587042e0ed7278d5e8c89aa03306970e66d7b7ed6eb91868c80be6b8277ee3';
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const RESCUE_ABI = parseAbi([
  'function execute() external',
  'function canRescue() external view returns (bool hasAgent, bool hasENS)',
  'function rescueDestination() external view returns (address)'
]);

async function main() {
  const client = createPublicClient({ chain: mainnet, transport: http('https://eth.drpc.org') });
  const account = privateKeyToAccount(V3_KEY);
  const wallet = createWalletClient({ account, chain: mainnet, transport: http('https://eth.drpc.org') });
  
  console.log('Checking V1 delegation...');
  const code = await client.getCode({ address: V1 });
  console.log('V1 delegated to:', '0x' + code.slice(8));
  
  // Try calling canRescue on V1
  console.log('\nCalling canRescue() on V1...');
  try {
    const [hasAgent, hasENS] = await client.readContract({
      address: V1,
      abi: RESCUE_ABI,
      functionName: 'canRescue'
    });
    console.log('canRescue result:', { hasAgent, hasENS });
  } catch(e) {
    console.log('canRescue error:', e.message?.slice(0, 200));
  }
  
  // Try calling rescueDestination
  console.log('\nCalling rescueDestination() on V1...');
  try {
    const dest = await client.readContract({
      address: V1,
      abi: RESCUE_ABI,
      functionName: 'rescueDestination'
    });
    console.log('rescueDestination:', dest);
  } catch(e) {
    console.log('rescueDestination error:', e.message?.slice(0, 200));
  }
  
  // Simulate execute
  console.log('\nSimulating execute() on V1...');
  try {
    await client.simulateContract({
      address: V1,
      abi: RESCUE_ABI,
      functionName: 'execute',
      account: account
    });
    console.log('Simulation successful!');
  } catch(e) {
    console.log('Simulation error:', e.message?.slice(0, 500));
  }
  
  // Actually call execute
  console.log('\nSending execute() transaction...');
  const gasPrice = await client.getGasPrice();
  
  try {
    const hash = await wallet.writeContract({
      address: V1,
      abi: RESCUE_ABI,
      functionName: 'execute',
      gas: 200000n,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: 100000000n,
    });
    
    console.log('TX:', hash);
    console.log('https://etherscan.io/tx/' + hash);
    
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120000 });
    console.log('Status:', receipt.status);
    console.log('Gas used:', receipt.gasUsed);
    console.log('Logs:', receipt.logs.length);
  } catch(e) {
    console.log('Execute error:', e.message?.slice(0, 500));
  }
}

main().catch(console.error);
