// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";
import {FixedPoint} from "solidity-fixedpoint/contracts/FixedPoint.sol";
import {APT} from "./APT.sol";
import {ILiquidityPool} from "./ILiquidityPool.sol";


contract APYLiquidityPoolProxy is TransparentUpgradeableProxy {
    address private _owner;
    APT public apt;
    IERC20 internal _underlyer;

    constructor(
        address _logic,
        address _admin,
        bytes memory _data
    ) public TransparentUpgradeableProxy(_logic, _admin, _data) {
        _owner = msg.sender;
    }
}


contract APYLiquidityPoolImplementation is
    ILiquidityPool,
    Ownable,
    ReentrancyGuard
{
    using SafeMath for uint256;
    using FixedPoint for *;
    using SafeERC20 for IERC20;

    uint256 internal constant _DEFAULT_TOKEN_TO_ETH_FACTOR = 1000;
    uint192 internal constant _MAX_UINT192 = uint192(-1);

    APT public apt;

    IERC20 internal _underlyer;

    event DepositedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount
    );
    event RedeemedAPT(
        address indexed sender,
        uint256 aptAmount,
        uint256 underlyerAmount
    );

    receive() external payable {
        revert("Pool/cannot-accept-eth");
    }

    /**
     * @notice Mint corresponding amount of APT tokens for sent token amount.
     * @dev If no APT tokens have been minted yet, fallback to a fixed ratio.
     */
    function addLiquidity(uint256 amount) external override nonReentrant {
        require(amount > 0, "Pool/insufficient-value");
        require(
            _underlyer.allowance(msg.sender, address(this)) >= amount,
            "Pool/need-allowance"
        );
        uint256 totalAmount = _underlyer.balanceOf(address(this));
        uint256 mintAmount = _calculateMintAmount(amount, totalAmount);

        apt.mint(msg.sender, mintAmount);
        _underlyer.transferFrom(msg.sender, address(this), amount);

        emit DepositedAPT(msg.sender, mintAmount, amount);
    }

    /**
     * @notice Redeems APT amount for its underlying token amount.
     * @param aptAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 aptAmount) external override nonReentrant {
        require(aptAmount > 0, "Pool/redeem-positive-amount");
        require(
            aptAmount <= apt.balanceOf(msg.sender),
            "Pool/insufficient-balance"
        );

        uint256 underlyerAmount = getUnderlyerAmount(aptAmount);

        apt.burn(msg.sender, aptAmount);
        _underlyer.transfer(msg.sender, underlyerAmount);

        emit RedeemedAPT(msg.sender, aptAmount, underlyerAmount);
    }

    /// @dev called by admin during deployment
    function setAptAddress(address aptAddress) public onlyOwner {
        apt = APT(aptAddress);
    }

    /// @dev called by admin during deployment
    function setUnderlyerAddress(address underlyerAddress) public onlyOwner {
        _underlyer = IERC20(underlyerAddress);
    }

    function calculateMintAmount(uint256 underlyerAmount)
        public
        view
        returns (uint256)
    {
        uint256 underlyerTotal = _underlyer.balanceOf(address(this));
        return _calculateMintAmount(underlyerAmount, underlyerTotal);
    }

    /**
     * @notice Get the underlying amount represented by APT amount.
     * @param aptAmount The amount of APT tokens
     * @return uint256 The underlying value of the APT tokens
     */
    function getUnderlyerAmount(uint256 aptAmount)
        public
        view
        returns (uint256)
    {
        FixedPoint.uq192x64 memory shareOfAPT = _getShareOfAPT(aptAmount);

        uint256 underlyerTotal = _underlyer.balanceOf(address(this));
        require(underlyerTotal <= _MAX_UINT192, "Pool/overflow");

        return shareOfAPT.mul(uint192(underlyerTotal)).decode();
    }

    /**
     *  @notice amount of APT minted should be in same ratio to APT supply
     *          as token amount sent is to contract's token balance, i.e.:
     *
     *          mint amount / total supply (before deposit)
     *          = token amount sent / contract token balance (before deposit)
     */
    function _calculateMintAmount(uint256 amount, uint256 totalAmount)
        internal
        view
        returns (uint256)
    {
        uint256 totalSupply = apt.totalSupply();

        if (totalAmount == 0 || totalSupply == 0) {
            return amount.mul(_DEFAULT_TOKEN_TO_ETH_FACTOR);
        }

        require(amount <= _MAX_UINT192, "Pool/overflow");
        require(totalAmount <= _MAX_UINT192, "Pool/overflow");
        require(totalSupply <= _MAX_UINT192, "Pool/overflow");

        return
            FixedPoint
                .fraction(uint192(amount), uint192(totalAmount))
                .mul(uint192(totalSupply))
                .decode();
    }

    function _getShareOfAPT(uint256 amount)
        internal
        view
        returns (FixedPoint.uq192x64 memory)
    {
        require(amount <= _MAX_UINT192, "Pool/overflow");
        require(apt.totalSupply() > 0, "Pool/divide-by-zero");
        require(apt.totalSupply() <= _MAX_UINT192, "Pool/overflow");

        FixedPoint.uq192x64 memory shareOfAPT = FixedPoint.fraction(
            uint192(amount),
            uint192(apt.totalSupply())
        );
        return shareOfAPT;
    }
}


/**
 * @dev Proxy contract to test internal variables and functions
 *      Should not be used other than in test files!
 */
contract APYLiquidityPoolImplTestProxy is APYLiquidityPoolImplementation {
    uint256 public defaultTokenToEthFactor = APYLiquidityPoolImplementation
        ._DEFAULT_TOKEN_TO_ETH_FACTOR;

    function internalCalculateMintAmount(uint256 ethValue, uint256 totalValue)
        public
        view
        returns (uint256)
    {
        return
            APYLiquidityPoolImplementation._calculateMintAmount(
                ethValue,
                totalValue
            );
    }
}