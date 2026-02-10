require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const V3_KEY = process.env.V3_KEY || process.env.V3_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    mainnet: {
      url: "https://eth.drpc.org",
      accounts: [V3_KEY],
    },
    sepolia: {
      url: "https://rpc.sepolia.org",
      accounts: [V3_KEY],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
