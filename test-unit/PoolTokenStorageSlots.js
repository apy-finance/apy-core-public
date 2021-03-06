const hre = require("hardhat");
const { artifacts, ethers, waffle, web3 } = hre;
const { BigNumber } = ethers;
const { expect } = require("chai");
const { deployMockContract } = waffle;
const { console } = require("../utils/helpers");
const AddressRegistryV2 = artifacts.require("AddressRegistryV2");

const ZERO_DATA =
  "0000000000000000000000000000000000000000000000000000000000000000";

/*
This is the expected storage layout of the APT contract, based on
the following external package:

@openzeppelin/openzeppelin-ethereum-packages@3.0.0

-------------------------------------------------------------
The C3-linearization was logically derived and then validated using
the `surya` package:

$ yarn surya dependencies PoolToken contracts/PoolToken.sol

PoolToken
  ↖ ERC20UpgradeSafe
  ↖ PausableUpgradeSafe
  ↖ ReentrancyGuardUpgradeSafe
  ↖ OwnableUpgradeSafe
  ↖ Initializable
  ↖ ILiquidityPool

$ yarn surya dependencies PoolTokenV2 contracts/pool/PoolTokenV2.sol

PoolTokenV2
  ↖ IEmergencyExit
  ↖ ERC20UpgradeSafe
  ↖ PausableUpgradeSafe
  ↖ ReentrancyGuardUpgradeSafe
  ↖ AccessControlUpgradeSafe
  ↖ Initializable
  ↖ ILockingPool
  ↖ IWithdrawFeePool
  ↖ IReservePool
  ↖ IPoolToken
  ↖ ILiquidityPoolV2

$ yarn surya dependencies PoolTokenV3 contracts/pool/PoolTokenV3.sol

PoolTokenV3
  ↖ IEmergencyExit
  ↖ ERC20UpgradeSafe
  ↖ PausableUpgradeSafe
  ↖ ReentrancyGuardUpgradeSafe
  ↖ AccessControlUpgradeSafe
  ↖ Initializable
  ↖ ILockingPool
  ↖ IWithdrawFeePoolV2
  ↖ IReservePool
  ↖ IPoolToken
  ↖ ILiquidityPoolV2
-------------------------------------------------------------

Initializable:
  0 bool initialized;
  0 bool initializing;
  1-50 uint256[50] ______gap;
ContextUpgradeSafe:
  51-100 uint256[50] __gap;
OwnableUpgradeSafe:
  // 101 address _owner; <-- repurposed in V2
  102-150 uint256[49] __gap;
ReentrancyGuardUpgradeSafe:
  151 bool _notEntered;
  152-200 uint256[49] __gap;
PausableUpgradeSafe:
  201 bool _paused;
  202-250 uint256[49] __gap;
ERC20UpgradeSafe:
  251 mapping (address => uint256) _balances;
  252 mapping (address => mapping (address => uint256)) _allowances;
  253 uint256 _totalSupply;
  254 string _name;
  255 string _symbol;
  256 uint8 _decimals;
  257-300 uint256[44] __gap;

APY.Finance APT V1
  301 address proxyAdmin;
  301 bool addLiquidityLock;
  301 bool redeemLock;
  302 IDetailedERC20 underlyer;
  // 303 AggregatorV3Interface priceAgg; <-- replaced in V2

APY.Finance APT V2
  101 mapping (bytes32 => RoleData) _roles; <-- repurposes V1 slot
  303 IAddressRegistryV2 addressRegistry; <-- replaces V1 slot
  304 uint256 feePeriod; <-- renamed in V3
  305 uint256 feePercentage; <-- renamed in V3
  306 mapping(address => uint256) lastDepositTime;
  307 uint256 reservePercentage;

APY.Finance APT V3
  308 uint256 withdrawalFee
*/

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("APT V3 retains V1 and V2 storage slot positions", () => {
  const [name, symbol, decimals] = ["APY Pool Token", "APT", 18];
  const [minted, transferred, allowance] = [100e6, 30e6, 10e6];
  const timestamp = 1646428114;

  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpAccount;
  let mApt;
  let user;
  let otherUser;

  let poolToken;
  let proxyAdmin;
  let agg;
  let underlyer;
  let addressRegistry;

  before(async () => {
    [deployer, emergencySafe, adminSafe, lpAccount, mApt, user, otherUser] =
      await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const PoolTokenProxy = await ethers.getContractFactory("PoolTokenProxy");
    const PoolToken = await ethers.getContractFactory("TestPoolToken");
    const PoolTokenV2 = await ethers.getContractFactory("TestPoolTokenV2");
    const PoolTokenV3 = await ethers.getContractFactory("TestPoolTokenV3");

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    agg = await deployMockContract(deployer, []);
    underlyer = await deployMockContract(deployer, []);
    addressRegistry = await deployMockContract(deployer, AddressRegistryV2.abi);

    // these addresses are assigned roles in PoolTokenV2 init
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);
    await addressRegistry.mock.mAptAddress.returns(mApt.address);

    const logicV1 = await PoolToken.deploy();
    await logicV1.deployed();
    const proxy = await PoolTokenProxy.deploy(
      logicV1.address,
      proxyAdmin.address,
      underlyer.address,
      agg.address
    );
    await proxy.deployed();

    const logicV2 = await PoolTokenV2.deploy();
    await logicV2.deployed();

    const initV2Data = PoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [addressRegistry.address]
    );
    await proxyAdmin
      .connect(deployer)
      .upgradeAndCall(proxy.address, logicV2.address, initV2Data);

    const logicV3 = await PoolTokenV3.deploy();
    await logicV3.deployed();

    const initV3Data = PoolTokenV3.interface.encodeFunctionData(
      "initializeV3()",
      []
    );
    await proxyAdmin
      .connect(deployer)
      .upgradeAndCall(proxy.address, logicV3.address, initV3Data);

    poolToken = await PoolTokenV3.attach(proxy.address);

    await poolToken.connect(emergencySafe).emergencyLock();
    await poolToken.testMint(deployer.address, minted);
    await poolToken.connect(emergencySafe).emergencyLockAddLiquidity();
    await poolToken.connect(emergencySafe).emergencyLockRedeem();
    await poolToken.testTransfer(deployer.address, user.address, transferred);
    await poolToken.approve(otherUser.address, allowance);
    await poolToken.testSetLastDepositTime(deployer.address, timestamp);
  });

  it("Retains V1 storage slots 0 through 302", async () => {
    const numSlots = 308;
    const slots = [];
    for (let i = 0; i < numSlots; i++) {
      const data = await readSlot(poolToken.address, i);
      console.debug(`${i}: ${data}`);
      slots.push(data);
    }

    // 0 bool initialized;
    // 0 bool initializing;
    // NOTE: tight-packing will right-align
    expect(slots[0].slice(-4, -2)).to.equal("00"); // initializing
    expect(slots[0].slice(-2)).to.equal("01"); // initialized

    // 101 address _owner;
    // NOTE: in the V2 upgrade, this slot has been repurposed
    // for AccessControl's _roles mapping
    expect(parseAddress(slots[101])).to.equal(deployer.address);
    // 151 bool _notEntered;
    expect(slots[151].slice(-2)).to.equal("01");
    // 201 bool _paused;
    expect(slots[201].slice(-2)).to.equal("01");
    // 251 mapping (address => uint256) _balances;
    expect(slots[251]).to.equal(ZERO_DATA);
    // 252 mapping (address => mapping (address => uint256)) _allowances;
    expect(slots[252]).to.equal(ZERO_DATA);
    // 253 uint256 _totalSupply;
    expect(parseUint(slots[253])).to.equal(minted);
    // 254 string _name;
    expect(parseString(slots[254])).to.equal(name);
    // 255 string _symbol;
    expect(parseString(slots[255])).to.equal(symbol);
    // 256 uint8 _decimals;
    expect(parseUint(slots[256])).to.equal(decimals);
    // 301 address proxyAdmin;
    // 301 bool addLiquidityLock;
    // 301 bool redeemLock;
    expect(parseAddress(slots[301])).to.equal(proxyAdmin.address);
    expect(slots[301].slice(0, 24).slice(-4)).to.equal("0101");
    // 302 IDetailedERC20 underlyer;
    expect(parseAddress(slots[302])).to.equal(underlyer.address);
  });

  it("Replaces V1 slot 303", async () => {
    // 303 AggregatorV3Interface priceAgg; <-- replaced in V2
    // 303 IAddressRegistryV2 addressRegistry; <-- replaces V1 slot
    const data = await readSlot(poolToken.address, 303);
    console.debug(`${303}: ${data}`);
    expect(parseAddress(data)).to.equal(addressRegistry.address);
  });

  it("Retains V1 storage slots for balances mapping", async () => {
    // _balances[deployer]
    let v = parseInt(
      await readSlot(
        poolToken.address,
        addressMappingSlot(deployer.address, 251)
      ),
      16
    );
    expect(v).to.equal(minted - transferred);

    // _balances[user]
    v = parseInt(
      await readSlot(poolToken.address, addressMappingSlot(user.address, 251)),
      16
    );
    expect(v).to.equal(transferred);
  });

  it("Retains V1 storage slots for allowances mapping", async () => {
    // _allowances[deployer][user]
    let v = parseInt(
      await readSlot(
        poolToken.address,
        address2MappingSlot(deployer.address, user.address, 252)
      ),
      16
    );
    expect(v).to.equal(0);

    // _allowances[deployer][otherUser]
    v = parseInt(
      await readSlot(
        poolToken.address,
        address2MappingSlot(deployer.address, otherUser.address, 252)
      ),
      16
    );
    expect(v).to.equal(allowance);
  });

  it("Roles mapping replacing slot 101 uses expected slots", async () => {
    // 101 address _owner; <-- repurposed in V2
    // 101 mapping (bytes32 => RoleData) _roles; <-- repurposes V1 slot
    //
    // PoolTokenV2's init function will setup roles, which is a
    //
    // mapping (bytes32 => struct)
    //
    // with the struct being
    //
    // RoleData {
    //   EnumerableSet.AddressSet members;
    //   bytes32 adminRole;
    // }
    //
    // The struct starts with a dynamic array of values in the
    // EnumerableSet, so its first slot will hold the length of
    // the array.  This will be nonzero if the role has members.
    //
    // To check if position 101 is used in the mapping's key hash,
    // it suffices to check if the expected slot has nonzero data.
    const EMERGENCY_ROLE = await poolToken.EMERGENCY_ROLE();
    let data = await readSlot(
      poolToken.address,
      bytes32MappingSlot(EMERGENCY_ROLE, 101)
    );
    expect(data).to.not.equal(ZERO_DATA);

    const ADMIN_ROLE = await poolToken.ADMIN_ROLE();
    data = await readSlot(
      poolToken.address,
      bytes32MappingSlot(ADMIN_ROLE, 101)
    );
    expect(data).to.not.equal(ZERO_DATA);
  });

  it("Retains v2 storage slots 304 through 307", async () => {
    const numSlots = 308;
    const slots = [];
    for (let i = 0; i < numSlots; i++) {
      const data = await readSlot(poolToken.address, i);
      console.debug(`${i}: ${data}`);
      slots.push(data);
    }

    // 304 uint256 feePeriod; renamed to `arbitrageFeePeriod`
    expect(parseUint(slots[304])).to.equal(24 * 60 * 60);
    // 305 uint256 feePercentage; renamed to `arbitrageFee`
    expect(parseUint(slots[305])).to.equal(5);
    // 306 mapping(address => uint256) lastDepositTime;
    expect(slots[306]).to.equal(ZERO_DATA);
    // 307 uint256 reservePercentage;
    expect(parseUint(slots[307])).to.equal(5);
  });

  it("Retains V2 storage slot for lastDepositTime mapping", async () => {
    // lastDepositTime[deployer]
    let v = parseInt(
      await readSlot(
        poolToken.address,
        addressMappingSlot(deployer.address, 306)
      ),
      16
    );
    expect(v).to.equal(timestamp);
  });
});

async function readSlot(address, slot) {
  const data = await web3.eth.getStorageAt(address, slot);
  return data.replace(/^0x/, "");
}

function parseAddress(hex) {
  return web3.utils.toChecksumAddress(hex.slice(-40).padStart(40, "0"));
}

function parseString(hex) {
  const len = parseInt(hex.slice(-2), 16);
  return Buffer.from(hex.slice(0, len), "hex").toString("utf8");
}

function parseUint(hex) {
  return BigNumber.from("0x" + hex);
}

function encodeUint(value) {
  return BigNumber.from(value).toHexString().padStart(64, "0");
}

function encodeAddress(address) {
  return address.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

function addressMappingSlot(address, position) {
  return web3.utils.keccak256(
    "0x" + encodeAddress(address) + encodeUint(position)
  );
}

function address2MappingSlot(address, address_2, position) {
  return web3.utils.keccak256(
    "0x" +
      encodeAddress(address_2) +
      addressMappingSlot(address, position).slice(2)
  );
}

function bytes32MappingSlot(address, position) {
  // same encoding logic as for address mapping
  return addressMappingSlot(address, position);
}
