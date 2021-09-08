// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {Ownable} from "contracts/common/Imports.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";
import {MetaPoolTokenProxy} from "contracts/mapt/MetaPoolTokenProxy.sol";
import {PoolToken} from "contracts/pool/PoolToken.sol";
import {PoolTokenProxy} from "contracts/pool/PoolTokenProxy.sol";
import {PoolTokenV2} from "contracts/pool/PoolTokenV2.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";
import {Erc20Allocation} from "contracts/tvl/Erc20Allocation.sol";
import {TvlManager} from "contracts/tvl/TvlManager.sol";
import {OracleAdapter} from "contracts/oracle/OracleAdapter.sol";
import {
    ProxyAdmin,
    TransparentUpgradeableProxy
} from "contracts/proxy/Imports.sol";

import {DeploymentConstants} from "./constants.sol";
import {
    AddressRegistryV2Factory,
    LpAccountFactory,
    MetaPoolTokenFactory,
    OracleAdapterFactory,
    ProxyAdminFactory,
    PoolTokenV1Factory,
    PoolTokenV2Factory,
    ProxyFactory,
    TvlManagerFactory
} from "./factories.sol";

/** @dev
# Alpha Deployment

## Deployment order of contracts

The address registry needs multiple addresses registered
to setup the roles for access control in the contract
constructors:

MetaPoolToken

- emergencySafe (emergency role, default admin role)
- lpSafe (LP role)

PoolTokenV2

- emergencySafe (emergency role, default admin role)
- adminSafe (admin role)
- mApt (contract role)

TvlManager

- emergencySafe (emergency role, default admin role)
- lpSafe (LP role)

OracleAdapter

- emergencySafe (emergency role, default admin role)
- adminSafe (admin role)
- tvlManager (contract role)
- mApt (contract role)

LpAccount

- emergencySafe (emergency role, default admin role)
- adminSafe (admin role)
- lpSafe (LP role)

Note the order of dependencies: a contract requires contracts
above it in the list to be deployed first. Thus we need
to deploy in the order given, starting with the Safes.

*/

