const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  ZERO_ADDRESS,
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
} = require("../utils/helpers");
const { deployMockContract } = waffle;

const MAINNET_ADDRESS_REGISTRY_DEPLOYER =
  "0x720edBE8Bb4C3EA38F370bFEB429D715b48801e3";
const MAINNET_ADDRESS_REGISTRY_PROXY_ADMIN =
  "0xFbF6c940c1811C3ebc135A9c4e39E042d02435d1";
const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

const CALL = 0;

async function encodeRegisterAddress(contractIdString, contractAddress) {
  const AddressRegistryV2 = await ethers.getContractFactory(
    "AddressRegistryV2"
  );
  const data = AddressRegistryV2.interface.encodeFunctionData(
    "registerAddress(bytes32,address)",
    [bytes32(contractIdString), contractAddress]
  );
  return data;
}

describe("Contract: AlphaDeployment", () => {
  // signers
  let deployer;
  let emergencySafe;
  let lpSafe;

  // contract factories
  let AlphaDeployment;

  // mocked contracts
  let adminSafe;
  let addressRegistry;
  let addressRegistryProxyAdmin;

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
    // In particular, we need to reset the Mainnet accounts, otherwise
    // this will cause leakage into other test suites.  Doing a `beforeEach`
    // instead is viable but makes tests noticeably slower.
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  before("Setup mocks with Mainnet addresses", async () => {
    [deployer] = await ethers.getSigners();

    const owner = await impersonateAccount(MAINNET_ADDRESS_REGISTRY_DEPLOYER);
    await forciblySendEth(
      owner.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    // The Mainnet registry proxy admin was created on the first transaction
    // from the registry deployer.
    // Step 0 of alpha deployment depends on the existence of a proxy admin
    // at the Mainnet address.
    addressRegistryProxyAdmin = await deployMockContract(
      owner,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    expect(addressRegistryProxyAdmin.address).to.equal(
      MAINNET_ADDRESS_REGISTRY_PROXY_ADMIN
    );
    // Set the nonce to 3 before deploying the mock contract with the
    // Mainnet registry deployer; this will ensure the mock address
    // matches Mainnet.
    await hre.network.provider.send("hardhat_setNonce", [
      MAINNET_ADDRESS_REGISTRY_DEPLOYER,
      "0x3",
    ]);
    addressRegistry = await deployMockContract(
      owner,
      artifacts.readArtifactSync("AddressRegistryV2").abi
    );
    expect(addressRegistry.address).to.equal(MAINNET_ADDRESS_REGISTRY);
  });

  before("Register Safes", async () => {
    [, emergencySafe, lpSafe] = await ethers.getSigners();

    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("lpSafe"))
      .returns(lpSafe.address);

    // mock the Admin Safe to allow module function calls
    adminSafe = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IGnosisModuleManager").abi
    );
    await adminSafe.mock.execTransactionFromModule.returns(true);
    // register the address
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);

    AlphaDeployment = await ethers.getContractFactory("TestAlphaDeployment");
  });

  it("constructor", async () => {
    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;
    expect(await alphaDeployment.step()).to.equal(0);
  });

  it("deploy_0_AddressRegistryV2_upgrade", async () => {
    // mock logic storage initialize
    const logicV2 = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("AddressRegistryV2").abi
    );
    await logicV2.mock.initialize.returns();
    // mock the factory create
    const addressRegistryV2Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("AddressRegistryV2Factory").abi
    );
    await addressRegistryV2Factory.mock.create.returns(logicV2.address);
    // mock the upgrade call
    await addressRegistryProxyAdmin.mock.upgrade.returns();

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        addressRegistryV2Factory.address, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for ownership check:
    await addressRegistry.mock.owner.returns(adminSafe.address);
    await addressRegistryProxyAdmin.mock.owner.returns(adminSafe.address);

    await alphaDeployment.deploy_0_AddressRegistryV2_upgrade();
  });

  it("deploy_1_MetaPoolToken", async () => {
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    const metaPoolTokenFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("MetaPoolTokenFactory").abi
    );
    metaPoolTokenFactory.mock.create.returns(mAptAddress);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        metaPoolTokenFactory.address, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(1);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registration
    const data = await encodeRegisterAddress("mApt", mAptAddress);
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_1_MetaPoolToken()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);

    // check address set properly
    expect(await alphaDeployment.mApt()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_1_MetaPoolToken()).to.not.be.reverted;
    expect(await alphaDeployment.mApt()).to.equal(mAptAddress);
  });

  it("deploy_2_PoolTokenV2_logic", async () => {
    // need to mock logic storage init
    const logicV2 = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2").abi
    );
    await logicV2.mock.initialize.returns();
    // mock the v2 logic create
    const poolTokenV2Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2Factory").abi
    );
    poolTokenV2Factory.mock.create.returns(logicV2.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(2);

    // check address set properly
    expect(await alphaDeployment.poolTokenV2()).to.equal(ZERO_ADDRESS);
    // await expect(alphaDeployment.deploy_2_PoolTokenV2_logic()).to.not.be
    //   .reverted;
    await alphaDeployment.deploy_2_PoolTokenV2_logic();
    expect(await alphaDeployment.poolTokenV2()).to.equal(logicV2.address);
  });

  it("deploy_3_DemoPools", async () => {
    // mock the proxy admin create and owner transfer
    const proxyAdmin = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdmin").abi
    );
    await proxyAdmin.mock.changeProxyAdmin.returns();
    const proxyAdminFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ProxyAdminFactory").abi
    );
    proxyAdminFactory.mock.create.returns(proxyAdmin.address);

    // mock the v1 proxy create
    const demoPoolAddress = (await deployMockContract(deployer, [])).address;
    const poolTokenV1Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV1Factory").abi
    );
    poolTokenV1Factory.mock.create.returns(demoPoolAddress);

    // need to mock logic storage init
    const logicV2 = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2").abi
    );
    await logicV2.mock.initialize.returns();
    // mock the v2 logic create
    const poolTokenV2Factory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("PoolTokenV2Factory").abi
    );
    poolTokenV2Factory.mock.create.returns(logicV2.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        proxyAdminFactory.address, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        poolTokenV1Factory.address, // pool token v1 factory
        poolTokenV2Factory.address, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(3);

    // for deployed address check
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // need to mock the upgrade
    await proxyAdmin.mock.upgradeAndCall.returns();

    // check for address registrations
    // DAI
    let data = await encodeRegisterAddress("daiDemoPool", demoPoolAddress);
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_3_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);
    // USDC
    data = await encodeRegisterAddress("usdcDemoPool", demoPoolAddress);
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_3_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);
    // USDT
    data = await encodeRegisterAddress("usdtDemoPool", demoPoolAddress);
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_3_DemoPools()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);

    // check address set properly
    expect(await alphaDeployment.daiDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(ZERO_ADDRESS);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_3_DemoPools()).to.not.be.reverted;
    expect(await alphaDeployment.daiDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdcDemoPool()).to.equal(demoPoolAddress);
    expect(await alphaDeployment.usdtDemoPool()).to.equal(demoPoolAddress);
  });

  it("deploy_4_TvlManager", async () => {
    // mock erc20 allocation
    const erc20AllocationFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("Erc20AllocationFactory").abi
    );
    const erc20Allocation = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("Erc20Allocation").abi
    );
    await erc20AllocationFactory.mock.create.returns(erc20Allocation.address);
    // mock tvl manager
    const tvlManagerFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("TvlManagerFactory").abi
    );
    const tvlManager = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("TvlManager").abi
    );
    await tvlManagerFactory.mock.create.returns(tvlManager.address);
    // mock registering erc20 allocation through Admin Safe
    const TvlManager = await ethers.getContractFactory("TvlManager");
    const encodedRegisterAllocation = TvlManager.interface.encodeFunctionData(
      "registerAssetAllocation(address)",
      [erc20Allocation.address]
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(tvlManager.address, 0, encodedRegisterAllocation, CALL)
      .returns(true);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        tvlManagerFactory.address, // tvl manager factory
        erc20AllocationFactory.address, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(4);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registrations
    // 1. TvlManager
    let data = await encodeRegisterAddress("tvlManager", tvlManager.address);
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_4_TvlManager()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);
    // 2. Erc20Allocation
    data = await encodeRegisterAddress(
      "erc20Allocation",
      erc20Allocation.address
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_4_TvlManager()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);

    // check TVL Manager address set properly
    expect(await alphaDeployment.tvlManager()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_4_TvlManager()).to.not.be.reverted;
    expect(await alphaDeployment.tvlManager()).to.equal(tvlManager.address);
  });

  it("deploy_5_LpAccount", async () => {
    const lpAccountAddress = (await deployMockContract(deployer, [])).address;
    const lpAccountFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("LpAccountFactory").abi
    );
    lpAccountFactory.mock.create.returns(lpAccountAddress);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        FAKE_ADDRESS, // oracle adapter factory
        lpAccountFactory.address // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(5);

    // for deployed address check:
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registration
    const data = await encodeRegisterAddress("lpAccount", lpAccountAddress);
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_5_LpAccount()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);

    // check address set properly
    expect(await alphaDeployment.lpAccount()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_5_LpAccount()).to.not.be.reverted;
    expect(await alphaDeployment.lpAccount()).to.equal(lpAccountAddress);
  });

  it("deploy_6_OracleAdapter", async () => {
    const oracleAdapterFactory = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("OracleAdapterFactory").abi
    );
    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("OracleAdapter").abi
    );
    await oracleAdapterFactory.mock.create.returns(oracleAdapter.address);

    const alphaDeployment = await expect(
      AlphaDeployment.deploy(
        FAKE_ADDRESS, // proxy admin factory
        FAKE_ADDRESS, // proxy factory
        FAKE_ADDRESS, // address registry v2 factory
        FAKE_ADDRESS, // mAPT factory
        FAKE_ADDRESS, // pool token v1 factory
        FAKE_ADDRESS, // pool token v2 factory
        FAKE_ADDRESS, // tvl manager factory
        FAKE_ADDRESS, // erc20 allocation factory
        oracleAdapterFactory.address, // oracle adapter factory
        FAKE_ADDRESS // lp account factory
      )
    ).to.not.be.reverted;

    // for step check
    await alphaDeployment.testSetStep(6);

    // for deployed address check:
    // 1. deploy and register mock mAPT
    const mAptAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("mApt"))
      .returns(mAptAddress);
    await alphaDeployment.testSetMapt(mAptAddress);
    // 2. deploy and register mock LpAccount
    const lpAccountAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("lpAccount"))
      .returns(lpAccountAddress);
    await alphaDeployment.testSetLpAccount(lpAccountAddress);
    // 3. deploy and register mock TvlManager
    const tvlManagerAddress = (await deployMockContract(deployer, [])).address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManagerAddress);
    await alphaDeployment.testSetTvlManager(tvlManagerAddress);
    // 4. deploy and register mock Erc20Allocation
    const erc20AllocationAddress = (await deployMockContract(deployer, []))
      .address;
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("erc20Allocation"))
      .returns(erc20AllocationAddress);
    await alphaDeployment.testSetErc20Allocation(erc20AllocationAddress);

    // for ownership check
    await addressRegistry.mock.owner.returns(adminSafe.address);

    // check for address registrations
    const data = await encodeRegisterAddress(
      "oracleAdapter",
      oracleAdapter.address
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .revertsWithReason("ADDRESS_REGISTERED");
    await expect(alphaDeployment.deploy_6_OracleAdapter()).to.be.revertedWith(
      "ADDRESS_REGISTERED"
    );
    await adminSafe.mock.execTransactionFromModule
      .withArgs(addressRegistry.address, 0, data, CALL)
      .returns(true);

    // check Oracle Adapter address set properly
    expect(await alphaDeployment.oracleAdapter()).to.equal(ZERO_ADDRESS);
    await expect(alphaDeployment.deploy_6_OracleAdapter()).to.not.be.reverted;
    expect(await alphaDeployment.oracleAdapter()).to.equal(
      oracleAdapter.address
    );
  });
});
