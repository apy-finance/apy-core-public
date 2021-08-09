// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ImmutableAssetAllocation} from "../ImmutableAssetAllocation.sol";

/**
 * @notice the lending pool contract
 */
interface IAaveLendingPool {
    /**
     * @notice Deposits a certain amount of an asset into the protocol, minting
     * the same amount of corresponding aTokens, and transferring them
     * to the onBehalfOf address.
     * E.g. User deposits 100 USDC and gets in return 100 aUSDC
     * @dev When depositing, the LendingPool contract must have at least an
     * allowance() of amount for the asset being deposited.
     * During testing, you can use the referral code: 0.
     * @param asset The address of the underlying asset to deposit
     * @param amount The amount to be deposited
     * @param onBehalfOf The address that will receive the aTokens, same as msg.sender if the user
     * wants to receive them on his own wallet, or a different address if the beneficiary of aTokens
     * is a different wallet
     * @param referralCode Code used to register the integrator originating the operation, for potential rewards.
     * 0 if the action is executed directly by the user, without any middle-man
     */
    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /**
     * @notice Withdraws an `amount` of underlying asset from the reserve, burning
     * the equivalent aTokens owned.
     * E.g. User has 100 aUSDC, calls withdraw() and receives 100 USDC,
     * burning the 100 aUSDC
     * @dev Ensure you set the relevant ERC20 allowance of the aToken,
     * before calling this function, so the LendingPool
     * contract can burn the associated aTokens.
     * @param asset The address of the underlying asset to withdraw
     * @param amount The underlying amount to be withdrawn
     * - Send the value type(uint256).max in order to withdraw the whole aToken balance
     * @param to Address that will receive the underlying, same as msg.sender if the user
     * wants to receive it on his own wallet, or a different address if the beneficiary is a
     * different wallet
     * @return The final amount withdrawn
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}

/**
 * @title Periphery Contract for the Aave lending pool
 * @author APY.Finance
 * @notice This contract enables the APY.Finance system to retrieve the balance
 * of an underlyer of an Aave lending token. The balance is used as part
 * of the Chainlink computation of the deployed TVL.  The primary
 * `getUnderlyerBalance` function is invoked indirectly when a
 * Chainlink node calls `balanceOf` on the APYAssetAllocationRegistry.
 */
contract AaveAllocationBase {
    using SafeMath for uint256;

    /**
     * @notice Returns the balance of an underlying token represented by
     * an account's aToken balance
     * @dev aTokens represent the underlyer amount at par (1-1), growing with interest.
     * @param aToken the LP token representing the share of the pool
     * @return balance
     */
    function getUnderlyerBalance(address account, IERC20 aToken)
        public
        view
        returns (uint256)
    {
        require(account != address(0), "INVALID_ACCOUNT");
        require(address(aToken) != address(0), "INVALID_AAVE_TOKEN");

        return aToken.balanceOf(account);
    }
}

contract AaveDaiAllocation is AaveAllocationBase, ImmutableAssetAllocation {
    address public constant ADAI_ADDRESS =
        0x028171bCA77440897B824Ca71D1c56caC55b68A3;
    address public constant AUSDC_ADDRESS =
        0xBcca60bB61934080951369a648Fb03DF4F96263C;
    address public constant AUSDT_ADDRESS =
        0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811;

    function balanceOf(address account, uint8 tokenIndex)
        external
        view
        override
        returns (uint256)
    {
        IERC20 aToken = IERC20(addressOf(tokenIndex));
        return super.getUnderlyerBalance(account, aToken);
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens = new TokenData[](3);
        tokens[0] = TokenData(ADAI_ADDRESS, "DAI", 18);
        tokens[1] = TokenData(AUSDC_ADDRESS, "USDC", 6);
        tokens[2] = TokenData(AUSDT_ADDRESS, "USDT", 6);
        return tokens;
    }
}
