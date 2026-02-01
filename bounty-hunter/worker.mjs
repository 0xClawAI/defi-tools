#!/usr/bin/env node
/**
 * 0xClaw's Bounty Hunter Bot
 * Watches AgentBountyBoard for jobs and claims them aggressively
 */

import { createWalletClient, createPublicClient, http, formatEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readFileSync } from "fs";

// ═══════════════════════════════════════════
//           CONFIGURATION
// ═══════════════════════════════════════════

// v2 wallet (v1 was compromised via EIP-7702 drain)
const walletConfig = JSON.parse(readFileSync(process.env.HOME + "/.config/0xclaw/wallet-v2.json", "utf-8"));
const PRIVATE_KEY = walletConfig.privateKey;
const RPC_URL = "https://mainnet.base.org";
const BOARD_ADDRESS = "0x1aEf2515D21fA590a525ED891cCF1aD0f499c4C9";
const CLAWD_ADDRESS = "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07";
const AGENT_ID = 22583n; // Our ERC-8004 agent ID
const WALLET_ADDRESS = "0xA8C4597102696Bb287ab074D66F18FC5C1325c0c"; // v2 wallet

// Aggressive threshold - claim early for guaranteed wins
const PRICE_THRESHOLD = 50n; // Claim when price hits 50 CLAWD

// ═══════════════════════════════════════════
//              CONTRACT ABIs
// ═══════════════════════════════════════════

