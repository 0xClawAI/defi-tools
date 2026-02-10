const { createPublicClient, createWalletClient, http, encodeDeployData, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');
const fs = require('fs');

const V3_KEY = process.env.V3_KEY;
const V3_ADDRESS = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

async function deploy() {
  console.log('🚀 Deploying AtomicRescue to mainnet...\n');
  
  const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/AtomicRescue.sol/AtomicRescue.json'));
  
  const account = privateKeyToAccount(V3_KEY);
  const client = createPublicClient({ chain: mainnet, transport: http('https://eth.drpc.org') });
  const wallet = createWalletClient({ account, chain: mainnet, transport: http('https://eth.drpc.org') });
  
  // Check balance
  const balance = await client.getBalance({ address: V3_ADDRESS });
  console.log('V3 Balance:', formatEther(balance), 'ETH');
  
  const gasPrice = await client.getGasPrice();
  console.log('Gas price:', Number(gasPrice) / 1e9, 'gwei');
  
  // Encode constructor args (V3 address as destination)
  const deployData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [V3_ADDRESS]
  });
  
  console.log('\nSending deployment tx...');
  
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [V3_ADDRESS],
    gas: 500000n,
    maxFeePerGas: gasPrice * 2n,
    maxPriorityFeePerGas: 100000000n, // 0.1 gwei tip
  });
  
  console.log('TX Hash:', hash);
  console.log('https://etherscan.io/tx/' + hash);
  
  console.log('\n⏳ Waiting for confirmation...');
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180000 });
  
  console.log('\n✅ Contract deployed!');
  console.log('Address:', receipt.contractAddress);
  console.log('Gas used:', receipt.gasUsed.toString());
  console.log('Block:', receipt.blockNumber);
  
  // Save address
  fs.writeFileSync('deployed-address.txt', receipt.contractAddress);
  console.log('\nSaved to deployed-address.txt');
  
  return receipt.contractAddress;
}

deploy().catch(console.error);
