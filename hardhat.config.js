require("dotenv").config();

require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");

// Config

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
        blockNumber: 14953933,
        timeout: 30 * 1000,
      },
    },
    localhost: {
      chainId: 1,
      url: "http://127.0.0.1:8545",
      timeout: 5 * 60 * 1000,
      gasLimit: 800000
    },
  },

  solidity: "^0.8.0",

  contractSizer: {
    //runOnCompile: true,
  },

  mocha: {
    timeout: 100000,
  },
};
