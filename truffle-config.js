require('dotenv').config();
// const { MNEMONIC, PROJECT_ID } = process.env;
// const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    // ✅ Development network — connects to Ganache GUI
    // This is the default network Truffle uses when no --network flag is specified
    development: {
      host: "127.0.0.1",     // Localhost
      port: 7777,            // ✅ Your Ganache GUI port
      network_id: "5777",    // ✅ Your Ganache Chain ID
    },

    // ✅ Explicit Ganache network (use with: truffle migrate --network ganache)
    ganache: {
      host: "127.0.0.1",
      port: 7777,
      network_id: "5777",
    },

    // Sepolia Testnet (uncomment and fill .env to use)
    // sepolia: {
    //   provider: () => new HDWalletProvider(MNEMONIC, `https://sepolia.infura.io/v3/${PROJECT_ID}`),
    //   network_id: 11155111,
    //   confirmations: 2,
    //   timeoutBlocks: 200,
    //   skipDryRun: true
    // },
  },

  // Set default mocha options here, use special reporters, etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.21",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
};