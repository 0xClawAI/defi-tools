const hre = require("hardhat");

async function main() {
  // V3 destination address
  const V3_ADDRESS = "0xD50406FcD7115cC55A88d77d3E62cE39c9fA99B1";
  
  console.log("Deploying AtomicRescue...");
  console.log("  Destination:", V3_ADDRESS);
  console.log("  Network:", hre.network.name);
  
  const AtomicRescue = await hre.ethers.getContractFactory("AtomicRescue");
  const rescue = await AtomicRescue.deploy(V3_ADDRESS);
  
  await rescue.waitForDeployment();
  const address = await rescue.getAddress();
  
  console.log("\n✅ AtomicRescue deployed to:", address);
  console.log("\nNext steps:");
  console.log(`  1. Verify contract: npx hardhat verify --network ${hre.network.name} ${address} ${V3_ADDRESS}`);
  console.log(`  2. Dry run: node execute-rescue.js rescue ${address}`);
  console.log(`  3. Execute: node execute-rescue.js rescue ${address} --execute`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
