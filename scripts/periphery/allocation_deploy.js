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
    description: "Allocation contract name",
  })
  .option("compile", {
    type: "boolean",
    default: true,
    description: "Compile contract using `compile:one`",
  })
  .option("metapool", {
    type: "boolean",
    default: false,
    description: "Use metapool allocation deploy",
  })
  .demandOption(["name"]);
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const {
  getAdminSafeSigner,
  waitForSafeTxReceipt,
  ZERO_ADDRESS,
  getRegisteredContract,
} = require("../../utils/helpers");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  const name = argv.name;
  let allocationContractName = name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  allocationContractName += "Allocation";
  console.log("Allocation contract name: %s", allocationContractName);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("");

  if (!process.env.SAFE_OWNER_KEY) {
    throw new Error("Must set SAFE_OWNER_KEY env var.");
  }
  const owner = new ethers.Wallet(process.env.SAFE_OWNER_KEY, ethers.provider);
  console.log("Safe owner: %s", owner.address);
  console.log("");

  let balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance (deployer): %s", balance);
  console.log("");
  balance = (await ethers.provider.getBalance(owner.address)).toString() / 1e18;
  console.log("ETH balance (Safe owner): %s", balance);
  console.log("");

  const safeSigner = await getAdminSafeSigner(networkName);

  if (argv.compile) {
    await hre.run("clean");
    await hre.run("compile");
    await hre.run("compile:one", { contractName: allocationContractName });
  }

  const tvlManager = await getRegisteredContract("tvlManager");

  console.log("Deploying allocation ... ");
  console.log("");

  const allocationContractFactory = await ethers.getContractFactory(
    allocationContractName
  );
  const curve3poolAllocationAddress = await tvlManager.getAssetAllocation(
    "curve-3pool"
  );
  if (curve3poolAllocationAddress == ZERO_ADDRESS) {
    throw new Error("3poolAllocation address is missing.");
  }
  let allocation;
  if (argv.metapool) {
    console.log(
      "Constructor arg (3pool allocation): %s",
      curve3poolAllocationAddress
    );
    allocation = await allocationContractFactory
      .connect(safeSigner)
      .deploy(curve3poolAllocationAddress);
  } else {
    allocation = await allocationContractFactory.connect(safeSigner).deploy();
  }
  const receipt = await waitForSafeTxReceipt(
    allocation.deployTransaction,
    safeSigner.service
  );
  const allocationAddress = receipt.contractAddress;
  if (!allocationAddress) {
    throw new Error("Allocation address is missing.");
  }
  console.log("Allocation address: %s", allocationAddress);

  allocation = await ethers.getContractAt(
    allocationContractName,
    allocationAddress
  );
  const allocationName = await allocation.NAME();
  console.log("Registering %s", allocationName);
  console.log("");

  const proposedTx = await tvlManager
    .connect(safeSigner)
    .registerAssetAllocation(allocationAddress);
  await waitForSafeTxReceipt(proposedTx, safeSigner.service);

  console.log("Verifying on Etherscan ...");
  if (argv.metapool) {
    await hre.run("verify:verify", {
      address: allocationAddress,
      constructorArguments: [curve3poolAllocationAddress],
    });
  } else {
    await hre.run("verify:verify", {
      address: allocationAddress,
    });
  }
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Allocation registered.");
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
