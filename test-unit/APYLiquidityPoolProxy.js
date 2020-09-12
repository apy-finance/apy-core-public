const { ethers, artifacts, contract } = require("@nomiclabs/buidler");
const timeMachine = require("ganache-time-traveler");
const MockContract = artifacts.require("MockContract");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);

contract("APYLiquidityPoolProxy Unit Test", async (accounts) => {
  const [owner] = accounts;

  let proxyAdmin
  let logic
  let proxy

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    proxyAdmin = await ProxyAdmin.new({ from: owner })
    logic = await APYLiquidityPoolImplementation.new({ from: owner });
    proxy = await APYLiquidityPoolProxy.new(logic.address, proxyAdmin.address, { from: owner });

    // instance = await APYLiquidityPoolImplementation.at(proxy.address);
  });

  describe("Test Defaults", async () => {
    it("Test Proxy's Admin", async () => {
      assert.equal(await proxyAdmin.owner.call(), owner)
    })

    it("Test Proxy's Implementation", async () => {
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, { from: owner }),
        logic.address
      )
    })
  })

  describe("Test Setters", async () => {
    it("Test Proxy Upgrade Implementation", async () => {
      const newLogic = await MockContract.new({ from: owner })
      await proxyAdmin.upgrade(proxy.address, newLogic.address, { from: owner })
      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, { from: owner }),
        newLogic.address
      )
    })

    it("Test Proxy Upgrade Implementation and Initialize", async () => {
      const newLogic = await MockContract.new({ from: owner })
      const iProxy = new ethers.utils.Interface(APYLiquidityPoolProxy.abi);
      const initData = iProxy.encodeFunctionData("upgradeWithInitialize", [newLogic.address])
      await proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)

      assert.equal(
        await proxyAdmin.getProxyImplementation.call(proxy.address, { from: owner }),
        newLogic.address
      )
    })
  })
})