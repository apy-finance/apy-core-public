const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  acquireToken,
  getStablecoinAddress,
  MAX_UINT256,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");
const IStableSwap = artifacts.readArtifactSync("IStableSwap");
const IMetaPool = artifacts.readArtifactSync("IMetaPool");
const ILiquidityGauge = artifacts.readArtifactSync("ILiquidityGauge");

// UST Metapool addresses
const META_POOL_ADDRESS = "0x890f4e345B1dAED0367A877a1612f86A1f86985f";
// sometimes a metapool is its own LP token; otherwise,
// you can obtain from `token` attribute
const LP_TOKEN_ADDRESS = "0x94e131324b6054c0D789b190b2dAC504e4361b53";
const LIQUIDITY_GAUGE_ADDRESS = "0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855";

// 3Pool addresses:
const BASE_POOL_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const BASE_LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";

// metapool primary underlyer
const UST_ADDRESS = "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD";
// uniswap MIR_UST pool
const UST_WHALE_ADDRESS = "0x87dA823B6fC8EB8575a235A824690fda94674c88";

describe("Contract: MetaPoolAllocationBaseV2", () => {
  // signers
  let deployer;
  let lpSafe;

  // contract factories
  let MetaPoolAllocationBaseV2;

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
    [deployer, lpSafe] = await ethers.getSigners();
    MetaPoolAllocationBaseV2 = await ethers.getContractFactory(
      "CurveUstAllocationV2"
    );
    curve = await MetaPoolAllocationBaseV2.deploy();
    await curve.deployed();
  });

  describe("getUnderlyerBalance", () => {
    // UST metapool
    let metaPool;
    let lpToken;
    let gauge;
    // 3Pool is the base pool
    let basePool;
    let baseLpToken;

    const coins = {};

    before("Setup contracts", async () => {
      baseLpToken = await ethers.getContractAt(
        IDetailedERC20.abi,
        BASE_LP_TOKEN_ADDRESS
      );
      basePool = await ethers.getContractAt(IStableSwap.abi, BASE_POOL_ADDRESS);

      metaPool = await ethers.getContractAt(IMetaPool.abi, META_POOL_ADDRESS);
      lpToken = await ethers.getContractAt(
        IDetailedERC20.abi,
        LP_TOKEN_ADDRESS
      );
      gauge = await ethers.getContractAt(
        ILiquidityGauge.abi,
        LIQUIDITY_GAUGE_ADDRESS
      );
    });

    beforeEach("Fund LP Safe with tokens", async () => {
      for (const symbol of ["DAI", "USDC", "USDT"]) {
        const stablecoinAddress = getStablecoinAddress(symbol, "MAINNET");
        coins[symbol] = await ethers.getContractAt(
          "IDetailedERC20",
          stablecoinAddress
        );
        const token = coins[symbol];
        const decimals = await token.decimals();
        const amount = tokenAmountToBigNumber("10000", decimals);
        const sender = WHALE_POOLS[symbol];
        await acquireToken(sender, lpSafe, token, amount, deployer);
      }
      coins["UST"] = await ethers.getContractAt("IDetailedERC20", UST_ADDRESS);
      const token = coins["UST"];
      const decimals = await token.decimals();
      const amount = tokenAmountToBigNumber("10000", decimals);
      const sender = UST_WHALE_ADDRESS;
      await acquireToken(sender, lpSafe, token, amount, deployer);
    });

    it("Get zero 3Pool underlyer balance when no holdings", async () => {
      const daiIndex = 1;
      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        daiIndex
      );
      expect(balance).to.equal(0);
    });

    it("Get 3Pool underlyer balance from account holding", async () => {
      const daiAmount = tokenAmountToBigNumber("1000", 18);
      const daiIndex = 1;
      const minAmount = 0;

      // deposit into 3Pool
      await coins["DAI"].connect(lpSafe).approve(basePool.address, MAX_UINT256);
      await basePool
        .connect(lpSafe)
        ["add_liquidity(uint256[3],uint256)"]([daiAmount, "0", "0"], minAmount);

      // deposit 3Crv into metapool
      let baseLpBalance = await baseLpToken.balanceOf(lpSafe.address);
      await baseLpToken.connect(lpSafe).approve(metaPool.address, MAX_UINT256);
      await metaPool
        .connect(lpSafe)
        ["add_liquidity(uint256[2],uint256)"](["0", baseLpBalance], minAmount);

      const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
      const basePoolLpTotalSupply = await baseLpToken.totalSupply();

      // update LP Safe's base pool LP balance after depositing
      // into the metapool, which will swap for some primary underlyer
      const metaPoolBaseLpBalance = await metaPool.balances(1);
      const lpBalance = await lpToken.balanceOf(lpSafe.address);
      const lpTotalSupply = await lpToken.totalSupply();
      baseLpBalance = lpBalance.mul(metaPoolBaseLpBalance).div(lpTotalSupply);

      // update LP Safe's base pool LP balance after swapping
      // primary underlyer for more base pool LP token
      const metaPoolPrimaryBalance = await metaPool.balances(0);
      const primaryAmount = lpBalance
        .mul(metaPoolPrimaryBalance)
        .div(lpTotalSupply);
      const swap3CrvOutput = await metaPool.get_dy(0, 1, primaryAmount);
      baseLpBalance = baseLpBalance.add(swap3CrvOutput);

      const expectedBalance = baseLpBalance
        .mul(basePoolDaiBalance)
        .div(basePoolLpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        daiIndex
      );
      // allow a few wei deviation
      expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
    });

    it("Get 3Pool underlyer balance from gauge holding", async () => {
      const daiAmount = tokenAmountToBigNumber("1000", 18);
      const daiIndex = 1;
      const minAmount = 0;

      // deposit into 3Pool
      await coins["DAI"].connect(lpSafe).approve(basePool.address, MAX_UINT256);
      await basePool
        .connect(lpSafe)
        ["add_liquidity(uint256[3],uint256)"]([daiAmount, "0", "0"], minAmount);

      // deposit 3Crv into metapool
      let baseLpBalance = await baseLpToken.balanceOf(lpSafe.address);
      await baseLpToken.connect(lpSafe).approve(metaPool.address, MAX_UINT256);
      await metaPool
        .connect(lpSafe)
        ["add_liquidity(uint256[2],uint256)"](["0", baseLpBalance], minAmount);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      const lpBalance = await lpToken.balanceOf(lpSafe.address);
      await gauge.connect(lpSafe)["deposit(uint256)"](lpBalance);
      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(0);
      const gaugeLpBalance = await gauge.balanceOf(lpSafe.address);
      expect(gaugeLpBalance).to.equal(lpBalance);

      const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
      const basePoolLpTotalSupply = await baseLpToken.totalSupply();

      // update LP Safe's base pool LP balance after depositing
      // into the metapool, which will swap for some primary underlyer
      const metaPoolBaseLpBalance = await metaPool.balances(1);
      const lpTotalSupply = await lpToken.totalSupply();
      baseLpBalance = gaugeLpBalance
        .mul(metaPoolBaseLpBalance)
        .div(lpTotalSupply);

      // update LP Safe's base pool LP balance after swapping
      // primary underlyer for more base pool LP token
      const metaPoolPrimaryBalance = await metaPool.balances(0);
      const primaryAmount = gaugeLpBalance
        .mul(metaPoolPrimaryBalance)
        .div(lpTotalSupply);
      const swap3CrvOutput = await metaPool.get_dy(0, 1, primaryAmount);
      baseLpBalance = baseLpBalance.add(swap3CrvOutput);

      const expectedBalance = baseLpBalance
        .mul(basePoolDaiBalance)
        .div(basePoolLpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        daiIndex
      );
      // allow a few wei deviation
      expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
    });

    it("Get 3Pool underlyer balance from combined holdings", async () => {
      const daiAmount = tokenAmountToBigNumber("1000", 18);
      const daiIndex = 1;
      const minAmount = 0;

      // deposit into 3Pool
      await coins["DAI"].connect(lpSafe).approve(basePool.address, MAX_UINT256);
      await basePool
        .connect(lpSafe)
        ["add_liquidity(uint256[3],uint256)"]([daiAmount, "0", "0"], minAmount);

      // deposit 3Crv into metapool
      let baseLpBalance = await baseLpToken.balanceOf(lpSafe.address);
      await baseLpToken.connect(lpSafe).approve(metaPool.address, MAX_UINT256);
      await metaPool
        .connect(lpSafe)
        ["add_liquidity(uint256[2],uint256)"](["0", baseLpBalance], minAmount);

      // split LP tokens between strategy and gauge
      const totalLpBalance = await lpToken.balanceOf(lpSafe.address);
      const strategyLpBalance = totalLpBalance.div(3);
      const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
      expect(gaugeLpBalance).to.be.gt(0);
      expect(strategyLpBalance).to.be.gt(0);

      // update LP Safe's base pool LP balance after depositing
      // into the metapool, which will swap for some primary underlyer
      const metaPoolBaseLpBalance = await metaPool.balances(1);
      const lpTotalSupply = await lpToken.totalSupply();
      baseLpBalance = totalLpBalance
        .mul(metaPoolBaseLpBalance)
        .div(lpTotalSupply);

      // update LP Safe's base pool LP balance after swapping
      // primary underlyer for more base pool LP token
      const metaPoolPrimaryBalance = await metaPool.balances(0);
      const primaryAmount = totalLpBalance
        .mul(metaPoolPrimaryBalance)
        .div(lpTotalSupply);
      const swap3CrvOutput = await metaPool.get_dy(0, 1, primaryAmount);
      baseLpBalance = baseLpBalance.add(swap3CrvOutput);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      await gauge.connect(lpSafe)["deposit(uint256)"](gaugeLpBalance);

      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(
        strategyLpBalance
      );
      expect(await gauge.balanceOf(lpSafe.address)).to.equal(gaugeLpBalance);

      const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
      const basePoolLpTotalSupply = await baseLpToken.totalSupply();

      const expectedBalance = baseLpBalance
        .mul(basePoolDaiBalance)
        .div(basePoolLpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        daiIndex
      );
      // allow a few wei deviation
      expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
    });

    it("Get zero UST balance when no holdings", async () => {
      const ustIndex = 0;
      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        ustIndex
      );
      expect(balance).to.equal(0);
    });

    it("Get UST balance from account holding", async () => {
      const ustAmount = tokenAmountToBigNumber("1000", 18);
      const ustIndex = 0;
      const minAmount = 0;

      // deposit UST into metapool
      await coins["UST"].connect(lpSafe).approve(metaPool.address, MAX_UINT256);
      await metaPool
        .connect(lpSafe)
        ["add_liquidity(uint256[2],uint256)"]([ustAmount, "0"], minAmount);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        ustIndex
      );
      expect(balance).to.equal(0);
    });

    it("Get UST balance from gauge holding", async () => {
      const ustAmount = tokenAmountToBigNumber("1000", 18);
      const ustIndex = 0;
      const minAmount = 0;

      // deposit UST into metapool
      await coins["UST"].connect(lpSafe).approve(metaPool.address, MAX_UINT256);
      await metaPool
        .connect(lpSafe)
        ["add_liquidity(uint256[2],uint256)"]([ustAmount, "0"], minAmount);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      const lpBalance = await lpToken.balanceOf(lpSafe.address);
      await gauge.connect(lpSafe)["deposit(uint256)"](lpBalance);
      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(0);
      const gaugeLpBalance = await gauge.balanceOf(lpSafe.address);
      expect(gaugeLpBalance).to.equal(lpBalance);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        ustIndex
      );
      expect(balance).to.equal(0);
    });

    it("Get UST balance from combined holdings", async () => {
      const ustAmount = tokenAmountToBigNumber("1000", 18);
      const ustIndex = 0;
      const minAmount = 0;

      // deposit UST into metapool
      await coins["UST"].connect(lpSafe).approve(metaPool.address, MAX_UINT256);
      await metaPool
        .connect(lpSafe)
        ["add_liquidity(uint256[2],uint256)"]([ustAmount, "0"], minAmount);

      // split LP tokens between strategy and gauge
      const totalLpBalance = await lpToken.balanceOf(lpSafe.address);
      const strategyLpBalance = totalLpBalance.div(3);
      const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
      expect(gaugeLpBalance).to.be.gt(0);
      expect(strategyLpBalance).to.be.gt(0);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      await gauge.connect(lpSafe)["deposit(uint256)"](gaugeLpBalance);

      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(
        strategyLpBalance
      );
      expect(await gauge.balanceOf(lpSafe.address)).to.equal(gaugeLpBalance);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        ustIndex
      );
      expect(balance).to.equal(0);
    });
  });
});
