const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  MAX_UINT256,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const CurvePoolAllocations = [
  {
    contractName: "Curve3poolAllocation",
    poolName: "3Pool",
    // using the Curve pool itself as the "whale":
    // should be ok since the pool's external balances (vs the pool's
    // internal balances) are only used for admin balances and determining
    // deposit amounts for "fee" assets.
    whaleAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IStableSwap3",
    },
  },
  {
    contractName: "CurveIronbankAllocation",
    poolName: "Ironbank",
    // see first note on whale address
    whaleAddress: "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF",
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IStableSwap3",
    },
    unwrap: true,
  },
  {
    contractName: "CurveSaaveAllocation",
    poolName: "sAAVE",
    // see first note on whale address
    whaleAddress: "0xEB16Ae0052ed37f479f7fe63849198Df1765a733",
    numberOfCoins: 2,
    interfaceOverride: {
      IStableSwap: "IStableSwap2",
    },
  },
  {
    contractName: "CurveAaveAllocation",
    poolName: "AAVE",
    // see first note on whale address
    whaleAddress: "0xDeBF20617708857ebe4F679508E7b7863a8A8EeE",
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IStableSwap3",
    },
  },
  {
    contractName: "CurveSusdv2Allocation",
    poolName: "sUSDv2",
    // see first note on whale address
    whaleAddress: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
    numberOfCoins: 4,
    interfaceOverride: {
      IStableSwap: "IOldStableSwap4",
    },
  },
  {
    contractName: "CurveCompoundAllocation",
    poolName: "Compound",
    // see first note on whale address
    whaleAddress: "0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56",
    numberOfCoins: 2,
    interfaceOverride: {
      IStableSwap: "IOldStableSwap2",
    },
    unwrap: true,
  },
  {
    contractName: "CurveUsdtAllocation",
    poolName: "USDT",
    // see first note on whale address
    whaleAddress: "0x52EA46506B9CC5Ef470C5bf89f17Dc28bB35D85C",
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IOldStableSwap3",
    },
    unwrap: true,
  },
];

const CurveMetaPoolAllocations = [
  {
    contractName: "CurveUstAllocation",
    primaryUnderlyerSymbol: "UST",
    whaleAddress: "0x87dA823B6fC8EB8575a235A824690fda94674c88",
  },
  {
    contractName: "CurveAlusdAllocation",
    primaryUnderlyerSymbol: "alUSD",
    whaleAddress: "0xAB8e74017a8Cc7c15FFcCd726603790d26d7DeCa",
  },
  {
    contractName: "CurveUsdnAllocation",
    primaryUnderlyerSymbol: "USDN",
    // using the Curve pool itself as the "whale":
    // should be ok since the pool's external balances (vs the pool's
    // internal balances) are only used for admin balances and determining
    // deposit amounts for "fee" assets.
    whaleAddress: "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1",
  },
  {
    contractName: "CurveUsdpAllocation",
    primaryUnderlyerSymbol: "USDP",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x42d7025938bec20b69cbae5a77421082407f053a",
  },
  {
    contractName: "CurveMusdAllocation",
    primaryUnderlyerSymbol: "mUSD",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6",
  },
  {
    contractName: "CurveOusdAllocation",
    primaryUnderlyerSymbol: "OUSD",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x87650D7bbfC3A9F10587d7778206671719d9910D",
  },
  {
    contractName: "CurveFraxAllocation",
    primaryUnderlyerSymbol: "FRAX",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
  },
  {
    contractName: "CurveBusdv2Allocation",
    primaryUnderlyerSymbol: "BUSD",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
  },
  {
    contractName: "CurveLusdAllocation",
    primaryUnderlyerSymbol: "LUSD",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
  },
  {
    contractName: "CurveMimAllocation",
    primaryUnderlyerSymbol: "MIM",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
  },
  {
    contractName: "CurveUstWormholeAllocation",
    primaryUnderlyerSymbol: "UST (Wormhole)",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269",
    // this allocation avoids decomposing into primary coin
    skipPrimary: true,
  },
];

async function getContractAt(
  interfaceName,
  contractAddress,
  interfaceOverride,
  signer
) {
  const override =
    interfaceOverride && interfaceOverride[interfaceName]
      ? interfaceOverride[interfaceName]
      : interfaceName;
  if (typeof override === "string") {
    interfaceName = override;
  } else if (typeof override === "object") {
    interfaceName = override.name;
  } else {
    throw Error("Unrecognized type for interface override.");
  }

  let contract = await ethers.getContractAt(interfaceName, contractAddress);
  if (signer) {
    contract = contract.connect(signer);
  }
  for (const [originalSig, overrideSig] of Object.entries(
    override.functions || {}
  )) {
    contract[originalSig] = contract[overrideSig];
  }
  return contract;
}

