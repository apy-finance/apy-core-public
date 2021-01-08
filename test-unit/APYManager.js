const { assert, expect } = require("chai");
const hre = require("hardhat");
const { artifacts, contract, ethers, web3 } = hre;
const { expectRevert, send, ether } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const TransparentUpgradeableProxy = artifacts.require(
  "TransparentUpgradeableProxy"
);
const ProxyConstructorArg = artifacts.require("ProxyConstructorArg");
const APYManager = artifacts.require("APYManager");
const APYGenericExecutor = artifacts.require("APYGenericExecutor");
const Strategy = artifacts.require("Strategy");
const IDetailedERC20 = new ethers.utils.Interface(
  artifacts.require("IDetailedERC20").abi
);
const MockContract = artifacts.require("MockContract");

const bytes32 = ethers.utils.formatBytes32String;

contract("APYManager", async (accounts) => {
  const [deployer, admin, randomUser] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let manager;

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
    proxyAdmin = await ProxyAdmin.new({ from: deployer });
    logic = await APYManager.new({ from: deployer });
    const encodedArg = await (await ProxyConstructorArg.new()).getEncodedArg(
      proxyAdmin.address
    );
    proxy = await TransparentUpgradeableProxy.new(
      logic.address,
      proxyAdmin.address,
      encodedArg,
      {
        from: deployer,
      }
    );
    manager = await APYManager.at(proxy.address);
  });

  describe("Test Constructor", async () => {
    it("Revert when proxy admin is zero address", async () => {
      const encodedArg = await (await ProxyConstructorArg.new()).getEncodedArg(
        ZERO_ADDRESS
      );
      await expectRevert.unspecified(
        TransparentUpgradeableProxy.new(
          logic.address,
          ZERO_ADDRESS,
          encodedArg,
          {
            from: deployer,
          }
        )
      );
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await manager.owner(), deployer);
    });
  });

  describe("Setting admin address", async () => {
    it("Owner can set to valid address", async () => {
      await manager.setAdminAddress(randomUser, { from: deployer });
      assert.equal(await manager.proxyAdmin(), randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert.unspecified(
        manager.setAdminAddress(admin, { from: randomUser })
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert.unspecified(
        manager.setAdminAddress(ZERO_ADDRESS, { from: deployer })
      );
    });
  });

  describe("Asset allocation", async () => {
    describe.skip("Temporary implementation for Chainlink", async () => {
      it("Set and get token addresses", async () => {
        assert.isEmpty(await manager.getTokenAddresses());

        const FAKE_ADDRESS_1 = web3.utils.toChecksumAddress(
          "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
        );
        const FAKE_ADDRESS_2 = web3.utils.toChecksumAddress(
          "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
        );
        const tokenAddresses = [FAKE_ADDRESS_1, FAKE_ADDRESS_2];
        await manager.setTokenAddresses(tokenAddresses);
        assert.deepEqual(await manager.getTokenAddresses(), tokenAddresses);
      });

      it("deleteTokenAddresses", async () => {
        const FAKE_ADDRESS_1 = web3.utils.toChecksumAddress(
          "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
        );
        const FAKE_ADDRESS_2 = web3.utils.toChecksumAddress(
          "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
        );
        const tokenAddresses = [FAKE_ADDRESS_1, FAKE_ADDRESS_2];
        await manager.setTokenAddresses(tokenAddresses);

        await manager.deleteTokenAddresses();
        assert.isEmpty(await manager.getTokenAddresses());
      });

      it("balanceOf", async () => {
        const mockRegistry = await MockContract.new();
        await manager.setAddressRegistry(mockRegistry.address);
        await manager.setPoolIds([bytes32("pool 1"), bytes32("pool 2")]);

        const mockToken = await MockContract.new();
        const balanceOf = IDetailedERC20.encodeFunctionData("balanceOf", [
          ZERO_ADDRESS,
        ]);
        await mockToken.givenMethodReturnUint(balanceOf, 1);

        const balance = await manager.balanceOf(mockToken.address);
        expect(balance).to.bignumber.equal("2");
      });
    });

    it("symbolOf", async () => {
      const mockToken = await MockContract.new();
      const symbol = IDetailedERC20.encodeFunctionData("symbol", []);
      const mockString = web3.eth.abi.encodeParameter("string", "MOCK");
      await mockToken.givenMethodReturn(symbol, mockString);

      assert.equal(await manager.symbolOf(mockToken.address), "MOCK");
    });
  });

  describe("Strategy factory", async () => {
    let strategyLogic;
    let genericExecutor;
    let strategy;

    before("Deploy strategy", async () => {
      genericExecutor = await APYGenericExecutor.new({ from: deployer });
      strategyLogic = await Strategy.new(genericExecutor.address, {
        from: deployer,
      });
      await manager.setLibraryAddress(strategyLogic.address);

      const strategyAddress = await manager.deploy.call(
        genericExecutor.address,
        { from: deployer }
      );
      await manager.deploy(genericExecutor.address, { from: deployer });
      strategy = await Strategy.at(strategyAddress);
    });

    it("Strategy owner is manager", async () => {
      expect(await strategy.owner()).to.equal(manager.address);
    });

    it("Owner can call execute", async () => {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [manager.address],
      });
      await send.ether(deployer, manager.address, ether("1"));
      const interface = new ethers.utils.Interface(APYManager._json.abi);
      const method = interface.encodeFunctionData("balanceOf", [
        manager.address,
      ]);
      const step = [manager.address, method];
      await strategy.execute([step], { from: manager.address });
    });

    it("Revert when non-owner calls execute", async () => {
      const interface = new ethers.utils.Interface(APYManager._json.abi);
      const method = interface.encodeFunctionData("balanceOf", [
        manager.address,
      ]);
      const step = [manager.address, method];
      await expectRevert(
        strategy.execute([step], { from: deployer }),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        strategy.execute([step], { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });
});