const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
} = require("../utils/helpers");
const { BigNumber } = ethers;

const DAY = 86400; // day in seconds
const WEEK = 7 * DAY;
const MONTH = DAY * 30;
const YEAR = DAY * 365;
const MAXTIME = 4 * YEAR;

if (!process.env.CI) {
  // eslint-disable-next-line no-global-assign
  describe = describe.skip;
}

describe("VotingEscrow deployment", () => {
  // signers
  let deployer;

  // contract factories
  let VotingEscrow;

  // deployed contracts
  let veCrv;

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
    [deployer] = await ethers.getSigners();
  });

  it("Can deploy VotingEscrow", async () => {
    const erc20Mock = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IDetailedERC20").abi
    );
    await erc20Mock.mock.decimals.returns(9);

    VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    veCrv = await expect(
      VotingEscrow.deploy(
        erc20Mock.address, // token
        "Boost-lock APY", // name
        "blAPY", // symbol
        "1.0.0" // version
      )
    ).to.not.be.reverted;
    expect(veCrv.address).to.not.equal(ZERO_ADDRESS);

    expect(await veCrv.symbol()).to.equal("blAPY");
    expect(await veCrv.name()).to.equal("Boost-lock APY");
    expect(await veCrv.version()).to.equal("1.0.0");
    expect(await veCrv.decimals()).to.equal(9);
  });
});

