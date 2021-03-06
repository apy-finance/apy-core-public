const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  getStablecoinAddress,
  acquireToken,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

async function sendErc20Tokens(symbol, amount, recipient, ethFunder) {
  if (!["DAI", "USDC", "USDT"].includes(symbol.toUpperCase())) {
    throw Error("Unsupported ERC20 token.");
  }
  const tokenAddress = getStablecoinAddress(symbol, "MAINNET");
  const token = await ethers.getContractAt("IDetailedERC20", tokenAddress);
  await acquireToken(WHALE_POOLS[symbol], recipient, token, amount, ethFunder);
}

describe("Contract: Erc20Allocation", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let adminSafe;
  let mApt;
  let lpAccount;

  /* contract factories */
  let Erc20Allocation;

  /* deployed contracts */
  let erc20Allocation;
  let tvlManager;

  // use EVM snapshots for test isolation
  let testSnapshotId;
  let suiteSnapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    testSnapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(testSnapshotId);
  });

  before(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  before(async () => {
    [deployer, emergencySafe, adminSafe, mApt, lpAccount] =
      await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IAddressRegistryV2").abi
    );

    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ILockingOracle").abi
    );
    await oracleAdapter.mock.lock.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for Erc20Allocation:
     * - emergencySafe (default admin role)
     * - adminSafe (admin role)
     * - mApt (contract role)
     */
    await addressRegistry.mock.mAptAddress.returns(mApt.address);
    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );

    Erc20Allocation = await ethers.getContractFactory(
      "Erc20Allocation",
      adminSafe
    );
    erc20Allocation = await Erc20Allocation.deploy(addressRegistry.address);

    /* These registered addresses are setup for roles in the
     * constructor for TvlManager:
     * - emergencySafe (emergency role, default admin role)
     * - adminSafe (admin role)
     */
    const TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);
    await tvlManager
      .connect(adminSafe)
      .registerAssetAllocation(erc20Allocation.address);
  });

  it("registerErc20Token(address)", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    await erc20Allocation["registerErc20Token(address)"](usdcAddress);
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [usdcAddress, "USDC", 6],
    ]);

    const allocationId = tvlManager.testEncodeAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
    expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

    expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
    const amount = tokenAmountToBigNumber(100, 6);
    await sendErc20Tokens("USDC", amount, lpAccount, deployer);
    expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
  });

  it("registerErc20Token(address,string)", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    await erc20Allocation["registerErc20Token(address,string)"](
      usdcAddress,
      "USDC"
    );
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [usdcAddress, "USDC", 6],
    ]);

    const allocationId = tvlManager.testEncodeAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
    expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

    expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
    const amount = tokenAmountToBigNumber(100, 6);
    await sendErc20Tokens("USDC", amount, lpAccount, deployer);
    expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
  });

  it("registerErc20Token(address,string,uint8)", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    await erc20Allocation["registerErc20Token(address,string,uint8)"](
      usdcAddress,
      "USDC",
      6
    );
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [usdcAddress, "USDC", 6],
    ]);

    const allocationId = tvlManager.testEncodeAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
    expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

    expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
    const amount = tokenAmountToBigNumber(100, 6);
    await sendErc20Tokens("USDC", amount, lpAccount, deployer);
    expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
  });

  it("removeErc20Token", async () => {
    const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
    const daiAddress = getStablecoinAddress("DAI", "MAINNET");

    await erc20Allocation["registerErc20Token(address)"](usdcAddress);
    await erc20Allocation["registerErc20Token(address)"](daiAddress);
    expect(await erc20Allocation.tokens()).to.have.lengthOf(2);

    const usdcId = tvlManager.testEncodeAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(usdcId)).to.equal("USDC");
    const daiId = tvlManager.testEncodeAssetAllocationId(
      erc20Allocation.address,
      1
    );
    expect(await tvlManager.symbolOf(daiId)).to.equal("DAI");

    await erc20Allocation.removeErc20Token(usdcAddress);
    expect(await erc20Allocation.tokens()).to.deep.equal([
      [daiAddress, "DAI", 18],
    ]);

    const allocationId = tvlManager.testEncodeAssetAllocationId(
      erc20Allocation.address,
      0
    );
    expect(await tvlManager.symbolOf(allocationId)).to.equal("DAI");
  });
});