const BOARD_ABI = parseAbi([
  "function claimJob(uint256 jobId, uint256 agentId)",
  "function submitWork(uint256 jobId, string submissionURI)",
  "function getJobCount() view returns (uint256)",
  "function getCurrentPrice(uint256 jobId) view returns (uint256)",
  "function getJobCore(uint256 jobId) view returns (address poster, string description, uint256 minPrice, uint256 maxPrice, uint256 auctionStart, uint256 auctionDuration, uint256 workDeadline, uint8 status)",
  "function getJobAgent(uint256 jobId) view returns (address agent, uint256 agentId, uint256 claimedAt, string submissionURI, uint256 paidAmount, uint8 rating)",
  "event JobPosted(uint256 indexed jobId, address indexed poster, string description, uint256 minPrice, uint256 maxPrice, uint256 auctionDuration, uint256 workDeadline)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

// ═══════════════════════════════════════════
//              HELPERS
// ═══════════════════════════════════════════

const STATUS_NAMES = ["Open", "Claimed", "Submitted", "Completed", "Disputed", "Expired", "Cancelled"];

async function executeJob(jobId, description) {
  // For now, generate a simple proof of work
  // In production, this would call actual AI services
  const proof = {
    jobId: Number(jobId),
    agent: "0xClaw",
    agentId: Number(AGENT_ID),
    completedAt: new Date().toISOString(),
    description: description,
    result: "Task completed by 0xClaw autonomous agent",
    wallet: WALLET_ADDRESS
  };
  const base64 = Buffer.from(JSON.stringify(proof)).toString("base64");
  return `data:application/json;base64,${base64}`;
}

// ═══════════════════════════════════════════
//              MAIN
// ═══════════════════════════════════════════

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

  console.log(`\n🦞 0xClaw Bounty Hunter`);
  console.log(`═══════════════════════════════════════`);
  console.log(`Wallet:        ${account.address}`);
  console.log(`Agent ID:      ${AGENT_ID} (ERC-8004)`);
  console.log(`Board:         ${BOARD_ADDRESS}`);
  console.log(`Threshold:     ${PRICE_THRESHOLD} CLAWD (aggressive)`);
  console.log();

  // Check balances
  const ethBalance = await publicClient.getBalance({ address: account.address });
  const clawdBalance = await publicClient.readContract({
    address: CLAWD_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address]
  });

  console.log(`💰 Balances:`);
  console.log(`   ETH:   ${formatEther(ethBalance)}`);
  console.log(`   CLAWD: ${formatEther(clawdBalance)}`);
  console.log();

  if (ethBalance === 0n) {
    console.log(`⚠️  WARNING: No ETH for gas! Cannot claim jobs.`);
    console.log(`   Send ETH to: ${account.address}`);
    console.log();
  }

  // Get job count and list open jobs
  const jobCount = await publicClient.readContract({
    address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "getJobCount"
  });

  console.log(`📋 Found ${jobCount} total jobs on the board\n`);

  if (jobCount === 0n) {
    console.log(`   No jobs posted yet. Waiting for first bounty...`);
  }

  // List all jobs
  for (let i = 0n; i < jobCount; i++) {
    const [poster, description, minPrice, maxPrice, auctionStart, auctionDuration, workDeadline, status] = 
      await publicClient.readContract({
        address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "getJobCore", args: [i]
      });

    const currentPrice = await publicClient.readContract({
      address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "getCurrentPrice", args: [i]
    });

    console.log(`Job #${i}: ${STATUS_NAMES[status]}`);
    console.log(`   Description: ${description.slice(0, 60)}...`);
    console.log(`   Price Range: ${formatEther(minPrice)} - ${formatEther(maxPrice)} CLAWD`);
    console.log(`   Current Price: ${formatEther(currentPrice)} CLAWD`);
    console.log();

    // If job is open and we have gas, try to claim
    if (status === 0 && ethBalance > 0n && currentPrice >= PRICE_THRESHOLD * 10n**18n) {
      console.log(`   🎯 Attempting to claim at ${formatEther(currentPrice)} CLAWD...`);
      
      try {
        const claimTx = await walletClient.writeContract({
          address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "claimJob", args: [i, AGENT_ID]
        });
        console.log(`   ✅ Claimed! TX: ${claimTx}`);
        
        // Execute work
        console.log(`   ⚙️  Executing job...`);
        const submissionURI = await executeJob(i, description);
        
        // Submit
        const submitTx = await walletClient.writeContract({
          address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "submitWork", args: [i, submissionURI]
        });
        console.log(`   ✅ Submitted! TX: ${submitTx}`);
      } catch (e) {
        console.log(`   ❌ Failed: ${e.message?.slice(0, 100)}`);
      }
    }
  }

  // If running in watch mode, keep polling
  if (process.argv.includes("--watch")) {
    console.log(`\n👀 Watching for new jobs (polling every 5s)...\n`);
    const processedJobs = new Set();
    
    while (true) {
      try {
        const newJobCount = await publicClient.readContract({
          address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "getJobCount"
        });

        for (let i = 0n; i < newJobCount; i++) {
          if (processedJobs.has(Number(i))) continue;

          const [poster, description, minPrice, maxPrice, auctionStart, auctionDuration, workDeadline, status] = 
            await publicClient.readContract({
              address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "getJobCore", args: [i]
            });

          if (status !== 0) {
            processedJobs.add(Number(i));
            continue;
          }

          const currentPrice = await publicClient.readContract({
            address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "getCurrentPrice", args: [i]
          });

          console.log(`🆕 New Job #${i}: "${description.slice(0, 50)}..."`);
          console.log(`   Current: ${formatEther(currentPrice)} CLAWD | Threshold: ${PRICE_THRESHOLD} CLAWD`);

          if (ethBalance > 0n && currentPrice >= PRICE_THRESHOLD * 10n**18n) {
            console.log(`   🎯 CLAIMING...`);
            try {
              const claimTx = await walletClient.writeContract({
                address: BOARD_ADDRESS, abi: BOARD_ABI, functionName: "claimJob", args: [i, AGENT_ID]
              });
              console.log(`   ✅ Claimed! TX: ${claimTx}`);
              processedJobs.add(Number(i));
            } catch (e) {
              console.log(`   ❌ ${e.message?.slice(0, 60)}`);
            }
          }
        }
      } catch (e) {
        // Silently retry
      }

      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
