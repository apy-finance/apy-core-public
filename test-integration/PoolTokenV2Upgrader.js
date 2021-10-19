const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const {
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
  getDeployedAddress,
  getStablecoinAddress,
  acquireToken,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");
const timeMachine = require("ganache-time-traveler");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

describe.only("Contract: PoolTokenV2Upgrader", () => {
  // signers
  let deployer;

  // contract factories
  let PoolTokenV2Upgrader;

  // deployed factories
  let poolTokenV2Factory;

  let poolProxyAdminAddress;

  // deployed contracts
  let upgrader;

  // Mainnet contracts
  let adminSafe;
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Get signers", async () => {
    [deployer] = await ethers.getSigners();
  });

  before("Attach to Mainnet Admin Safe and Address Registry", async () => {
    const adminSafeAddress = getDeployedAddress("AdminSafe", "MAINNET");
    adminSafe = await ethers.getContractAt(
      "IGnosisModuleManager",
      adminSafeAddress
    );

    addressRegistry = await ethers.getContractAt(
      "AddressRegistryV2",
      MAINNET_ADDRESS_REGISTRY
    );
  });

  before("Deploy factories", async () => {
    const PoolTokenV2Factory = await ethers.getContractFactory(
      "PoolTokenV2Factory"
    );
    poolTokenV2Factory = await PoolTokenV2Factory.deploy();

    PoolTokenV2Upgrader = await ethers.getContractFactory(
      "PoolTokenV2Upgrader"
    );
  });

  before("Deploy upgrader", async () => {
    upgrader = await PoolTokenV2Upgrader.deploy(
      poolTokenV2Factory.address // pool token v2 factory
    );
  });

  before("Transfer necessary ownerships to Admin Safe", async () => {
    poolProxyAdminAddress = getDeployedAddress(
      "PoolTokenProxyAdmin",
      "MAINNET"
    );
    const poolProxyAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      poolProxyAdminAddress
    );
    const poolDeployerAddress = await poolProxyAdmin.owner();
    const poolDeployer = await impersonateAccount(poolDeployerAddress);
    await forciblySendEth(
      poolDeployer.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    await poolProxyAdmin
      .connect(poolDeployer)
      .transferOwnership(adminSafe.address);
  });

  before("Mock any needed dependencies", async () => {
    // In addition to satisfying the initializer for PoolTokenV2,
    // which requires an mAPT address for contract role, `redeem`
    // in V2 requires mAPT to provide a deployed value.
    const mApt = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("MetaPoolToken").abi
    );
    await mApt.mock.getDeployedValue.returns(0);

    const owner = await addressRegistry.owner();
    const signer = await impersonateAccount(owner);
    await forciblySendEth(
      signer.address,
      tokenAmountToBigNumber(1),
      deployer.address
    );

    await addressRegistry
      .connect(signer)
      .registerAddress(bytes32("mApt"), mApt.address);
  });

  describe("Defaults", () => {
    it("Address Registry is set", async () => {
      expect(await upgrader.addressRegistry()).to.equal(
        MAINNET_ADDRESS_REGISTRY
      );
    });
  });

  describe("Upgrade", () => {
    it("Revert if upgrader isn't funded with stable", async () => {
      await expect(upgrader.upgradeDaiPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
      await expect(upgrader.upgradeUsdcPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
      await expect(upgrader.upgradeUsdtPool()).to.be.revertedWith(
        "FUND_UPGRADER_WITH_STABLE"
      );
    });

    it("Revert if upgrader is not enabled module", async () => {
      // fund upgrader with USDC
      const usdcToken = await ethers.getContractAt(
        "IDetailedERC20",
        getStablecoinAddress("USDC", "MAINNET")
      );
      await acquireToken(
        WHALE_POOLS["USDC"],
        upgrader.address,
        usdcToken,
        tokenAmountToBigNumber("100", 6),
        deployer.address
      );

      await expect(upgrader.upgradeUsdcPool()).to.be.revertedWith(
        "Method can only be called from an enabled module"
      );
    });

    it("Can upgrade", async () => {
      // fund upgrader with stables
      for (const symbol of ["DAI", "USDC", "USDT"]) {
        const token = await ethers.getContractAt(
          "IDetailedERC20",
          getStablecoinAddress(symbol, "MAINNET")
        );
        const decimals = await token.decimals();
        await acquireToken(
          WHALE_POOLS[symbol],
          upgrader.address,
          token,
          tokenAmountToBigNumber("271.828182", decimals),
          deployer.address
        );
      }

      // enable upgrader as module
      const adminSafeSigner = await impersonateAccount(adminSafe);
      await forciblySendEth(
        adminSafe.address,
        tokenAmountToBigNumber(1),
        deployer.address
      );
      await adminSafe.connect(adminSafeSigner).enableModule(upgrader.address);

      await expect(upgrader.upgradeAll()).to.not.be.reverted;
    });
  });
});
