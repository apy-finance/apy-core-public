const hre = require("hardhat");
const { ethers, web3 } = hre;
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const { getAddress, impersonateAccount, setBalance } = require("./account.js");
const { getStablecoinAddress, getAggregatorAddress } = require("./address");
const { deployAggregator } = require("./aggregator");
const { getAssetAllocationValue } = require("./asset_allocation");
const { expectEventInTransaction } = require("./event");
const { getGasPrice, getMaxFee, getMaxPriorityFee } = require("./gas");
const {
  acquireToken,
  transferERC20Tokens,
  getERC20Balance,
  forciblySendEth,
} = require("./token");
const {
  bytes32,
  dai,
  erc20,
  tokenAmountToBigNumber,
  commify,
  formatUnits,
} = require("./unit");
const {
  deepEqual,
  updateTvlAfterTransfer,
  generateContractAddress,
} = require("./test-helper");
const {
  getSafeSigner,
  getAdminSafeSigner,
  getLpSafeSigner,
  getEmergencySafeSigner,
  waitForSafeTxReceipt,
} = require("./safe");
const {
  getEip1967Addresses,
  getProxyAdmin,
  getLogicContract,
} = require("./proxy");
const { getAddressRegistry, getRegisteredContract } = require("./registry");

console.debug = function () {
  if (!console.debugging) return;
  console.log.apply(this, arguments);
};

console.debugging = false;

const FAKE_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);
const ANOTHER_FAKE_ADDRESS = web3.utils.toChecksumAddress(
  "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
);

module.exports = {
  bytes32,
  dai,
  erc20,
  transferERC20Tokens,
  getERC20Balance,
  console,
  getAddress,
  impersonateAccount,
  setBalance,
  getStablecoinAddress,
  getAggregatorAddress,
  tokenAmountToBigNumber,
  commify,
  formatUnits,
  getGasPrice,
  acquireToken,
  forciblySendEth,
  deployAggregator,
  expectEventInTransaction,
  getAssetAllocationValue,
  ZERO_ADDRESS,
  MAX_UINT256,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  deepEqual,
  updateTvlAfterTransfer,
  generateContractAddress,
  getSafeSigner,
  getAdminSafeSigner,
  getEmergencySafeSigner,
  getLpSafeSigner,
  waitForSafeTxReceipt,
  getMaxFee,
  getMaxPriorityFee,
  getEip1967Addresses,
  getProxyAdmin,
  getLogicContract,
  getAddressRegistry,
  getRegisteredContract,
};
