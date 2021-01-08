const {
  //assert,
  expect,
} = require("chai");
const { artifacts, contract, web3 } = require("hardhat");
const {
  BN,
  // expectEvent, expectRevert
} = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const {
  // ZERO_ADDRESS,
  MAX_UINT256,
} = require("@openzeppelin/test-helpers/src/constants");
const { console, erc20 } = require("../utils/helpers");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const TransparentUpgradeableProxy = artifacts.require(
  "TransparentUpgradeableProxy"
);
const ProxyConstructorArg = artifacts.require("ProxyConstructorArg");
const APYManager = artifacts.require("APYManager");
const MockContract = artifacts.require("MockContract");
const { USDC_WHALE } = require("../utils/constants");
const APYPoolTokenProxy = artifacts.require("APYPoolTokenProxy");
const APYPoolToken = artifacts.require("APYPoolToken");
const IDetailedERC20 = artifacts.require("IDetailedERC20");
const APYMetaPoolTokenProxy = artifacts.require("APYMetaPoolTokenProxy");
const APYMetaPoolToken = artifacts.require("TestAPYMetaPoolToken");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const USDC_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_PRICE_AGG = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4";

const usdc = (amount) => erc20(amount, "6");

async function formattedAmount(token, value) {
  const decimals = await token.decimals.call();
  return new BN("10").pow(decimals).mul(new BN(value)).toString();
}

async function acquireToken(fundAccount, receiver, token, amount) {
  /* NOTE: Ganache is setup to control "whale" addresses. This method moves
  requested funds out of the fund account and into the specified wallet */

  // fund the account with ETH so it can move funds
  await web3.eth.sendTransaction({
    from: receiver,
    to: fundAccount,
    value: 1e18,
  });

  const funds = await formattedAmount(token, amount);

  await token.transfer(receiver, funds, { from: fundAccount });
  const tokenBal = await token.balanceOf(receiver);
  console.debug(`${token.address} Balance: ${tokenBal.toString()}`);
}

contract("APYManager", async (accounts) => {
  const [deployer] = accounts;

  let manager;
  let usdcPool;
  let usdcToken;
  let mApt;

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
    const proxyAdmin = await ProxyAdmin.new({ from: deployer });
    const managerLogic = await APYManager.new({ from: deployer });
    const encodedArg = await (await ProxyConstructorArg.new()).getEncodedArg(
      proxyAdmin.address
    );
    const managerProxy = await TransparentUpgradeableProxy.new(
      managerLogic.address,
      proxyAdmin.address,
      encodedArg,
      {
        from: deployer,
      }
    );
    manager = await APYManager.at(managerProxy.address);

    usdcToken = await IDetailedERC20.at(USDC_TOKEN);

    const aptLogic = await APYPoolToken.new({ from: deployer });
    const aptProxy = await APYPoolTokenProxy.new(
      aptLogic.address,
      proxyAdmin.address,
      usdcToken.address,
      USDC_PRICE_AGG,
      {
        from: deployer,
      }
    );
    usdcPool = await APYPoolToken.at(aptProxy.address);

    await acquireToken(USDC_WHALE, deployer, usdcToken, "1000000");

    //handle allownaces
    await usdcToken.approve(usdcPool.address, MAX_UINT256, { from: deployer });

    // deploy mAPT token
    const mAptLogic = await APYMetaPoolToken.new({ from: deployer });
    const mockTvlAgg = await MockContract.new();
    const mAptProxy = await APYMetaPoolTokenProxy.new(
      mAptLogic.address,
      proxyAdmin.address,
      mockTvlAgg.address,
      {
        from: deployer,
      }
    );
    mApt = await APYMetaPoolToken.at(mAptProxy.address);

    await mApt.setManagerAddress(manager.address);
    await manager.setMetaPoolToken(mApt.address);

    // workaround until real TVL aggregator is ready;
    // see NatSpec for `setApt` in `TestAPYMetaPoolToken`.
    await mApt.setApt(usdcPool.address);
  });

  describe("Push and pull funds from pool", async () => {
    it("Pull funds", async () => {
      await usdcToken.transfer(usdcPool.address, usdc("100"), {
        from: deployer,
      });
      const poolAmount = await usdcToken.balanceOf(usdcPool.address);
      console.debug("Pool amount:", poolAmount.toString());

      const poolValue = await usdcPool.getEthValueFromTokenAmount(poolAmount);
      const tokenEthPrice = await usdcPool.getTokenEthPrice();

      const mintAmount = await mApt.calculateMintAmount(
        poolValue,
        tokenEthPrice,
        "6"
      );
      console.debug("Mint amount:", mintAmount.toString());

      // check balances before pull
      expect(await mApt.balanceOf(usdcPool.address)).to.bignumber.equal("0");
      expect(await usdcToken.balanceOf(manager.address)).to.bignumber.equal(
        "0"
      );

      await usdcPool.infiniteApprove(manager.address, { from: deployer });
      await manager.pullFunds(usdcPool.address, { from: deployer });

      // check balances after pull
      expect(await mApt.balanceOf(usdcPool.address)).to.bignumber.equal(
        mintAmount
      );
      expect(await usdcToken.balanceOf(manager.address)).to.bignumber.equal(
        poolAmount
      );
    });

    it("Push funds", async () => {
      // setup for push without invoking pull:
      // 1. put USDC into the manager
      // 2. mint mAPT for the pool
      await usdcToken.transfer(manager.address, usdc("100"), {
        from: deployer,
      });
      await mApt.setManagerAddress(deployer);
      await mApt.mint(usdcPool.address, erc20("10"), { from: deployer });
      await mApt.setManagerAddress(manager.address);

      const mintedAmount = await mApt.balanceOf(usdcPool.address);
      console.debug("Minted amount:", mintedAmount.toString());

      const tokenEthPrice = await usdcPool.getTokenEthPrice();
      const poolAmount = await mApt.calculatePoolAmount(
        mintedAmount,
        tokenEthPrice,
        "6"
      );
      console.debug("Pool amount:", poolAmount.toString());

      await manager.pushFunds(usdcPool.address, { from: deployer });

      expect(await mApt.balanceOf(usdcPool.address)).to.bignumber.equal("0");
      expect(await usdcToken.balanceOf(usdcPool.address)).to.bignumber.equal(
        poolAmount
      );
      expect(await usdcToken.balanceOf(manager.address)).to.bignumber.equal(
        "0"
      );
    });

    it("Check pull and push results in no change", async () => {
      await usdcToken.transfer(usdcPool.address, usdc("100"), {
        from: deployer,
      });
      const poolBalance = await usdcToken.balanceOf(usdcPool.address);

      await usdcPool.infiniteApprove(manager.address, { from: deployer });
      await manager.pullFunds(usdcPool.address, { from: deployer });

      expect(await usdcToken.balanceOf(manager.address)).to.bignumber.equal(
        poolBalance
      );
      const mintedAmount = await mApt.balanceOf(usdcPool.address);
      console.debug("Minted amount:", mintedAmount.toString());

      await manager.pushFunds(usdcPool.address, { from: deployer });

      expect(await mApt.balanceOf(usdcPool.address)).to.bignumber.equal("0");
      expect(await usdcToken.balanceOf(manager.address)).to.bignumber.equal(
        "0"
      );
      expect(await usdcToken.balanceOf(usdcPool.address)).to.bignumber.equal(
        poolBalance
      );
    });
  });
});