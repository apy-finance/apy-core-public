const hre = require("hardhat");
const { ethers } = hre;
const chalk = require("chalk");
const {
  getDeployedAddress,
  getStablecoinAddress,
  bytes32,
  console,
} = require("../../utils/helpers");

console.logAddress = function (contractName, contractAddress) {
  contractName = contractName + ":";
  contractAddress = chalk.green(contractAddress);
  console.log.apply(this, [contractName, contractAddress]);
};

console.logDone = function () {
  console.log("");
  console.log.apply(this, [chalk.green("√") + " ... done."]);
  console.log("");
};

async function getAddressRegistry(networkName) {
  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistry",
    addressRegistryAddress
  );
  return addressRegistry;
}

async function getPoolManager(networkName) {
  const addressRegistry = await getAddressRegistry(networkName);
  const poolManagerAddress = await addressRegistry.getAddress(
    bytes32("poolManager")
  );
  const poolManager = await ethers.getContractAt(
    "PoolManager",
    poolManagerAddress
  );
  return poolManager;
}

async function getAccountManager(networkName) {
  const addressRegistry = await getAddressRegistry(networkName);
  const accountManagerAddress = await addressRegistry.getAddress(
    bytes32("accountManager")
  );
  const accountManager = await ethers.getContractAt(
    "AccountManager",
    accountManagerAddress
  );
  return accountManager;
}

async function getTvlManager(networkName) {
  const addressRegistry = await getAddressRegistry(networkName);
  const tvlManagerAddress = await addressRegistry.getAddress(
    bytes32("chainlinkRegistry")
  );
  const tvlManager = await ethers.getContractAt(
    "TVLManager",
    tvlManagerAddress
  );
  return tvlManager;
}

async function getStrategyAccountInfo(networkName) {
  const accountId = bytes32("alpha");
  const accountManager = await getAccountManager(networkName);
  const accountAddress = await accountManager.getAccount(bytes32("alpha"));
  console.logAddress("Strategy account", accountAddress);
  return [accountId, accountAddress];
}

async function getStablecoins(networkName) {
  const stablecoins = {};
  for (const symbol of ["DAI", "USDC", "USDT"]) {
    const tokenAddress = getStablecoinAddress(symbol, networkName);
    const token = await ethers.getContractAt("IDetailedERC20", tokenAddress);
    stablecoins[symbol] = token;
  }
  return stablecoins;
}

module.exports = {
  console,
  getStablecoins,
  getAddressRegistry,
  getAccountManager,
  getPoolManager,
  getTvlManager,
  getStrategyAccountInfo,
};
