#!/usr/bin/env node
/*
 * Command to run script:
 *
 * $ yarn hardhat --network <network name> run scripts/<script filename>
 *
 * Alternatively, to pass command-line arguments:
 *
 * $ HARDHAT_NETWORK=<network name> node scripts/<script filename> --arg1=val1 --arg2=val2
 */
require("dotenv").config({ path: "./alpha.env" });
const { argv } = require("yargs").option("gasPrice", {
  type: "number",
  description: "Gas price in gwei; omitting uses GasNow value",
});
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { BigNumber } = ethers;
const chalk = require("chalk");
const {
  getGasPrice,
  updateDeployJsons,
  bytes32,
  getDeployedAddress,
} = require("../../utils/helpers");
const fs = require("fs");

// eslint-disable-next-line no-unused-vars
async function main(argv) {
  await hre.run("compile");
  const networkName = network.name.toUpperCase();
  console.log("");
  console.log(`${networkName} selected`);
  console.log("");

  // const ADDRESS_REGISTRY_MNEMONIC = process.env.ADDRESS_REGISTRY_MNEMONIC;
  // const deployer = ethers.Wallet.fromMnemonic(
  //   ADDRESS_REGISTRY_MNEMONIC
  // ).connect(ethers.provider);
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  /* TESTING on localhost only
   * need to fund as there is no ETH on Mainnet for the deployer
   */
  if (networkName == "LOCALHOST") {
    const [funder] = await ethers.getSigners();
    const fundingTrx = await funder.sendTransaction({
      to: deployer.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await fundingTrx.wait();
  }

  const balance =
    (await ethers.provider.getBalance(deployer.address)).toString() / 1e18;
  console.log("ETH balance:", balance.toString());
  console.log("");

  console.log("");
  console.log("Deploying ...");
  console.log("");

  const AlphaDeployment = await ethers.getContractFactory(
    "AlphaDeployment",
    deployer
  );

  const deploy_data = {};
  const gasPrice = await getGasPrice(argv.gasPrice);

  const addressesFilename = "deployment-factory-addresses.json";
  const factoryAddresses = JSON.parse(
    fs.readFileSync(addressesFilename, "utf-8")
  );

  const addressRegistryAddress = await getDeployedAddress(
    "AddressRegistryProxy",
    networkName
  );
  const addressRegistry = await ethers.getContractAt(
    "AddressRegistry",
    addressRegistryAddress
  );
  console.log(
    "LP Safe: %s",
    await addressRegistry.getAddress(bytes32("lpSafe"))
  );
  console.log(
    "Admin Safe: %s",
    await addressRegistry.getAddress(bytes32("adminSafe"))
  );
  console.log(
    "Emergency Safe: %s",
    await addressRegistry.getAddress(bytes32("emergencySafe"))
  );

  const alphaDeployment = await AlphaDeployment.deploy(...factoryAddresses, {
    gasPrice,
  });
  console.log(
    "Deploy:",
    `https://etherscan.io/tx/${alphaDeployment.deployTransaction.hash}`
  );
  const receipt = await alphaDeployment.deployTransaction.wait();

  console.log(
    `https://etherscan.io/tx/${alphaDeployment.deployTransaction.hash}`
  );
  console.log("");
  console.log("Gas used so far: %s", receipt.gasUsed.toString());

  deploy_data["AlphaDeployment"] = AlphaDeployment.address;
  updateDeployJsons(networkName, deploy_data);

  // TODO: transfer ownerships to alphaDeployment for
  // - address registry
  // - address registry proxy admin
  // - pool proxy admin

  // TODO: cleanup - transfer ownerships back to admin safe
}

if (!module.parent) {
  main(argv)
    .then(() => {
      console.log("");
      console.log("Deployment successful.");
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
