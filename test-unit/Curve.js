const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { tokenAmountToBigNumber } = require("../utils/helpers");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const IStableSwap = artifacts.require("IStableSwap");
const ILiquidityGauge = artifacts.require("ILiquidityGauge");

describe("Contract: CurveAllocationBase", () => {
  // signers
  let deployer;
  let Account;

  // contract factories
  let CurveAllocationBase;

  // deployed contracts
  let curve;

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
    [deployer, Account] = await ethers.getSigners();
    CurveAllocationBase = await ethers.getContractFactory(
      "CurveAllocationBase"
    );
    curve = await CurveAllocationBase.deploy();
    await curve.deployed();
  });

  describe("getUnderlyerBalance", () => {
    let stableSwapMock;
    let lpTokenMock;
    let liquidityGaugeMock;

    const coinIndex = 0;

    before(async () => {
      lpTokenMock = await deployMockContract(deployer, IDetailedERC20.abi);

      stableSwapMock = await deployMockContract(deployer, IStableSwap.abi);
      // await stableSwapMock.mock.lp_token.returns(lpTokenMock.address);

      liquidityGaugeMock = await deployMockContract(
        deployer,
        ILiquidityGauge.abi
      );
    });

    it("Get underlyer balance from Account holding", async () => {
      // setup stableswap with underlyer balance
      const poolBalance = tokenAmountToBigNumber(1000);
      await stableSwapMock.mock.balances.returns(poolBalance);
      // setup LP token with supply and Account balance
      const lpTotalSupply = tokenAmountToBigNumber(1234);
      await lpTokenMock.mock.totalSupply.returns(lpTotalSupply);
      const AccountLpBalance = tokenAmountToBigNumber(518);
      await lpTokenMock.mock.balanceOf
        .withArgs(Account.address)
        .returns(AccountLpBalance);
      // setup gauge with Account balance
      await liquidityGaugeMock.mock.balanceOf
        .withArgs(Account.address)
        .returns(0);

      const expectedBalance = AccountLpBalance.mul(poolBalance).div(
        lpTotalSupply
      );

      const balance = await curve.getUnderlyerBalance(
        Account.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        lpTokenMock.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      // setup stableswap with underlyer balance
      const poolBalance = tokenAmountToBigNumber(1000);
      await stableSwapMock.mock.balances.returns(poolBalance);
      // setup LP token with supply and Account balance
      const lpTotalSupply = tokenAmountToBigNumber(1234);
      await lpTokenMock.mock.totalSupply.returns(lpTotalSupply);
      await lpTokenMock.mock.balanceOf.withArgs(Account.address).returns(0);
      // setup gauge with Account balance
      const gaugeLpBalance = tokenAmountToBigNumber(256);
      await liquidityGaugeMock.mock.balanceOf
        .withArgs(Account.address)
        .returns(gaugeLpBalance);

      const expectedBalance = gaugeLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        Account.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        lpTokenMock.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from combined holdings", async () => {
      // setup stableswap with underlyer balance
      const poolBalance = tokenAmountToBigNumber(1000);
      await stableSwapMock.mock.balances.returns(poolBalance);
      // setup LP token with supply and Account balance
      const lpTotalSupply = tokenAmountToBigNumber(1234);
      await lpTokenMock.mock.totalSupply.returns(lpTotalSupply);
      const AccountLpBalance = tokenAmountToBigNumber(51);
      await lpTokenMock.mock.balanceOf
        .withArgs(Account.address)
        .returns(AccountLpBalance);
      // setup gauge with Account balance
      const gaugeLpBalance = tokenAmountToBigNumber(256);
      await liquidityGaugeMock.mock.balanceOf
        .withArgs(Account.address)
        .returns(gaugeLpBalance);

      const lpBalance = AccountLpBalance.add(gaugeLpBalance);
      const expectedBalance = lpBalance.mul(poolBalance).div(lpTotalSupply);

      const balance = await curve.getUnderlyerBalance(
        Account.address,
        stableSwapMock.address,
        liquidityGaugeMock.address,
        lpTokenMock.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });
  });
});
