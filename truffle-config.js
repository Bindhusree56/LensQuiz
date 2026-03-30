require("dotenv").config();
const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "1337"
    },
    sepolia: {
      provider: () => new HDWalletProvider(
        process.env.PRIVATE_KEY,
        process.env.SEPOLIA_RPC_URL
      ),
      network_id: 11155111,
      chainId: 11155111,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: false
    }
  },

  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },

  plugins: [
    "truffle-plugin-verify"
  ],

  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY
  }
};
