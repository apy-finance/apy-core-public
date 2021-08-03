const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS, bytes32 } = require("../utils/helpers");

describe("Contract: TvlManager", () => {
  // signers
  let deployer;
  let poolManager;
  let lpSafe;
  let emergencySafe;
  let randomUser;

  // contract factories
  let TvlManager;

  // deployed contracts
  let tvlManager;
  // mocks
  let addressRegistry;
  let erc20Allocation;
  let oracleAdapter;
  let erc20Mock;

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
      poolManager,
      lpSafe,
      emergencySafe,
      randomUser,
    ] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IAddressRegistryV2").abi
    );

    oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IOracleAdapter").abi
    );
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );
    await oracleAdapter.mock.lock.returns();

    // These registered addresses are setup for roles in the
    // constructor for TvlManager
    await addressRegistry.mock.poolManagerAddress.returns(poolManager.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    erc20Allocation = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("Erc20Allocation").abi
    );
    erc20Mock = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IDetailedERC20").abi
    );
    await erc20Mock.mock.symbol.returns("MOCK");
    await erc20Mock.mock.decimals.returns(6);
    await erc20Mock.mock.balanceOf.withArgs(randomUser.address).returns(123e6);
    await erc20Allocation.mock.tokens.returns([
      { token: erc20Mock.address, symbol: "MOCK", decimals: 6 },
    ]);

    TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(
      addressRegistry.address,
      erc20Allocation.address
    );
    await tvlManager.deployed();
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await tvlManager.DEFAULT_ADMIN_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await tvlManager.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await tvlManager.EMERGENCY_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(EMERGENCY_ROLE, emergencySafe.address)).to
        .be.true;
    });

    it("Contract role given to Pool Manager", async () => {
      const CONTRACT_ROLE = await tvlManager.CONTRACT_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(CONTRACT_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(CONTRACT_ROLE, poolManager.address)).to.be
        .true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await tvlManager.LP_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("ERC20 Allocation is registered", async () => {
      // expected ID count is 1, since only ERC20 allocation is registered
      // and it has one token added
      expect(await tvlManager.testGetAssetAllocationIdCount()).to.equal(1);
      // sanity check: should be zero count after removal
      await tvlManager
        .connect(lpSafe)
        .removeAssetAllocation(erc20Allocation.address);
      expect(await tvlManager.testGetAssetAllocationIdCount()).to.equal(0);
    });
  });

  describe("Asset allocation IDs", () => {
    describe("encodeAssetAllocationId", () => {
      it("should pack the address and index into a bytes32", async () => {
        const address = randomUser.address;
        const tokenIndex = 2;

        const result = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );

        const pack = ethers.utils.solidityPack(
          ["address", "uint8"],
          [address, tokenIndex]
        );
        const id = `${pack}0000000000000000000000`;
        expect(result).to.equal(id);
      });
    });

    describe("decodeAssetAllocationId", () => {
      it("should decode an ID into an address and index", async () => {
        const address = randomUser.address;
        const tokenIndex = 2;
        const id = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );
        const result = await tvlManager.testDecodeAssetAllocationId(id);
        expect(result).to.deep.equal([address, tokenIndex]);
      });

      it("should decode an ID when the index is large", async () => {
        const address = randomUser.address;
        const tokenIndex = 200;
        const id = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );
        const result = await tvlManager.testDecodeAssetAllocationId(id);
        expect(result).to.deep.equal([address, tokenIndex]);
      });

      it("should decode an ID when the address is zero", async () => {
        const address = ZERO_ADDRESS;
        const tokenIndex = 200;
        const id = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );
        const result = await tvlManager.testDecodeAssetAllocationId(id);
        expect(result).to.deep.equal([address, tokenIndex]);
      });
    });
  });
});
