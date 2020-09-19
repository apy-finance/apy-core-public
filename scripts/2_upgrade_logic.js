require('dotenv').config();
const { CHAIN_IDS, DEPLOYS_JSON } = require('../utils/constants.js')
const { updateDeployJsons } = require('../utils/helpers.js')

const PROXY_ADMIN_ADDRESSES = require(DEPLOYS_JSON['ProxyAdmin'])
const APY_LIQUIDITY_POOL_PROXY_ADDRESSES = require(DEPLOYS_JSON['APYLiquidityPoolProxy'])

const ContractData = artifacts.require(
  "APYLiquidityPoolImplementation"
);

async function main() {
  const NETWORK_NAME = network.name.toUpperCase()
  console.log(`${NETWORK_NAME} selected`)

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin")
  const APYLiquidityPoolImplementation = await ethers.getContractFactory("APYLiquidityPoolImplementation")
  const APYLiquidityPoolProxy = await ethers.getContractFactory("APYLiquidityPoolProxy")

  const proxyAdmin = await ProxyAdmin.attach(PROXY_ADMIN_ADDRESSES[CHAIN_IDS[NETWORK_NAME]])

  const newLogic = await APYLiquidityPoolImplementation.deploy()
  await newLogic.deployed()
  console.log(`New Implementation Logic: ${newLogic.address}`)

  const proxy = await APYLiquidityPoolProxy.attach(APY_LIQUIDITY_POOL_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]])

  const iImplementation = new ethers.utils.Interface(ContractData.abi);
  const initData = iImplementation.encodeFunctionData("initializeUpgrade", [])

  // NOTE: Select 1 of the following
  await proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)
  // await proxyAdmin.upgrade(proxy.address, newLogic.address)

  //Update Jsons
  let deploy_data = {}
  deploy_data['APYLiquidityPoolImplementation'] = newLogic.address
  await updateDeployJsons(NETWORK_NAME, deploy_data)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });