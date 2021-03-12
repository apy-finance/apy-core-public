// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IAccountFactory.sol";
import "./interfaces/IAssetAllocationRegistry.sol";
import "./APYPoolTokenV2.sol";
import "./APYMetaPoolToken.sol";
import "./APYAccount.sol";

/**
 * @title APY Manager
 * @author APY.Finance
 * @notice This is the V2 of the manager logic contract for use with the
 * manager proxy contract.
 *
 *--------------------
 * MANAGING CAPITAL
 *--------------------
 * The APY Manager orchestrates the movement of capital within the APY system.
 * This movement of capital occurs in two major ways:
 *
 * - Capital transferred to and from APYPoolToken contracts and the
 *   APYAccount contract with the following functions:
 *
 *   - fundAccount
 *   - fundAndExecute
 *   - withdrawFromAccount
 *   - executeAndWithdraw
 *
 * - Capital routed to and from other protocols using generic execution with
 *   the following functions:
 *
 *   - execute
 *   - fundAndExecute
 *   - executeAndWithdraw
 *
 * Transferring from the APYPoolToken contracts to the Account contract stages
 * capital for deployment to yield farming strategies. Transferring from the
 * Account contract to the APYPoolToken contracts is done to capital unwound
 * from yield farming strategies for the purpose of user withdrawal.
 *
 * Routing capital to yield farming strategies using generic execution assumes
 * capital has been staged in the Account contract. Generic execution is also
 * used to unwind capital from yield farming strategies in preperation for
 * user withdrawal.
 *
 *--------------------
 * UPDATING TVL
 *--------------------
 * When the APY Manager routes capital using generic execution it can also
 * register an asset allocation with the AssetAllocationRegistry. Registering
 * asset allocations is important for Chainlink to calculate accurate TVL
 * values.
 *
 * Any time a new asset is acquired by the APYAccount contract or when capital
 * is deployed as liquidity to a new protocol, a new asset allocation must be
 * registered so the capital can be properly tracked for TVL calculations.
 *
 * The reason this is done atomically with the generic execution that routes
 * capital is to prevent the possibility of blocks which the TVL calculation
 * does not match the state of capital held by the APYAccount contract.
 */
contract APYManager is Initializable, OwnableUpgradeSafe, IAccountFactory {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    APYMetaPoolToken public mApt;
    IAddressRegistry public addressRegistry;
    mapping(bytes32 => address) public override getAccount;
    bytes32[] internal _poolIds;

    /* ------------------------------- */

    event AdminChanged(address);
    event AccountDeployed(
        bytes32 accountId,
        address account,
        address generalExecutor
    );

    /**
     * @dev Since the proxy delegate calls to this "logic" contract, any
     * storage set by the logic contract's constructor during deploy is
     * disregarded and this function is needed to initialize the proxy
     * contract's storage according to this contract's layout.
     *
     * Since storage is not set yet, there is no simple way to protect
     * calling this function with owner modifiers.  Thus the OpenZeppelin
     * `initializer` modifier protects this function from being called
     * repeatedly.  It should be called during the deployment so that
     * it cannot be called by someone else later.
     */
    function initialize(
        address adminAddress,
        address payable _mApt,
        address _addressRegistry
    ) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        mApt = APYMetaPoolToken(_mApt);
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    /**
     * @dev Dummy function to show how one would implement an init function
     * for future upgrades.  Note the `initializer` modifier can only be used
     * once in the entire contract, so we can't use it here.  Instead,
     * we set the proxy admin address as a variable and protect this
     * function with `onlyAdmin`, which only allows the proxy admin
     * to call this function during upgrades.
     */
    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function deployAccount(bytes32 accountId, address generalExecutor)
        external
        override
        onlyOwner
        returns (address)
    {
        APYAccount account = new APYAccount(generalExecutor);
        getAccount[accountId] = address(account);
        emit AccountDeployed(accountId, address(account), generalExecutor);
        return address(account);
    }

    function fundAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        _registerAllocationData(viewData);
        _fundAccount(accountId, allocation);
    }

    function fundAndExecute(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        _registerAllocationData(viewData);
        _fundAccount(accountId, allocation);
        execute(accountId, steps, viewData);
    }

    function execute(
        bytes32 accountId,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) public override onlyOwner {
        require(getAccount[accountId] != address(0), "INVALID_ACCOUNT");
        address accountAddress = getAccount[accountId];
        _registerAllocationData(viewData);
        IAccount(accountAddress).execute(steps);
    }

    function executeAndWithdraw(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        execute(accountId, steps, viewData);
        _withdrawFromAccount(accountId, allocation);
        _registerAllocationData(viewData);
    }

    function withdrawFromAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation
    ) external override onlyOwner {
        _withdrawFromAccount(accountId, allocation);
    }

    function _fundAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation
    ) internal {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(getAccount[accountId] != address(0), "INVALID_ACCOUNT");
        address accountAddress = getAccount[accountId];
        uint256[] memory mintAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            uint256 poolAmount = allocation.amounts[i];
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 mintAmount =
                mApt.calculateMintAmount(poolAmount, tokenPrice, decimals);
            mintAmounts[i] = mintAmount;

            underlyer.safeTransferFrom(
                address(pool),
                accountAddress,
                poolAmount
            );
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.mint(address(pool), mintAmounts[i]);
        }
    }

    function _withdrawFromAccount(
        bytes32 accountId,
        IAccountFactory.AccountAllocation memory allocation
    ) internal {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(getAccount[accountId] != address(0), "INVALID_ACCOUNT");
        address accountAddress = getAccount[accountId];
        uint256[] memory burnAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();
            uint256 amountToSend = allocation.amounts[i];

            uint256 tokenPrice = pool.getUnderlyerPrice();
            uint8 decimals = underlyer.decimals();
            uint256 burnAmount =
                mApt.calculateMintAmount(amountToSend, tokenPrice, decimals);
            burnAmounts[i] = burnAmount;

            underlyer.safeTransferFrom(
                accountAddress,
                address(pool),
                amountToSend
            );
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.burn(address(pool), burnAmounts[i]);
        }
    }

    function _registerAllocationData(
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) internal {
        IAssetAllocationRegistry assetAllocationRegistry =
            IAssetAllocationRegistry(
                addressRegistry.getAddress("chainlinkRegistry")
            );
        for (uint256 i = 0; i < viewData.length; i++) {
            IAssetAllocationRegistry.AssetAllocation memory viewAllocation =
                viewData[i];
            assetAllocationRegistry.addAssetAllocation(
                viewAllocation.sequenceId,
                viewAllocation.data,
                viewAllocation.symbol,
                viewAllocation.decimals
            );
        }
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    /**
     * @dev Throws if called by any account other than the proxy admin.
     */
    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        mApt = APYMetaPoolToken(_mApt);
    }

    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(Address.isContract(_addressRegistry), "INVALID_ADDRESS");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    function setPoolIds(bytes32[] memory poolIds) public onlyOwner {
        _poolIds = poolIds;
    }

    function getPoolIds() public view returns (bytes32[] memory) {
        return _poolIds;
    }

    /// @dev part of temporary implementation for Chainlink integration;
    ///      likely need this to clear out storage prior to real upgrade.
    function deletePoolIds() external onlyOwner {
        delete _poolIds;
    }
}
