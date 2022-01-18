require("dotenv").config();

require("solidity-coverage");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-contract-sizer");
if (process.env.CI) {
  require("@nomiclabs/hardhat-vyper");
}
require("./tasks");

function getNetworkUrl(networkName) {
  const alchemyKey = process.env.ALCHEMY_API_KEY || "";
  const url = `https://eth-${networkName}.alchemyapi.io/v2/` + alchemyKey;
  return url;
}

module.exports = {
  networks: {
    hardhat: {
      chainId: 1,
      forking: {
        url: getNetworkUrl("mainnet"),
        enabled: process.env.ENABLE_FORKING ? true : false,
        blockNumber: 13534790,
      },
      accounts: {
        // default, include for explicitness
        // mnemonic: "test test test test test test test test test test test junk",
        // Due to this bug, need to use our own test mnemonic:
        // https://github.com/nomiclabs/hardhat/issues/1231
        mnemonic:
          "today column drill funny reduce toilet strategy jump assault arctic boss umbrella",
        // default: 20
        count: 10,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      timeout: 1000000,
    },
    mainnet: {
      url: getNetworkUrl("mainnet"),
      accounts: {
        mnemonic: process.env.MNEMONIC || "",
      },
      timeout: 1000000,
    },
    kovan: {
      url: getNetworkUrl("kovan"),
      accounts: {
        mnemonic: process.env.MNEMONIC || "",
      },
    },
    rinkeby: {
      url: getNetworkUrl("rinkeby"),
      accounts: {
        mnemonic: process.env.MNEMONIC || "",
      },
    },
    testnet: {
      url: "http://34.138.217.77:8545",
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
    // These overrides ensure we use the same
    // compiler version and optimizer settings
    // as used in the production deployments.
    overrides: {
      "contracts/pool/PoolToken.sol": {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts/pool/TestPoolToken.sol": {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts/pool/PoolTokenProxy.sol": {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts/registry/AddressRegistry.sol": {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    },
  },
  vyper: {
    version: "0.2.4",
  },
  mocha: {
    timeout: 1000000,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
