const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
} = require("../utils/helpers");
const AggregatorV3Interface = artifacts.require("AggregatorV3Interface");
const IAddressRegistryV2 = artifacts.require("IAddressRegistryV2");
const IERC20 = artifacts.require(
  "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20"
);

describe("Contract: OracleAdapter", () => {
  // signers
  let deployer;
  let emergencySafe;
  let adminSafe;
  let mApt;
  let tvlManager;
  let randomUser;

  // contract factories
  let OracleAdapter;

  // deployed contracts
  let oracleAdapter;

  // mocks and constants
  let addressRegistryMock;
  let tvlAggMock;
  let assetAggMock_1;
  let assetAggMock_2;
  const assetAddress_1 = FAKE_ADDRESS;
  const assetAddress_2 = ANOTHER_FAKE_ADDRESS;
  const stalePeriod = 86400;
  const defaultLockPeriod = 10000;

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
    [
      deployer,
      emergencySafe,
      adminSafe,
      mApt,
      tvlManager,
      randomUser,
    ] = await ethers.getSigners();

    addressRegistryMock = await deployMockContract(
      deployer,
      IAddressRegistryV2.abi
    );

    await addressRegistryMock.mock.mAptAddress.returns(mApt.address);

    // These registered addresses are setup for roles in the
    // constructor for OracleAdapter
    await addressRegistryMock.mock.tvlManagerAddress.returns(
      tvlManager.address
    );
    await addressRegistryMock.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistryMock.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );

    tvlAggMock = await deployMockContract(deployer, AggregatorV3Interface.abi);
    assetAggMock_1 = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );
    assetAggMock_2 = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );
    const assets = [assetAddress_1, assetAddress_2];
    const sources = [assetAggMock_1.address, assetAggMock_2.address];

    OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    oracleAdapter = await OracleAdapter.deploy(
      addressRegistryMock.address,
      tvlAggMock.address,
      assets,
      sources,
      stalePeriod,
      defaultLockPeriod
    );
    await oracleAdapter.deployed();
  });

  describe("Constructor", () => {
    it("Revert on invalid address registry", async () => {
      const assets = [];
      const sources = [];
      const stalePeriod = 100;
      const defaultLockPeriod = 100;
      await expect(
        OracleAdapter.deploy(
          FAKE_ADDRESS,
          tvlAggMock.address,
          assets,
          sources,
          stalePeriod,
          defaultLockPeriod
        )
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Revert on invalid TVL agg", async () => {
      const assets = [];
      const sources = [];
      const stalePeriod = 100;
      const defaultLockPeriod = 100;
      await expect(
        OracleAdapter.deploy(
          addressRegistryMock.address,
          FAKE_ADDRESS,
          assets,
          sources,
          stalePeriod,
          defaultLockPeriod
        )
      ).to.be.revertedWith("INVALID_SOURCE");
    });

    it("Revert on non-contract source address", async () => {
      const agg = await deployMockContract(deployer, []);
      const token_1 = await deployMockContract(deployer, []);
      const token_2 = await deployMockContract(deployer, []);

      const assets = [token_1.address, token_2.address];
      const sources = [FAKE_ADDRESS, agg.address];
      const stalePeriod = 100;
      const defaultLockPeriod = 100;
      await expect(
        OracleAdapter.deploy(
          addressRegistryMock.address,
          tvlAggMock.address,
          assets,
          sources,
          stalePeriod,
          defaultLockPeriod
        )
      ).to.be.revertedWith("INVALID_SOURCE");
    });

    it("Revert on zero stalePeriod", async () => {
      const assets = [];
      const sources = [];
      const stalePeriod = 0;
      const defaultLockPeriod = 100;
      await expect(
        OracleAdapter.deploy(
          addressRegistryMock.address,
          tvlAggMock.address,
          assets,
          sources,
          stalePeriod,
          defaultLockPeriod
        )
      ).to.be.revertedWith("INVALID_STALE_PERIOD");
    });
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await oracleAdapter.DEFAULT_ADMIN_ROLE();
      const memberCount = await oracleAdapter.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await oracleAdapter.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("Contract role given to TVL Manager and mAPT", async () => {
      const CONTRACT_ROLE = await oracleAdapter.CONTRACT_ROLE();
      const memberCount = await oracleAdapter.getRoleMemberCount(CONTRACT_ROLE);
      expect(memberCount).to.equal(2);
      expect(await oracleAdapter.hasRole(CONTRACT_ROLE, tvlManager.address)).to
        .be.true;
      expect(await oracleAdapter.hasRole(CONTRACT_ROLE, mApt.address)).to.be
        .true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await oracleAdapter.EMERGENCY_ROLE();
      const memberCount = await oracleAdapter.getRoleMemberCount(
        EMERGENCY_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(await oracleAdapter.hasRole(EMERGENCY_ROLE, emergencySafe.address))
        .to.be.true;
    });

    it("Address registry is set", async () => {
      expect(await oracleAdapter.addressRegistry()).to.equal(
        addressRegistryMock.address
      );
    });

    it("Sources are set", async () => {
      expect(await oracleAdapter.tvlSource()).to.equal(tvlAggMock.address);
      expect(await oracleAdapter.assetSources(assetAddress_1)).to.equal(
        assetAggMock_1.address
      );
      expect(await oracleAdapter.assetSources(assetAddress_2)).to.equal(
        assetAggMock_2.address
      );
    });

    it("stalePeriod is set", async () => {
      expect(await oracleAdapter.chainlinkStalePeriod()).to.equal(stalePeriod);
    });

    it("defaultLockPeriod is set", async () => {
      expect(await oracleAdapter.defaultLockPeriod()).to.equal(
        defaultLockPeriod
      );
    });
  });

  describe("emergencySetAddressRegistry", () => {
    it("Cannot set to non-contract address", async () => {
      await expect(
        oracleAdapter
          .connect(emergencySafe)
          .emergencySetAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Emergency role can set", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetAddressRegistry(dummyContract.address);
      expect(await oracleAdapter.addressRegistry()).to.equal(
        dummyContract.address
      );
    });

    it("Revert when unpermissioned calls", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await expect(
        oracleAdapter
          .connect(randomUser)
          .emergencySetAddressRegistry(dummyContract.address)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("emergencySetTvlSource", () => {
    it("Cannot set to non-contract address", async () => {
      await expect(
        oracleAdapter.connect(emergencySafe).emergencySetTvlSource(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_SOURCE");
    });

    it("Emergency role can set", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetTvlSource(dummyContract.address);
      expect(await oracleAdapter.tvlSource()).to.equal(dummyContract.address);
    });

    it("Revert when unpermissioned calls", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await expect(
        oracleAdapter
          .connect(randomUser)
          .emergencySetTvlSource(dummyContract.address)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("emergencySetAssetSource", () => {
    it("Cannot set to non-contract address", async () => {
      const asset = FAKE_ADDRESS;
      const source = ANOTHER_FAKE_ADDRESS;
      await expect(
        oracleAdapter
          .connect(emergencySafe)
          .emergencySetAssetSource(asset, source)
      ).to.be.revertedWith("INVALID_SOURCE");
    });

    it("Emergency role can set", async () => {
      const asset = FAKE_ADDRESS;
      const dummyContract = await deployMockContract(deployer, []);
      const source = dummyContract.address;

      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetAssetSource(asset, source);
      expect(await oracleAdapter.assetSources(FAKE_ADDRESS)).to.equal(
        dummyContract.address
      );
    });

    it("Revert when unpermissioned calls", async () => {
      const asset = FAKE_ADDRESS;
      const dummyContract = await deployMockContract(deployer, []);
      const source = dummyContract.address;

      await expect(
        oracleAdapter.connect(randomUser).emergencySetAssetSource(asset, source)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("setAssetSources", () => {
    it("Cannot set to non-contract address", async () => {
      const assets = [FAKE_ADDRESS];
      const sources = [ANOTHER_FAKE_ADDRESS];
      await expect(
        oracleAdapter
          .connect(emergencySafe)
          .emergencySetAssetSources(assets, sources)
      ).to.be.revertedWith("INVALID_SOURCE");
    });

    it("Emergency role can set", async () => {
      const assets = [FAKE_ADDRESS];
      const dummyContract = await deployMockContract(deployer, []);
      const sources = [dummyContract.address];

      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetAssetSources(assets, sources);
      expect(await oracleAdapter.assetSources(FAKE_ADDRESS)).to.equal(
        dummyContract.address
      );
    });

    it("Revert when unpermissioned calls", async () => {
      const assets = [FAKE_ADDRESS];
      const dummyContract = await deployMockContract(deployer, []);
      const sources = [dummyContract.address];

      await expect(
        oracleAdapter
          .connect(randomUser)
          .emergencySetAssetSources(assets, sources)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("setChainlinkStalePeriod", () => {
    it("Cannot set to 0", async () => {
      await expect(
        oracleAdapter.connect(adminSafe).setChainlinkStalePeriod(0)
      ).to.be.revertedWith("INVALID_STALE_PERIOD");
    });

    it("Admin role can set", async () => {
      const period = 100;
      await oracleAdapter.connect(adminSafe).setChainlinkStalePeriod(period);
    });

    it("Revert when unpermissioned calls", async () => {
      await expect(
        oracleAdapter.connect(randomUser).setChainlinkStalePeriod(14400)
      ).to.be.revertedWith("NOT_ADMIN_ROLE");
    });
  });

  describe("setDefaultLockPeriod", () => {
    it("Revert when unpermissioned calls", async () => {
      const period = 100;
      await expect(
        oracleAdapter.connect(randomUser).setDefaultLockPeriod(period)
      ).to.be.revertedWith("NOT_ADMIN_ROLE");
    });

    it("Admin role can call", async () => {
      const period = 100;
      await expect(
        oracleAdapter.connect(adminSafe).setDefaultLockPeriod(period)
      ).to.not.be.reverted;
      expect(await oracleAdapter.defaultLockPeriod()).to.equal(period);
    });
  });

  describe("lock", () => {
    it("Revert when non-permissioned calls", async () => {
      await expect(oracleAdapter.connect(randomUser).lock()).to.be.revertedWith(
        "NOT_CONTRACT_ROLE"
      );
    });

    it("Contract role can call", async () => {
      await expect(oracleAdapter.connect(mApt).lock()).to.not.be.reverted;
      await expect(oracleAdapter.connect(tvlManager).lock()).to.not.be.reverted;
    });
  });

  describe("emergencyUnlock", () => {
    it("Revert when non-permissioned calls", async () => {
      await expect(
        oracleAdapter.connect(randomUser).emergencyUnlock()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Emergency role can call", async () => {
      await expect(oracleAdapter.connect(emergencySafe).emergencyUnlock()).to
        .not.be.reverted;
    });
  });

  describe("lockFor / isLocked", () => {
    const period = 100;

    it("Contract role can set", async () => {
      await expect(oracleAdapter.connect(mApt).lockFor(period)).to.not.be
        .reverted;
      expect(await oracleAdapter.isLocked()).to.be.true;

      await expect(oracleAdapter.connect(tvlManager).lockFor(period)).to.not.be
        .reverted;
      expect(await oracleAdapter.isLocked()).to.be.true;
    });

    it("Revert when non-permissioned calls", async () => {
      await expect(
        oracleAdapter.connect(randomUser).lockFor(period)
      ).to.be.revertedWith("NOT_CONTRACT_ROLE");
    });

    it("Cannot shorten locking period", async () => {
      await oracleAdapter.connect(mApt).lockFor(period);
      await expect(
        oracleAdapter.connect(mApt).lockFor(period - 1)
      ).to.be.revertedWith("CANNOT_SHORTEN_LOCK");
    });
  });

  describe("emergencySetTvl", () => {
    it("Emergency role can set", async () => {
      const value = 1;
      const period = 5;
      await expect(
        oracleAdapter.connect(emergencySafe).emergencySetTvl(value, period)
      ).to.not.be.reverted;
    });

    it("Revert when unpermissioned calls", async () => {
      const value = 1;
      const period = 5;
      await expect(
        oracleAdapter.connect(randomUser).emergencySetTvl(value, period)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("emergencyUnsetTvl", () => {
    it("Revert when TVL has not been set", async () => {
      expect(await oracleAdapter.hasTvlOverride()).to.be.false;
      await expect(oracleAdapter.connect(emergencySafe).emergencyUnsetTvl()).to
        .be.reverted;
    });

    it("Emergency role can unset", async () => {
      const value = 1;
      const period = 5;
      await oracleAdapter.connect(emergencySafe).emergencySetTvl(value, period);
      expect(await oracleAdapter.hasTvlOverride()).to.be.true;

      await expect(oracleAdapter.connect(emergencySafe).emergencyUnsetTvl()).to
        .not.be.reverted;
    });

    it("Revert when unpermissioned calls", async () => {
      const value = 1;
      const period = 5;
      await oracleAdapter.connect(emergencySafe).emergencySetTvl(value, period);
      await expect(
        oracleAdapter.connect(randomUser).emergencyUnsetTvl()
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("setAssetValue", () => {
    it("Emergency role can set", async () => {
      const value = 1;
      const period = 5;
      await expect(
        oracleAdapter
          .connect(emergencySafe)
          .emergencySetAssetValue(assetAddress_1, value, period)
      ).to.not.be.reverted;
    });

    it("Revert when unpermissioned calls", async () => {
      const value = 1;
      const period = 5;
      await expect(
        oracleAdapter
          .connect(randomUser)
          .emergencySetAssetValue(assetAddress_1, value, period)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("unsetAssetValue", () => {
    it("Revert when asset value has not been set", async () => {
      expect(await oracleAdapter.hasAssetOverride(assetAddress_1)).to.be.false;
      await expect(
        oracleAdapter.connect(deployer).emergencyUnsetAssetValue(assetAddress_1)
      ).to.be.reverted;
    });

    it("Emergency role can unset", async () => {
      const value = 1;
      const period = 5;
      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetAssetValue(assetAddress_1, value, period);
      expect(await oracleAdapter.hasAssetOverride(assetAddress_1)).to.be.true;

      await expect(
        oracleAdapter
          .connect(emergencySafe)
          .emergencyUnsetAssetValue(assetAddress_1)
      ).to.not.be.reverted;
      expect(await oracleAdapter.hasAssetOverride(assetAddress_1)).to.be.false;
    });

    it("Revert when unpermissioned calls", async () => {
      const value = 1;
      const period = 5;
      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetAssetValue(assetAddress_1, value, period);
      await expect(
        oracleAdapter
          .connect(randomUser)
          .emergencyUnsetAssetValue(assetAddress_1)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });
  });

  describe("getTvl", () => {
    const usdTvl = tokenAmountToBigNumber("25100123.87654321", "8");
    let mAptMock;

    beforeEach(async () => {
      mAptMock = await deployMockContract(deployer, IERC20.abi);
      await addressRegistryMock.mock.mAptAddress.returns(mAptMock.address);
    });

    it("Revert when TVL is negative", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;

      let price = -1;
      // setting the mock mines a block and advances time by 1 sec
      await tvlAggMock.mock.latestRoundData.returns(0, price, 0, updatedAt, 0);
      await expect(oracleAdapter.getTvl()).to.be.revertedWith("NEGATIVE_VALUE");
    });

    it("Revert when TVL is zero and mAPT totalSupply is non-zero", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;

      let price = 0;
      await mAptMock.mock.totalSupply.returns(1);
      // setting the mock mines a block and advances time by 1 sec
      await tvlAggMock.mock.latestRoundData.returns(0, price, 0, updatedAt, 0);
      await expect(oracleAdapter.getTvl()).to.be.revertedWith(
        "INVALID_ZERO_TVL"
      );
    });

    it("Return 0 when TVL is zero and mAPT totalSupply is zero", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;

      let price = 0;
      await mAptMock.mock.totalSupply.returns(0);
      // setting the mock mines a block and advances time by 1 sec
      await tvlAggMock.mock.latestRoundData.returns(0, price, 0, updatedAt, 0);
      expect(await oracleAdapter.getTvl()).to.be.equal(0);
    });

    it("Revert when update is too old", async () => {
      const stalePeriod = await oracleAdapter.chainlinkStalePeriod();
      const updatedAt = (await ethers.provider.getBlock()).timestamp;

      // setting the mock mines a block and advances time by 1 sec
      await tvlAggMock.mock.latestRoundData.returns(
        0,
        tokenAmountToBigNumber(50e6, 8),
        0,
        updatedAt,
        0
      );
      await ethers.provider.send("evm_increaseTime", [stalePeriod / 2]);
      await ethers.provider.send("evm_mine");
      await expect(oracleAdapter.getTvl()).to.not.be.reverted;

      await ethers.provider.send("evm_increaseTime", [stalePeriod / 2]);
      await ethers.provider.send("evm_mine");
      await expect(oracleAdapter.getTvl()).to.be.revertedWith(
        "CHAINLINK_STALE_DATA"
      );
    });

    it("Revert when locked", async () => {
      const lockPeriod = 10;
      await oracleAdapter.connect(mApt).lockFor(lockPeriod);
      await expect(oracleAdapter.getTvl()).to.be.revertedWith("ORACLE_LOCKED");
    });

    it("Call succeeds after lock period", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      await tvlAggMock.mock.latestRoundData.returns(0, usdTvl, 0, updatedAt, 0);
      // set tvlBlockEnd to 2 blocks ahead
      const lockPeriod = 2;
      await oracleAdapter.connect(mApt).lockFor(lockPeriod);

      await timeMachine.advanceBlock();
      await expect(oracleAdapter.getTvl()).to.be.revertedWith("ORACLE_LOCKED");
      await timeMachine.advanceBlock();
      await expect(oracleAdapter.getTvl()).to.not.be.reverted;
    });

    it("Call succeeds after unlock", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      await tvlAggMock.mock.latestRoundData.returns(0, usdTvl, 0, updatedAt, 0);
      const lockPeriod = 100;
      await oracleAdapter.connect(mApt).lockFor(lockPeriod);

      await expect(oracleAdapter.getTvl()).to.be.revertedWith("ORACLE_LOCKED");

      await oracleAdapter.connect(emergencySafe).emergencyUnlock();
      await expect(oracleAdapter.getTvl()).to.not.be.reverted;
    });

    it("Use manual submission when active", async () => {
      const chainlinkValue = tokenAmountToBigNumber(110e6, 8);
      const manualValue = tokenAmountToBigNumber(75e6, 8);

      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      // setting the mock mines a block and advances time by 1 sec
      await tvlAggMock.mock.latestRoundData.returns(
        0,
        chainlinkValue,
        0,
        updatedAt,
        0
      );
      expect(await oracleAdapter.getTvl()).to.equal(chainlinkValue);

      await oracleAdapter.connect(mApt).lockFor(5);
      const activePeriod = 2;
      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetTvl(manualValue, activePeriod); // advances 1 block

      // TVL lock takes precedence over manual submission
      await expect(oracleAdapter.getTvl()).to.be.reverted;

      await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // advances 1 block
      // Manual submission takes precedence over Chainlink
      expect(await oracleAdapter.getTvl()).to.equal(manualValue);

      // Fallback to Chainlink when manual submission expires
      await ethers.provider.send("evm_mine"); // advances block past expiry
      expect(await oracleAdapter.getTvl()).to.equal(chainlinkValue);
    });
  });

  describe("getAssetPrice", () => {
    const usdTvl = tokenAmountToBigNumber("25100123.87654321", "8");

    it("Revert when price is non-positive", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      let price = -1;
      // setting the mock mines a block and advances time by 1 sec
      await assetAggMock_1.mock.latestRoundData.returns(
        0,
        price,
        0,
        updatedAt,
        0
      );
      await expect(
        oracleAdapter.getAssetPrice(assetAddress_1)
      ).to.be.revertedWith("NEGATIVE_VALUE");

      price = 0;
      // setting the mock mines a block and advances time by 1 sec
      await assetAggMock_1.mock.latestRoundData.returns(
        0,
        price,
        0,
        updatedAt,
        0
      );
      await expect(
        oracleAdapter.getAssetPrice(assetAddress_1)
      ).to.be.revertedWith("MISSING_ASSET_VALUE");
    });

    it("Revert when update is too old", async () => {
      const stalePeriod = await oracleAdapter.chainlinkStalePeriod();
      const updatedAt = (await ethers.provider.getBlock()).timestamp;

      // setting the mock mines a block and advances time by 1 sec
      await assetAggMock_1.mock.latestRoundData.returns(
        0,
        tokenAmountToBigNumber(50e6, 8),
        0,
        updatedAt,
        0
      );
      await ethers.provider.send("evm_increaseTime", [stalePeriod / 2]);
      await ethers.provider.send("evm_mine");
      await expect(oracleAdapter.getAssetPrice(assetAddress_1)).to.not.be
        .reverted;

      await ethers.provider.send("evm_increaseTime", [stalePeriod / 2]);
      await ethers.provider.send("evm_mine");
      await expect(
        oracleAdapter.getAssetPrice(assetAddress_1)
      ).to.be.revertedWith("CHAINLINK_STALE_DATA");
    });

    it("Revert when locked", async () => {
      const lockPeriod = 10;
      await oracleAdapter.connect(mApt).lockFor(lockPeriod);
      await expect(
        oracleAdapter.getAssetPrice(assetAddress_1)
      ).to.be.revertedWith("ORACLE_LOCKED");
    });

    it("Call succeeds after lock period", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      await assetAggMock_1.mock.latestRoundData.returns(
        0,
        usdTvl,
        0,
        updatedAt,
        0
      );
      // set tvlBlockEnd to 2 blocks ahead
      const lockPeriod = 2;
      await oracleAdapter.connect(mApt).lockFor(lockPeriod);

      await timeMachine.advanceBlock();
      await expect(
        oracleAdapter.getAssetPrice(assetAddress_1)
      ).to.be.revertedWith("ORACLE_LOCKED");
      await timeMachine.advanceBlock();
      await expect(oracleAdapter.getAssetPrice(assetAddress_1)).to.not.be
        .reverted;
    });

    it("Call succeeds after unlock", async () => {
      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      await assetAggMock_1.mock.latestRoundData.returns(
        0,
        usdTvl,
        0,
        updatedAt,
        0
      );
      const lockPeriod = 100;
      await oracleAdapter.connect(mApt).lockFor(lockPeriod);

      await expect(
        oracleAdapter.getAssetPrice(assetAddress_1)
      ).to.be.revertedWith("ORACLE_LOCKED");

      await oracleAdapter.connect(emergencySafe).emergencyUnlock();
      await expect(oracleAdapter.getAssetPrice(assetAddress_1)).to.not.be
        .reverted;
    });

    it("Use manual submission when active", async () => {
      const chainlinkValue = tokenAmountToBigNumber(1.07, 8);
      const manualValue = tokenAmountToBigNumber(1, 8);

      const updatedAt = (await ethers.provider.getBlock()).timestamp;
      // setting the mock mines a block and advances time by 1 sec
      await assetAggMock_1.mock.latestRoundData.returns(
        0,
        chainlinkValue,
        0,
        updatedAt,
        0
      );
      expect(await oracleAdapter.getAssetPrice(assetAddress_1)).to.equal(
        chainlinkValue
      );

      await oracleAdapter.connect(mApt).lockFor(5);
      const activePeriod = 2;
      await oracleAdapter
        .connect(emergencySafe)
        .emergencySetAssetValue(assetAddress_1, manualValue, activePeriod); // advances 1 block

      // TVL lock takes precedence over manual submission
      await expect(oracleAdapter.getAssetPrice(assetAddress_1)).to.be.reverted;

      await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // advances 1 block
      // Manual submission takes precedence over Chainlink
      expect(await oracleAdapter.getAssetPrice(assetAddress_1)).to.equal(
        manualValue
      );

      // Fallback to Chainlink when manual submission expires
      await ethers.provider.send("evm_mine"); // advances block past expiry
      expect(await oracleAdapter.getAssetPrice(assetAddress_1)).to.equal(
        chainlinkValue
      );
    });
  });
});