/* solhint-disable max-states-count, func-name-mixedcase */
contract AlphaDeployment is Ownable, DeploymentConstants {
    // TODO: figure out a versioning scheme
    uint256 public constant VERSION = 1;

    IAddressRegistryV2 public addressRegistry;

    address public immutable proxyAdminFactory;
    address public immutable proxyFactory;
    address public immutable addressRegistryV2Factory;
    address public immutable mAptFactory;
    address public immutable poolTokenV1Factory;
    address public immutable poolTokenV2Factory;
    address public immutable tvlManagerFactory;
    address public immutable oracleAdapterFactory;
    address public immutable lpAccountFactory;

    uint256 public step;

    address public immutable emergencySafe;
    address public immutable adminSafe;
    address public immutable lpSafe;

    // step 1
    address public mApt;

    // step 2
    address public daiDemoPool;
    address public usdcDemoPool;
    address public usdtDemoPool;

    // step 3
    address public tvlManager;

    // step 4
    address public oracleAdapter;

    // step 5
    address public lpAccount;

    // step 6
    // pool v2 upgrades
    address public poolTokenV2;

    modifier updateStep(uint256 step_) {
        require(step == step_, "INVALID_STEP");
        _;
        step += 1;
    }

    constructor(
        address proxyAdminFactory_,
        address proxyFactory_,
        address addressRegistryV2Factory_,
        address mAptFactory_,
        address poolTokenV1Factory_,
        address poolTokenV2Factory_,
        address tvlManagerFactory_,
        address oracleAdapterFactory_,
        address lpAccountFactory_
    ) public {
        addressRegistry = IAddressRegistryV2(ADDRESS_REGISTRY_PROXY);

        // Simplest to check now that Safes are deployed in order to
        // avoid repeated preconditions checks later.
        emergencySafe = addressRegistry.getAddress("emergencySafe");
        adminSafe = addressRegistry.getAddress("adminSafe");
        lpSafe = addressRegistry.getAddress("lpSafe");

        proxyAdminFactory = proxyAdminFactory_;
        proxyFactory = proxyFactory_;
        addressRegistryV2Factory = addressRegistryV2Factory_;
        mAptFactory = mAptFactory_;
        poolTokenV1Factory = poolTokenV1Factory_;
        poolTokenV2Factory = poolTokenV2Factory_;
        tvlManagerFactory = tvlManagerFactory_;
        oracleAdapterFactory = oracleAdapterFactory_;
        lpAccountFactory = lpAccountFactory_;
    }

    /**
     * @dev
     *   Check a contract address from a previous step's deployment
     *   is registered with expected ID.
     *
     * @param registeredIds identifiers for the Address Registry
     * @param deployedAddresses addresses from previous steps' deploys
     */
    function checkRegisteredDependencies(
        bytes32[] memory registeredIds,
        address[] memory deployedAddresses
    ) public view virtual {
        for (uint256 i = 0; i < registeredIds.length; i++) {
            require(
                addressRegistry.getAddress(registeredIds[i]) ==
                    deployedAddresses[i],
                "MISSING_DEPLOYED_ADDRESS"
            );
        }
    }

    /**
     * @dev
     *   Check the deployment contract has ownership of necessary
     *   contracts to perform actions, e.g. register an address or upgrade
     *   a proxy.
     *
     * @param ownedContracts addresses that should be owned by this contract
     */
    function checkOwnerships(address[] memory ownedContracts)
        public
        view
        virtual
    {
        for (uint256 i = 0; i < ownedContracts.length; i++) {
            require(
                Ownable(ownedContracts[i]).owner() == address(this),
                "MISSING_OWNERSHIP"
            );
        }
    }

    function deploy_0_AddressRegistryV2_upgrade()
        external
        onlyOwner
        updateStep(0)
        returns (address)
    {
        address[] memory ownedContracts = new address[](1);
        ownedContracts[0] = ADDRESS_REGISTRY_PROXY_ADMIN;
        checkOwnerships(ownedContracts);

        address logicV2 =
            AddressRegistryV2Factory(addressRegistryV2Factory).create();
        ProxyAdmin(ADDRESS_REGISTRY_PROXY_ADMIN).upgrade(
            TransparentUpgradeableProxy(payable(ADDRESS_REGISTRY_PROXY)),
            logicV2
        );
    }

    /// @dev Deploy the mAPT proxy and its proxy admin.
    ///      Does not register any roles for contracts.
    function deploy_1_MetaPoolToken()
        external
        onlyOwner
        updateStep(1)
        returns (address)
    {
        address[] memory ownedContracts = new address[](1);
        ownedContracts[0] = address(addressRegistry);
        checkOwnerships(ownedContracts);

        address newOwner = msg.sender; // will own the proxy admin
        address proxyAdmin = ProxyAdminFactory(proxyAdminFactory).create();
        bytes memory initData =
            abi.encodeWithSignature(
                "initialize(address,address)",
                proxyAdmin,
                addressRegistry
            );
        mApt = MetaPoolTokenFactory(mAptFactory).create(
            proxyFactory,
            proxyAdmin,
            initData
        );
        addressRegistry.registerAddress("mApt", mApt);

        ProxyAdmin(proxyAdmin).transferOwnership(newOwner);
        return mApt;
    }

    /// @dev complete proxy deploy for the demo pools
    ///      Registers mAPT for a contract role.
    function deploy_2_DemoPools() external onlyOwner updateStep(2) {
        bytes32[] memory registeredIds = new bytes32[](1);
        address[] memory deployedAddresses = new address[](1);
        (registeredIds[0], deployedAddresses[0]) = ("mApt", mApt);
        checkRegisteredDependencies(registeredIds, deployedAddresses);

        address[] memory ownedContracts = new address[](2);
        ownedContracts[0] = address(addressRegistry);
        ownedContracts[1] = POOL_PROXY_ADMIN;
        checkOwnerships(ownedContracts);

        address fakeAggAddress = 0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe;
        bytes memory daiInitData =
            abi.encodeWithSignature(
                "initialize(address,address,address)",
                POOL_PROXY_ADMIN,
                DAI_ADDRESS,
                fakeAggAddress
            );

        address logicV2 = PoolTokenV2Factory(poolTokenV2Factory).create();
        bytes memory initDataV2 =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                address(addressRegistry)
            );

        address daiProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyFactory,
                POOL_PROXY_ADMIN,
                daiInitData
            );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            PoolTokenProxy(payable(daiProxy)),
            logicV2,
            initDataV2
        );
        addressRegistry.registerAddress("daiDemoPool", daiProxy);
        daiDemoPool = daiProxy;

        bytes memory usdcInitData =
            abi.encodeWithSignature(
                "initialize(address,address,address)",
                POOL_PROXY_ADMIN,
                USDC_ADDRESS,
                fakeAggAddress
            );
        address usdcProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyFactory,
                POOL_PROXY_ADMIN,
                usdcInitData
            );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            PoolTokenProxy(payable(usdcProxy)),
            logicV2,
            initDataV2
        );
        addressRegistry.registerAddress("usdcDemoPool", usdcProxy);
        usdcDemoPool = usdcProxy;

        bytes memory usdtInitData =
            abi.encodeWithSignature(
                "initialize(address,address,address)",
                POOL_PROXY_ADMIN,
                USDT_ADDRESS,
                fakeAggAddress
            );
        address usdtProxy =
            PoolTokenV1Factory(poolTokenV1Factory).create(
                proxyFactory,
                POOL_PROXY_ADMIN,
                usdtInitData
            );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            PoolTokenProxy(payable(usdtProxy)),
            logicV2,
            initDataV2
        );
        addressRegistry.registerAddress("usdtDemoPool", usdtProxy);
        usdtDemoPool = usdtProxy;
    }

    /// @dev Deploy ERC20 allocation and TVL Manager.
    ///      Does not register any roles for contracts.
    function deploy_3_TvlManager()
        external
        onlyOwner
        updateStep(3)
        returns (address)
    {
        checkRegisteredDependencies(new bytes32[](0), new address[](0));

        address[] memory ownedContracts = new address[](1);
        ownedContracts[0] = address(addressRegistry);
        checkOwnerships(ownedContracts);

        tvlManager = TvlManagerFactory(tvlManagerFactory).create(
            address(addressRegistry)
        );

        addressRegistry.registerAddress("tvlManager", address(tvlManager));
        return tvlManager;
    }

    /// @dev registers mAPT and TvlManager for contract roles
    function deploy_4_OracleAdapter()
        external
        onlyOwner
        updateStep(4)
        returns (address)
    {
        bytes32[] memory registeredIds = new bytes32[](2);
        address[] memory deployedAddresses = new address[](2);
        (registeredIds[0], deployedAddresses[0]) = ("mApt", mApt);
        (registeredIds[1], deployedAddresses[1]) = ("tvlManager", tvlManager);
        checkRegisteredDependencies(registeredIds, deployedAddresses);

        address[] memory ownedContracts = new address[](1);
        ownedContracts[0] = address(addressRegistry);
        checkOwnerships(ownedContracts);

        address[] memory assets = new address[](3);
        assets[0] = DAI_ADDRESS;
        assets[1] = USDC_ADDRESS;
        assets[2] = USDT_ADDRESS;

        address[] memory sources = new address[](3);
        sources[0] = DAI_USD_AGG_ADDRESS;
        sources[1] = USDC_USD_AGG_ADDRESS;
        sources[2] = USDT_USD_AGG_ADDRESS;

        uint256 aggStalePeriod = 86400;
        uint256 defaultLockPeriod = 270;

        oracleAdapter = OracleAdapterFactory(oracleAdapterFactory).create(
            address(addressRegistry),
            TVL_AGG_ADDRESS,
            assets,
            sources,
            aggStalePeriod,
            defaultLockPeriod
        );
        addressRegistry.registerAddress("oracleAdapter", oracleAdapter);
        return oracleAdapter;
    }

    /// @dev register mAPT for a contract role
    function deploy_5_LpAccount()
        external
        onlyOwner
        updateStep(5)
        returns (address)
    {
        bytes32[] memory registeredIds = new bytes32[](1);
        address[] memory deployedAddresses = new address[](1);
        (registeredIds[0], deployedAddresses[0]) = ("mApt", mApt);
        checkRegisteredDependencies(registeredIds, deployedAddresses);

        address[] memory ownedContracts = new address[](1);
        ownedContracts[0] = address(addressRegistry);
        checkOwnerships(ownedContracts);

        address newOwner = msg.sender; // will own the proxy admin
        address proxyAdmin = ProxyAdminFactory(proxyAdminFactory).create();

        bytes memory initData =
            abi.encodeWithSignature(
                "initialize(address,address)",
                proxyAdmin,
                address(addressRegistry)
            );

        lpAccount = LpAccountFactory(lpAccountFactory).create(
            proxyFactory,
            proxyAdmin,
            initData
        );
        addressRegistry.registerAddress("lpAccount", lpAccount);

        ProxyAdmin(proxyAdmin).transferOwnership(newOwner);
        return lpAccount;
    }

    /// @notice upgrade from v1 to v2
    /// @dev register mAPT for a contract role
    function deploy_6_PoolTokenV2_upgrade()
        external
        onlyOwner
        updateStep(6)
        returns (address)
    {
        bytes32[] memory registeredIds = new bytes32[](1);
        address[] memory deployedAddresses = new address[](1);
        (registeredIds[0], deployedAddresses[0]) = ("mApt", mApt);
        checkRegisteredDependencies(registeredIds, deployedAddresses);

        address[] memory ownedContracts = new address[](2);
        ownedContracts[0] = address(addressRegistry);
        ownedContracts[1] = POOL_PROXY_ADMIN;
        checkOwnerships(ownedContracts);

        address logicV2 = PoolTokenV2Factory(poolTokenV2Factory).create();
        bytes memory initData =
            abi.encodeWithSignature(
                "initializeUpgrade(address)",
                addressRegistry
            );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            TransparentUpgradeableProxy(payable(DAI_POOL_PROXY)),
            logicV2,
            initData
        );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            TransparentUpgradeableProxy(payable(USDC_POOL_PROXY)),
            logicV2,
            initData
        );
        ProxyAdmin(POOL_PROXY_ADMIN).upgradeAndCall(
            TransparentUpgradeableProxy(payable(USDT_POOL_PROXY)),
            logicV2,
            initData
        );

        poolTokenV2 = logicV2;
        return poolTokenV2;
    }

    function cleanup() external onlyOwner {
        handoffOwnership(ADDRESS_REGISTRY_PROXY_ADMIN);
        handoffOwnership(ADDRESS_REGISTRY_PROXY);
        handoffOwnership(POOL_PROXY_ADMIN);
    }

    function handoffOwnership(address ownedContract) public onlyOwner {
        Ownable(ownedContract).transferOwnership(msg.sender);
    }
}
/* solhint-enable func-name-mixedcase */