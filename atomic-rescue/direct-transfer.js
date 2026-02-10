const { createPublicClient, createWalletClient, http, parseAbi, namehash, formatEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { mainnet } = require('viem/chains');

const V1_KEY = process.env.V1_KEY;
const V1 = '0xffA12D92098eB2b72B3c30B62f8da02BA4158c1e';
const V3_KEY = process.env.V3_KEY;
const V3 = '0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1';

const ERC8004 = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const ENS_WRAPPER = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';
const AGENT_ID = 22583n;

const ERC721_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function ownerOf(uint256) view returns (address)'
]);

const NAME_WRAPPER_ABI = parseAbi([
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function ownerOf(uint256) view returns (address)'
]);

async function main() {
  const client = createPublicClient({ chain: mainnet, transport: http('https://eth.drpc.org') });
  const v1Account = privateKeyToAccount(V1_KEY);
  const v3Account = privateKeyToAccount(V3_KEY);
  
  // Check balances
  const v1Bal = await client.getBalance({ address: V1 });
  const v3Bal = await client.getBalance({ address: V3 });
  console.log('V1 balance:', formatEther(v1Bal), 'ETH');
  console.log('V3 balance:', formatEther(v3Bal), 'ETH');
  
  if (v1Bal === 0n) {
    console.log('\n⚠️ V1 has no ETH for gas');
    console.log('Need to fund V1 first, but that might trigger sweeper');
    console.log('\nAttempting V3-sponsored approach instead...\n');
    
    // Use V3 to call with V1's authorization to revoke delegation first
    // Then V1 can sign transfers
    
    // Actually, let's check if V1 can even sign transactions while delegated
    // The issue: when V1 is delegated, txs TO V1 run delegate code
    // But txs FROM V1 should still work normally...
    
    console.log('Checking if V1 is delegated...');
    const code = await client.getCode({ address: V1 });
    console.log('V1 code:', code);
    
    if (code && code !== '0x') {
      console.log('\nV1 is delegated. Attempting to revoke...');
      
      // Sign revocation authorization
      const v1Wallet = createWalletClient({
        account: v1Account,
        chain: mainnet,
        transport: http('https://eth.drpc.org')
      });
      
      const revocation = await v1Wallet.signAuthorization({
        contractAddress: '0x0000000000000000000000000000000000000000',
      });
      console.log('Revocation signed, nonce:', revocation.nonce);
      
      // V3 sponsors revocation + transfer in one
      const v3Wallet = createWalletClient({
        account: v3Account,
        chain: mainnet,
        transport: http('https://eth.drpc.org')
      });
      
      const gasPrice = await client.getGasPrice();
      console.log('Gas price:', Number(gasPrice) / 1e9, 'gwei');
      
      // Attempt ERC-8004 transfer with revocation
      console.log('\n🔥 Attempting ERC-8004 transfer with V3 sponsorship + revocation...');
      
      // V3 sends tx that includes V1's revocation, then calls ERC8004 directly
      // But wait - V3 can't call transferFrom for V1's tokens...
      
      // The trick: we need V1 to sign the transferFrom, not V3
      // So we need V1 to have gas, or use a meta-tx/signature-based approach
      
      // Check if ERC-8004 supports permit or any signature-based transfer
      console.log('\nChecking ERC-8004 for permit support...');
      try {
        const nonce = await client.readContract({
          address: ERC8004,
          abi: parseAbi(['function nonces(address) view returns (uint256)']),
          functionName: 'nonces',
          args: [V1]
        });
        console.log('Has nonces function (EIP-2612 permit):', true);
      } catch(e) {
        console.log('No permit support detected');
      }
      
      // Alternative: fund V1 with just enough gas and race to transfer
      console.log('\n💡 Alternative: Fund V1 with minimal ETH and immediately transfer');
      console.log('Risk: Sweeper might grab the ETH first');
      console.log('\nCalculating minimum needed...');
      
      // Estimate gas for both transfers
      const erc8004Gas = 65000n; // ERC721 transfer
      const ensGas = 100000n; // NameWrapper transfer  
      const totalGas = erc8004Gas + ensGas + 42000n; // + two base costs
      const totalCost = gasPrice * totalGas * 2n; // 2x buffer
      
      console.log('Total gas needed:', totalGas.toString());
      console.log('Total ETH needed:', formatEther(totalCost), 'ETH');
      console.log('V3 has enough:', v3Bal >= totalCost);
    }
  } else {
    console.log('\n✅ V1 has ETH! Proceeding with direct transfer...');
    
    const v1Wallet = createWalletClient({
      account: v1Account,
      chain: mainnet,
      transport: http('https://eth.drpc.org')
    });
    
    const gasPrice = await client.getGasPrice();
    
    // Transfer ERC-8004
    console.log('\nTransferring ERC-8004 #22583...');
    const hash1 = await v1Wallet.writeContract({
      address: ERC8004,
      abi: ERC721_ABI,
      functionName: 'transferFrom',
      args: [V1, V3, AGENT_ID],
      gas: 100000n,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: 100000000n,
    });
    console.log('TX:', hash1);
    
    const receipt1 = await client.waitForTransactionReceipt({ hash: hash1, timeout: 120000 });
    console.log('Status:', receipt1.status);
    
    // Transfer ENS
    console.log('\nTransferring ENS 0xclaw.eth...');
    const ensNode = namehash('0xclaw.eth');
    const hash2 = await v1Wallet.writeContract({
      address: ENS_WRAPPER,
      abi: NAME_WRAPPER_ABI,
      functionName: 'safeTransferFrom',
      args: [V1, V3, BigInt(ensNode), 1n, '0x'],
      gas: 150000n,
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: 100000000n,
    });
    console.log('TX:', hash2);
    
    const receipt2 = await client.waitForTransactionReceipt({ hash: hash2, timeout: 120000 });
    console.log('Status:', receipt2.status);
    
    console.log('\n✅ Done!');
  }
}

main().catch(console.error);
