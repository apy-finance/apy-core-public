require("dotenv").config();
const { ethers, network } = require("hardhat");
const { TOKEN_AGG_MAP } = require("../utils/constants.js");
const { updateDeployJsons } = require("../utils/helpers.js");

async function main() {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log(`${NETWORK_NAME} selected`);

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  const APYPoolToken = await ethers.getContractFactory("APYPoolToken");
  const APYPoolTokenProxy = await ethers.getContractFactory(
    "APYPoolTokenProxy"
  );

  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  console.log(`ProxyAdmin: ${proxyAdmin.address}`);

  let deploy_data = {};
  deploy_data["APYPoolTokenProxyAdmin"] = proxyAdmin.address;

  for (const { symbol, token, aggregator } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    console.log("");
    console.log(`Deploying contracts for ${symbol}`);
    console.log(`    --> ${aggregator} Chainlink Oracle Agg`);

    const logic = await APYPoolToken.deploy();
    await logic.deployed();
    console.log(`Implementation Logic: ${logic.address}`);

    const proxy = await APYPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      token,
      aggregator
    );
    await proxy.deployed();
    console.log(`Proxy: ${proxy.address}`);

    deploy_data[symbol + "_APYPoolToken"] = logic.address;
    deploy_data[symbol + "_APYPoolTokenProxy"] = proxy.address;

    const instance = await APYPoolToken.attach(proxy.address);
    await instance.lock();
    console.log(`${symbol} pool locked.`);
  }

  await updateDeployJsons(NETWORK_NAME, deploy_data);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
