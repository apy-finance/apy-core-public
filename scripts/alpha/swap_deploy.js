#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config();
const { argv } = require("yargs")
  .option("name", {
    type: "string",
    description: "Swap contract name",
  })
  .option("gasPrice", {
    type: "number",
    description: "Gas price in gwei; omitting uses GasNow value",
  })
  .demandOption(["name"]);
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { getGasPrice, getDeployedAddress } = require("../../utils/helpers");
const {
  SafeService,
  SafeEthersSigner,
} = require("@gnosis.pm/safe-ethers-adapters");

const MAINNET_SERVICE_URL = "https://safe-transaction.gnosis.io/";

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const swapContractName = argv.name;
  console.log("Swap contract name: %s", swapContractName);
  console.log("");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const signer = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", signer.address);
  console.log("");

  let balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance (deployer): %s", balance);
  console.log("");
  balance =
    (await ethers.provider.getBalance(signer.address)).toString() / 1e18;
  console.log("ETH balance (Safe signer): %s", balance);
  console.log("");

  const adminSafeAddress = getDeployedAddress("AdminSafe", networkName);
  const service = new SafeService(MAINNET_SERVICE_URL);
  const safeSigner = await SafeEthersSigner.create(
    adminSafeAddress,
    signer,
    service
  );

  console.log("Deploying swap ... ");
  console.log("");

  const swapContractFactory = await ethers.getContractFactory(swapContractName);
  let gasPrice = await getGasPrice(argv.gasPrice);
  const swap = await swapContractFactory.deploy({ gasPrice });
  const swapName = await swap.NAME();

  console.log("Registering %s", swapName);
  console.log("");

  const addressRegistryAddress = getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistryV2",
    addressRegistryAddress
  );
  const lpAccountAddress = await addressRegistry.lpAccountAddress();
  const lpAccount = await ethers.getContractAt("LpAccount", lpAccountAddress);
  gasPrice = await getGasPrice(argv.gasPrice);
  const proposedTx = await lpAccount
    .connect(safeSigner)
    .registerSwap(swap, { gasPrice });
  console.log("USER ACTION REQUIRED");
  console.log("Go to the Gnosis Safe Web App to confirm the transaction");
  await proposedTx.wait();
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Swap registered.");
      console.log("");
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      console.log("");
      process.exit(1);
    });
} else {
  module.exports = main;
}