describe("Contract: VotingEscrow", () => {
  // signers
  let deployer;
  let user;
  let anotherUser;

  // contract factories
  let VotingEscrow;

  // deployed contracts
  let apy;
  let blApy;

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
    [deployer, user, anotherUser] = await ethers.getSigners();
  });

  before("Deploy APY and transfer tokens to user", async () => {
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    apy = await GovernanceToken.deploy();
    await apy.initialize(deployer.address, tokenAmountToBigNumber(100e6));

    await apy.transfer(user.address, tokenAmountToBigNumber("100"));
    expect(await apy.balanceOf(user.address)).to.equal(
      tokenAmountToBigNumber("100")
    );
  });

  before("Deploy Voting Escrow", async () => {
    VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    blApy = await VotingEscrow.deploy(
      apy.address,
      "Boost-locked APY", // name
      "blAPY", // symbol
      "1.0.0" // version
    );
  });

  describe("Defaults", () => {
    it("Symbol", async () => {
      expect(await blApy.symbol()).to.equal("blAPY");
    });

    it("Name", async () => {
      expect(await blApy.name()).to.equal("Boost-locked APY");
    });

    it("Version", async () => {
      expect(await blApy.version()).to.equal("1.0.0");
    });

    it("Decimals", async () => {
      expect(await blApy.decimals()).to.equal(await apy.decimals());
    });

    it("Not shutdown", async () => {
      expect(await blApy.is_shutdown()).to.be.false;
    });

    it("Deployer is admin", async () => {
      expect(await blApy.admin()).to.equal(deployer.address);
    });
  });

  describe("Shutdown privileges", () => {
    it("Admin can shutdown", async () => {
      await expect(blApy.connect(deployer).shutdown()).to.not.be.reverted;
      expect(await blApy.is_shutdown()).to.be.true;
    });

    it("User cannot shutdown", async () => {
      await expect(blApy.connect(user).shutdown()).to.be.revertedWith(
        "Admin only"
      );
    });
  });

  describe("Block all updates, except withdraw, when shutdown", () => {
    it("Cannot create lock if shutdown", async () => {
      const currentTime = (await ethers.provider.getBlock()).timestamp;
      const unlockTime = BigNumber.from(currentTime + 86400 * 30 * 6); // lock for 6 months
      const lockAmount = tokenAmountToBigNumber("15");

      await blApy.connect(deployer).shutdown();

      await apy.connect(user).approve(blApy.address, lockAmount);
      await expect(
        blApy.connect(user).create_lock(lockAmount, unlockTime)
      ).to.be.revertedWith("Contract is shutdown");
    });

    it("Cannot deposit for another if shutdown", async () => {
      await blApy.connect(deployer).shutdown();

      await expect(
        blApy.connect(user).deposit_for(FAKE_ADDRESS, 100)
      ).to.be.revertedWith("Contract is shutdown");
    });

    it("Cannot increase locked amount if shutdown", async () => {
      await blApy.connect(deployer).shutdown();

      await expect(
        blApy.connect(user).increase_amount(tokenAmountToBigNumber(100))
      ).to.be.revertedWith("Contract is shutdown");
    });

    it("Cannot increase unlock time if shutdown", async () => {
      await blApy.connect(deployer).shutdown();

      await expect(
        blApy.connect(user).increase_unlock_time(86400 * 30)
      ).to.be.revertedWith("Contract is shutdown");
    });
  });

  describe("Withdraw when shutdown", () => {
    before("Transfer tokens to another user", async () => {
      await apy.transfer(anotherUser.address, tokenAmountToBigNumber("100"));
      expect(await apy.balanceOf(anotherUser.address)).to.equal(
        tokenAmountToBigNumber("100")
      );
    });

    it("Can withdraw with non-expired lock", async () => {
      const currentTime = (await ethers.provider.getBlock()).timestamp;
      // lock for ~ 6 months
      const unlockTime = BigNumber.from(currentTime + 6 * MONTH)
        .div(WEEK)
        .mul(WEEK);
      const lockAmount = tokenAmountToBigNumber("15");

      const apyBalance = await apy.balanceOf(user.address);

      await apy.connect(user).approve(blApy.address, lockAmount);
      await blApy.connect(user).create_lock(lockAmount, unlockTime);

      expect(await apy.balanceOf(user.address)).to.equal(
        apyBalance.sub(lockAmount)
      );

      expect(await blApy["balanceOf(address)"](user.address)).to.be.gt(
        lockAmount.mul(86400 * (30 * 6 - 7)).div(86400 * 365 * 4)
      );

      await expect(blApy.connect(user).withdraw()).to.be.revertedWith(
        "The lock didn't expire"
      );

      await blApy.connect(deployer).shutdown();

      await expect(blApy.connect(user).withdraw()).to.not.be.reverted;
      expect(await apy.balanceOf(user.address)).to.equal(apyBalance);
    });

    it("Withdraw properly updates user locked and supply", async () => {
      const currentTime = (await ethers.provider.getBlock()).timestamp;
      // lock for ~ 6 months
      const unlockTime = BigNumber.from(currentTime + 6 * MONTH)
        .div(WEEK)
        .mul(WEEK);
      const lockAmount = tokenAmountToBigNumber("15");

      await apy.connect(user).approve(blApy.address, lockAmount);
      await blApy.connect(user).create_lock(lockAmount, unlockTime);

      await apy.connect(anotherUser).approve(blApy.address, lockAmount);
      await blApy.connect(anotherUser).create_lock(lockAmount, unlockTime);

      await blApy.connect(deployer).shutdown();
      await blApy.connect(anotherUser).withdraw();

      expect(await blApy.supply()).to.equal(lockAmount);
      expect(await blApy.locked(user.address)).to.deep.equal([
        lockAmount,
        unlockTime,
      ]);
      expect(await blApy.locked(anotherUser.address)).to.deep.equal([
        BigNumber.from(0),
        BigNumber.from(0),
      ]);
    });

    it("`balanceOf` and `totalSupply` should be frozen", async () => {
      const currentTime = (await ethers.provider.getBlock()).timestamp;

      // user 1 creates lock
      const userUnlockTime = BigNumber.from(currentTime + 6 * MONTH); // lock for 6 months
      const userLockAmount = tokenAmountToBigNumber("15");

      await apy.connect(user).approve(blApy.address, userLockAmount);
      await blApy.connect(user).create_lock(userLockAmount, userUnlockTime);

      // ... and extends lock
      await blApy.connect(user).increase_unlock_time(userUnlockTime.add(WEEK));

      // user 2 creates lock
      const anotherUnlockTime = BigNumber.from(currentTime + 1 * MONTH); // lock for 1 month
      let anotherLockAmount = tokenAmountToBigNumber("88");

      await apy.connect(anotherUser).approve(blApy.address, anotherLockAmount);
      await blApy
        .connect(anotherUser)
        .create_lock(anotherLockAmount, anotherUnlockTime);

      // ... and extends amount
      const extraLockAmount = tokenAmountToBigNumber("5");
      anotherLockAmount = anotherLockAmount.add(extraLockAmount);
      await apy.connect(anotherUser).approve(blApy.address, extraLockAmount);
      await blApy.connect(anotherUser).increase_amount(extraLockAmount);

      const userBlappies = await blApy["balanceOf(address)"](user.address);
      const anotherUserBlappies = await blApy["balanceOf(address)"](
        anotherUser.address
      );
      const totalSupply = await blApy["totalSupply()"]();

      // shutdown and user 1 withdraws
      await blApy.connect(deployer).shutdown();
      await blApy.connect(user).withdraw();

      // blAPY state should remain the same for all users
      expect(await blApy["balanceOf(address)"](user.address)).to.be.gt(
        userBlappies.sub(userLockAmount.mul(DAY).div(MAXTIME))
      );
      expect(await blApy["balanceOf(address)"](anotherUser.address)).to.be.gt(
        anotherUserBlappies.sub(anotherLockAmount.mul(DAY).div(MAXTIME))
      );
      expect(await blApy["totalSupply()"]()).to.be.gt(
        totalSupply.sub(totalSupply.mul(DAY).div(MAXTIME))
      );
    });
  });
});
