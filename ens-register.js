const { ethers } = require('ethers');
const fs = require('fs');

// ENS Registrar Controller on Mainnet
const REGISTRAR_ADDRESS = '0x253553366Da8546fC250F225fe3d25d0C782303b';
const REGISTRAR_ABI = [
  'function available(string name) view returns (bool)',
  'function rentPrice(string name, uint256 duration) view returns (uint256)',
  'function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) payable'
];

async function main() {
  const name = '0xclaw'; // without .eth
  const duration = 31536000; // 1 year in seconds
  
  // Load wallet
  const walletData = JSON.parse(fs.readFileSync('/home/clawdbot/.config/0xclaw/wallet.json'));
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
  const wallet = new ethers.Wallet(walletData.privateKey, provider);
  
  console.log('Wallet:', wallet.address);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  
  // Connect to registrar
  const registrar = new ethers.Contract(REGISTRAR_ADDRESS, REGISTRAR_ABI, wallet);
  
  // Check availability
  const available = await registrar.available(name);
  console.log('Available:', available);
  
  if (!available) {
    console.log('Name not available!');
    return;
  }
  
  // Get price
  const price = await registrar.rentPrice(name, duration);
  console.log('Price:', ethers.formatEther(price), 'ETH');
  
  // Generate random secret for commitment
  const secret = ethers.randomBytes(32);
  console.log('Secret:', ethers.hexlify(secret));
  
  // Public resolver address
  const resolver = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63';
  
  // Create commitment
  const commitment = await registrar.makeCommitment(
    name,
    wallet.address,
    duration,
    secret,
    resolver,
    [],
    true, // reverse record
    0 // no fuses
  );
  console.log('Commitment:', commitment);
  
  // Step 1: Commit
  console.log('\nStep 1: Committing...');
  const commitTx = await registrar.commit(commitment);
  console.log('Commit tx:', commitTx.hash);
  await commitTx.wait();
  console.log('Commit confirmed!');
  
  // Wait for minCommitmentAge (60 seconds)
  console.log('\nWaiting 60 seconds for commitment to mature...');
  await new Promise(r => setTimeout(r, 65000));
  
  // Step 2: Register
  console.log('\nStep 2: Registering...');
  const value = price * 110n / 100n; // 10% buffer for price fluctuation
  const registerTx = await registrar.register(
    name,
    wallet.address,
    duration,
    secret,
    resolver,
    [],
    true,
    0,
    { value }
  );
  console.log('Register tx:', registerTx.hash);
  await registerTx.wait();
  
  console.log('\n✅ Successfully registered', name + '.eth');
}

main().catch(console.error);