describe("Allocations", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpAccount;
  let mApt;

  /* contract factories */
  let TvlManager;

  /* deployed contracts */
  let tvlManager;

  // use EVM snapshots for test isolation
  let suiteSnapshotId;
  let testSnapshotId;

  before(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    testSnapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(testSnapshotId);
  });

  before(async () => {
    [deployer, emergencySafe, adminSafe, mApt, lpAccount] =
      await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );

    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("ILockingOracle").abi
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
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.mAptAddress.returns(mApt.address);
    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);

    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * - emergencySafe (emergency role, default admin role)
     * - adminSafe (admin role)
     */
    TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);
  });

  describe("Aave stablecoin allocation", () => {
    let allocation;

    let lendingPool;

    let underlyerToken;
    const underlyerIndex = 0;
    let lookupId;

    before("Deploy allocation contract", async () => {
      const AaveStableCoinAllocation = await ethers.getContractFactory(
        "AaveStableCoinAllocation"
      );
      allocation = await AaveStableCoinAllocation.deploy();
      await allocation.deployed();
    });

    before("Attach to Mainnet Aave contracts", async () => {
      const LENDING_POOL_ADDRESS = await allocation.LENDING_POOL_ADDRESS();
      lendingPool = await ethers.getContractAt(
        "ILendingPool",
        LENDING_POOL_ADDRESS,
        lpAccount
      );
    });

    before("Fund account 0 with pool underlyer", async () => {
      const tokens = await allocation.tokens();
      const underlyerAddress = tokens[underlyerIndex].token;
      underlyerToken = await ethers.getContractAt(
        "IDetailedERC20",
        underlyerAddress
      );

      const amount = tokenAmountToBigNumber(
        100000,
        await underlyerToken.decimals()
      );
      const sender = WHALE_POOLS["DAI"];
      await acquireToken(sender, lpAccount, underlyerToken, amount, deployer);
    });

    before("Register asset allocation", async () => {
      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(allocation.address);
      lookupId = await tvlManager.testEncodeAssetAllocationId(
        allocation.address,
        underlyerIndex
      );
    });

    it("Get underlyer balance from account holding", async () => {
      const underlyerAmount = tokenAmountToBigNumber(
        1000,
        await underlyerToken.decimals()
      );

      await underlyerToken
        .connect(lpAccount)
        .approve(lendingPool.address, MAX_UINT256);
      await lendingPool.deposit(
        underlyerToken.address,
        underlyerAmount,
        lpAccount.address,
        0
      );

      const balance = await tvlManager.balanceOf(lookupId);
      // allow a few wei deviation
      expect(balance.sub(underlyerAmount).abs()).to.be.lt(3);
    });
  });

  CurvePoolAllocations.forEach(function (allocationData) {
    const {
      contractName,
      poolName,
      whaleAddress,
      numberOfCoins,
      unwrap,
      interfaceOverride,
    } = allocationData;

    describe(`Curve ${poolName} allocation`, () => {
      let allocation;

      let lpToken;
      let stableSwap;
      let gauge;

      let underlyerToken;
      const underlyerIndices = Array.from(Array(numberOfCoins).keys());
      let lookupId;

      before("Deploy allocation contract", async () => {
        const CurvePoolAllocation = await ethers.getContractFactory(
          contractName
        );
        allocation = await CurvePoolAllocation.deploy();
        await allocation.deployed();
      });

      before("Register asset allocation", async () => {
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
      });

      before("Attach to Mainnet Curve contracts", async () => {
        const STABLE_SWAP_ADDRESS = await allocation.STABLE_SWAP_ADDRESS();
        stableSwap = await getContractAt(
          "IStableSwap",
          STABLE_SWAP_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LP_TOKEN_ADDRESS = await allocation.LP_TOKEN_ADDRESS();
        lpToken = await getContractAt(
          "IDetailedERC20",
          LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LIQUIDITY_GAUGE_ADDRESS =
          await allocation.LIQUIDITY_GAUGE_ADDRESS();
        gauge = await getContractAt(
          "ILiquidityGauge",
          LIQUIDITY_GAUGE_ADDRESS,
          interfaceOverride,
          lpAccount
        );
      });

      underlyerIndices.forEach((underlyerIndex) => {
        describe(`Underlyer index: ${underlyerIndex}`, () => {
          before("Get allocation ID", async () => {
            lookupId = await tvlManager.testEncodeAssetAllocationId(
              allocation.address,
              underlyerIndex
            );
          });

          before("Fund account 0 with pool underlyer", async () => {
            const underlyerAddress = await stableSwap.coins(underlyerIndex);
            underlyerToken = await ethers.getContractAt(
              "IDetailedERC20",
              underlyerAddress
            );

            const amount = tokenAmountToBigNumber(
              100000,
              await underlyerToken.decimals()
            );
            const sender = whaleAddress;
            await acquireToken(
              sender,
              lpAccount,
              underlyerToken,
              amount,
              deployer
            );
          });

          it("Get underlyer balance from account holding", async () => {
            const minAmount = 0;
            const amounts = new Array(numberOfCoins).fill("0");
            const underlyerAmount = tokenAmountToBigNumber(
              1000,
              await underlyerToken.decimals()
            );
            amounts[underlyerIndex] = underlyerAmount;

            await underlyerToken
              .connect(lpAccount)
              .approve(stableSwap.address, MAX_UINT256);
            await stableSwap[
              `add_liquidity(uint256[${numberOfCoins}],uint256)`
            ](amounts, minAmount);

            const strategyLpBalance = await lpToken.balanceOf(
              lpAccount.address
            );
            const poolBalance = await stableSwap.balances(underlyerIndex);
            const lpTotalSupply = await lpToken.totalSupply();

            let expectedBalance = strategyLpBalance
              .mul(poolBalance)
              .div(lpTotalSupply);
            if (unwrap) {
              expectedBalance = await allocation.unwrapBalance(
                expectedBalance,
                underlyerIndex
              );
            }
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get underlyer balance from gauge holding", async () => {
            const minAmount = 0;
            const amounts = new Array(numberOfCoins).fill("0");
            const underlyerAmount = tokenAmountToBigNumber(
              1000,
              await underlyerToken.decimals()
            );
            amounts[underlyerIndex] = underlyerAmount;

            await underlyerToken
              .connect(lpAccount)
              .approve(stableSwap.address, MAX_UINT256);
            await stableSwap[
              `add_liquidity(uint256[${numberOfCoins}],uint256)`
            ](amounts, minAmount);

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            const strategyLpBalance = await lpToken.balanceOf(
              lpAccount.address
            );
            await gauge["deposit(uint256)"](strategyLpBalance);
            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
            const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
            expect(gaugeLpBalance).to.be.gt(0);

            const poolBalance = await stableSwap.balances(underlyerIndex);
            const lpTotalSupply = await lpToken.totalSupply();

            let expectedBalance = gaugeLpBalance
              .mul(poolBalance)
              .div(lpTotalSupply);
            if (unwrap) {
              expectedBalance = await allocation.unwrapBalance(
                expectedBalance,
                underlyerIndex
              );
            }
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get underlyer balance from combined holdings", async () => {
            const minAmount = 0;
            const amounts = new Array(numberOfCoins).fill("0");
            const underlyerAmount = tokenAmountToBigNumber(
              1000,
              await underlyerToken.decimals()
            );
            amounts[underlyerIndex] = underlyerAmount;

            await underlyerToken
              .connect(lpAccount)
              .approve(stableSwap.address, MAX_UINT256);
            await stableSwap[
              `add_liquidity(uint256[${numberOfCoins}],uint256)`
            ](amounts, minAmount);

            // split LP tokens between strategy and gauge
            const totalLpBalance = await lpToken.balanceOf(lpAccount.address);
            const strategyLpBalance = totalLpBalance.div(3);
            const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
            expect(gaugeLpBalance).to.be.gt(0);
            expect(strategyLpBalance).to.be.gt(0);

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            await gauge["deposit(uint256)"](gaugeLpBalance);

            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(
              strategyLpBalance
            );
            expect(await gauge.balanceOf(lpAccount.address)).to.equal(
              gaugeLpBalance
            );

            const poolBalance = await stableSwap.balances(underlyerIndex);
            const lpTotalSupply = await lpToken.totalSupply();

            let expectedBalance = totalLpBalance
              .mul(poolBalance)
              .div(lpTotalSupply);
            if (unwrap) {
              expectedBalance = await allocation.unwrapBalance(
                expectedBalance,
                underlyerIndex
              );
            }
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });
        });
      });
    });
  });

  CurveMetaPoolAllocations.forEach(function (allocationData) {
    const {
      contractName,
      primaryUnderlyerSymbol,
      whaleAddress,
      interfaceOverride,
      skipPrimary,
    } = allocationData;

    describe(`Curve ${primaryUnderlyerSymbol} allocation`, () => {
      let allocation;
      let curve3poolAllocation;

      // MetaPool
      let lpToken;
      let metaPool;
      let gauge;
      // Curve 3pool;
      let baseLpToken;
      let basePool;

      before("Deploy allocation contracts", async () => {
        const Curve3poolAllocation = await ethers.getContractFactory(
          "Curve3poolAllocation"
        );
        curve3poolAllocation = await Curve3poolAllocation.deploy();
        const CurveAllocation = await ethers.getContractFactory(contractName);
        if (skipPrimary) {
          allocation = await CurveAllocation.deploy();
        } else {
          allocation = await CurveAllocation.deploy(
            curve3poolAllocation.address
          );
        }
      });

      before("Register asset allocation", async () => {
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
      });

      // need to reset these for each pool
      before("Attach to Mainnet contracts", async () => {
        // Metapool
        const META_POOL_ADDRESS = await allocation.META_POOL();
        metaPool = await getContractAt(
          "IMetaPool",
          META_POOL_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LP_TOKEN_ADDRESS = await allocation.LP_TOKEN();
        lpToken = await getContractAt(
          "IDetailedERC20",
          LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LIQUIDITY_GAUGE_ADDRESS = await allocation.LIQUIDITY_GAUGE();
        gauge = await getContractAt(
          "ILiquidityGauge",
          LIQUIDITY_GAUGE_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        // 3pool
        const BASE_POOL_ADDRESS =
          await curve3poolAllocation.STABLE_SWAP_ADDRESS();
        basePool = await getContractAt(
          "IStableSwap",
          BASE_POOL_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const BASE_LP_TOKEN_ADDRESS =
          await curve3poolAllocation.LP_TOKEN_ADDRESS();
        baseLpToken = await getContractAt(
          "IDetailedERC20",
          BASE_LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );
      });

      if (!skipPrimary) {
        describe("Primary underlyer", () => {
          let primaryToken;
          let primaryAllocationId;
          const primaryIndex = 0;

          before("Get allocation ID", async () => {
            primaryAllocationId = await tvlManager.testEncodeAssetAllocationId(
              allocation.address,
              primaryIndex
            );
          });

          before(
            `Prepare account 0 with ${primaryUnderlyerSymbol}`,
            async () => {
              const PRIMARY_UNDERLYER_ADDRESS =
                await allocation.PRIMARY_UNDERLYER();
              primaryToken = await ethers.getContractAt(
                "IDetailedERC20",
                PRIMARY_UNDERLYER_ADDRESS
              );
              const amount = tokenAmountToBigNumber(
                100000,
                await primaryToken.decimals()
              );
              const sender = whaleAddress;
              await acquireToken(
                sender,
                lpAccount,
                primaryToken,
                amount,
                deployer
              );
            }
          );

          it("Get primary underlyer balance from account holding", async () => {
            const primaryAmount = tokenAmountToBigNumber(
              "1000",
              await primaryToken.decimals()
            );
            const primaryIndex = 0;
            const minAmount = 0;

            // deposit primary underlyer into metapool
            await primaryToken
              .connect(lpAccount)
              .approve(metaPool.address, MAX_UINT256);
            await metaPool["add_liquidity(uint256[2],uint256)"](
              [primaryAmount, "0"],
              minAmount
            );

            const metaPoolPrimaryBalance = await metaPool.balances(
              primaryIndex
            );
            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            const lpTotalSupply = await lpToken.totalSupply();
            const expectedBalance = lpBalance
              .mul(metaPoolPrimaryBalance)
              .div(lpTotalSupply);

            const balance = await tvlManager.balanceOf(primaryAllocationId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get primary underlyer balance from gauge holding", async () => {
            const primaryAmount = tokenAmountToBigNumber(
              "1000",
              await primaryToken.decimals()
            );
            const primaryIndex = 0;
            const minAmount = 0;

            // deposit primary underlyer into metapool
            await primaryToken
              .connect(lpAccount)
              .approve(metaPool.address, MAX_UINT256);
            await metaPool["add_liquidity(uint256[2],uint256)"](
              [primaryAmount, "0"],
              minAmount
            );

            const metaPoolPrimaryBalance = await metaPool.balances(
              primaryIndex
            );

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            await gauge["deposit(uint256)"](lpBalance);
            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
            const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
            expect(gaugeLpBalance).to.equal(lpBalance);

            const lpTotalSupply = await lpToken.totalSupply();
            const expectedBalance = gaugeLpBalance
              .mul(metaPoolPrimaryBalance)
              .div(lpTotalSupply);

            const balance = await tvlManager.balanceOf(primaryAllocationId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get primary underlyer balance from combined holdings", async () => {
            const primaryAmount = tokenAmountToBigNumber(
              "1000",
              await primaryToken.decimals()
            );
            const primaryIndex = 0;
            const minAmount = 0;

            // deposit primary underlyer into metapool
            await primaryToken
              .connect(lpAccount)
              .approve(metaPool.address, MAX_UINT256);
            await metaPool["add_liquidity(uint256[2],uint256)"](
              [primaryAmount, "0"],
              minAmount
            );

            // split LP tokens between strategy and gauge
            const totalLpBalance = await lpToken.balanceOf(lpAccount.address);
            const strategyLpBalance = totalLpBalance.div(3);
            const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
            expect(gaugeLpBalance).to.be.gt(0);
            expect(strategyLpBalance).to.be.gt(0);

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            await gauge["deposit(uint256)"](gaugeLpBalance);

            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(
              strategyLpBalance
            );
            expect(await gauge.balanceOf(lpAccount.address)).to.equal(
              gaugeLpBalance
            );

            const metaPoolPrimaryBalance = await metaPool.balances(
              primaryIndex
            );
            const lpTotalSupply = await lpToken.totalSupply();

            const expectedBalance = totalLpBalance
              .mul(metaPoolPrimaryBalance)
              .div(lpTotalSupply);

            const balance = await tvlManager.balanceOf(primaryAllocationId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });
        });
      }

      [1, 2, 3].forEach((underlyerIndex) => {
        const basePoolIndex = underlyerIndex - 1;
        if (skipPrimary) {
          underlyerIndex = basePoolIndex;
        }

        describe(`3Pool index: ${basePoolIndex}`, () => {
          let underlyerToken;
          let underlyerDecimals;
          let lookupId;

          before("Get allocation ID", async () => {
            lookupId = await tvlManager.testEncodeAssetAllocationId(
              allocation.address,
              underlyerIndex
            );
          });

          before("Fund account 0 with pool underlyer", async () => {
            const underlyerAddress = await basePool.coins(basePoolIndex);
            underlyerToken = await ethers.getContractAt(
              "IDetailedERC20",
              underlyerAddress
            );
            underlyerDecimals = await underlyerToken.decimals();

            const amount = tokenAmountToBigNumber(
              100000,
              await underlyerToken.decimals()
            );
            let sender = WHALE_POOLS["DAI"];
            await acquireToken(
              sender,
              lpAccount,
              underlyerToken,
              amount,
              deployer
            );
          });

          it("Get 3Pool underlyer balance from account holding", async () => {
            const amounts = ["0", "0", "0"];
            amounts[basePoolIndex] = tokenAmountToBigNumber(
              "1000",
              underlyerDecimals
            );
            const minAmount = 0;

            // deposit into 3Pool
            await underlyerToken
              .connect(lpAccount)
              .approve(basePool.address, MAX_UINT256);
            await basePool["add_liquidity(uint256[3],uint256)"](
              amounts,
              minAmount
            );

            // deposit 3Crv into metapool
            let baseLpBalance = await baseLpToken.balanceOf(lpAccount.address);
            await baseLpToken
              .connect(lpAccount)
              .approve(metaPool.address, MAX_UINT256);
            await metaPool["add_liquidity(uint256[2],uint256)"](
              ["0", baseLpBalance],
              minAmount
            );

            const basePoolDaiBalance = await basePool.balances(basePoolIndex);
            const basePoolLpTotalSupply = await baseLpToken.totalSupply();

            // update LP Safe's base pool LP balance after depositing
            // into the metapool, which will swap for some primary underlyer
            const metaPoolBaseLpBalance = await metaPool.balances(1);
            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            const lpTotalSupply = await lpToken.totalSupply();
            baseLpBalance = lpBalance
              .mul(metaPoolBaseLpBalance)
              .div(lpTotalSupply);

            // update LP Safe's base pool LP balance after swapping
            // primary underlyer for more base pool LP token
            if (skipPrimary) {
              const metaPoolPrimaryBalance = await metaPool.balances(0);
              const primaryAmount = lpBalance
                .mul(metaPoolPrimaryBalance)
                .div(lpTotalSupply);
              const swap3CrvOutput = await metaPool.get_dy(0, 1, primaryAmount);
              baseLpBalance = baseLpBalance.add(swap3CrvOutput);
            }

            const expectedBalance = baseLpBalance
              .mul(basePoolDaiBalance)
              .div(basePoolLpTotalSupply);
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get 3Pool underlyer balance from gauge holding", async () => {
            const amounts = ["0", "0", "0"];
            amounts[basePoolIndex] = tokenAmountToBigNumber(
              "1000",
              underlyerDecimals
            );
            const minAmount = 0;

            // deposit into 3Pool
            await underlyerToken
              .connect(lpAccount)
              .approve(basePool.address, MAX_UINT256);
            await basePool["add_liquidity(uint256[3],uint256)"](
              amounts,
              minAmount
            );

            // deposit 3Crv into metapool
            let baseLpBalance = await baseLpToken.balanceOf(lpAccount.address);
            await baseLpToken
              .connect(lpAccount)
              .approve(metaPool.address, MAX_UINT256);
            await metaPool["add_liquidity(uint256[2],uint256)"](
              ["0", baseLpBalance],
              minAmount
            );

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            await gauge["deposit(uint256)"](lpBalance);
            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
            const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
            expect(gaugeLpBalance).to.equal(lpBalance);

            const basePoolDaiBalance = await basePool.balances(basePoolIndex);
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
            if (skipPrimary) {
              const metaPoolPrimaryBalance = await metaPool.balances(0);
              const primaryAmount = lpBalance
                .mul(metaPoolPrimaryBalance)
                .div(lpTotalSupply);
              const swap3CrvOutput = await metaPool.get_dy(0, 1, primaryAmount);
              baseLpBalance = baseLpBalance.add(swap3CrvOutput);
            }

            const expectedBalance = baseLpBalance
              .mul(basePoolDaiBalance)
              .div(basePoolLpTotalSupply);
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get 3Pool underlyer balance from combined holdings", async () => {
            const amounts = ["0", "0", "0"];
            amounts[basePoolIndex] = tokenAmountToBigNumber(
              "1000",
              underlyerDecimals
            );
            const minAmount = 0;

            // deposit into 3Pool
            await underlyerToken
              .connect(lpAccount)
              .approve(basePool.address, MAX_UINT256);
            await basePool["add_liquidity(uint256[3],uint256)"](
              amounts,
              minAmount
            );

            // deposit 3Crv into metapool
            let baseLpBalance = await baseLpToken.balanceOf(lpAccount.address);
            await baseLpToken
              .connect(lpAccount)
              .approve(metaPool.address, MAX_UINT256);
            await metaPool["add_liquidity(uint256[2],uint256)"](
              ["0", baseLpBalance],
              minAmount
            );

            // split LP tokens between strategy and gauge
            const totalLpBalance = await lpToken.balanceOf(lpAccount.address);
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

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            await gauge["deposit(uint256)"](gaugeLpBalance);

            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(
              strategyLpBalance
            );
            expect(await gauge.balanceOf(lpAccount.address)).to.equal(
              gaugeLpBalance
            );

            const basePoolDaiBalance = await basePool.balances(basePoolIndex);
            const basePoolLpTotalSupply = await baseLpToken.totalSupply();

            // update LP Safe's base pool LP balance after swapping
            // primary underlyer for more base pool LP token
            if (skipPrimary) {
              const metaPoolPrimaryBalance = await metaPool.balances(0);
              const primaryAmount = totalLpBalance
                .mul(metaPoolPrimaryBalance)
                .div(lpTotalSupply);
              const swap3CrvOutput = await metaPool.get_dy(0, 1, primaryAmount);
              baseLpBalance = baseLpBalance.add(swap3CrvOutput);
            }

            const expectedBalance = baseLpBalance
              .mul(basePoolDaiBalance)
              .div(basePoolLpTotalSupply);
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });
        });
      });
    });
  });
});
