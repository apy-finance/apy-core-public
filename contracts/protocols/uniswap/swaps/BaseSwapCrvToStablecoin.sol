// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeERC20} from "contracts/libraries/Imports.sol";
import {IERC20, IAssetAllocation} from "contracts/common/Imports.sol";
import {ISwapRouter} from "./ISwapRouter.sol";
import {ISwap} from "contracts/lpaccount/Imports.sol";

abstract contract BaseSwapCrvToStablecoin is ISwap {
    using SafeERC20 for IERC20;

    ISwapRouter private constant _ROUTER =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    IERC20 private constant _CRV =
        IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);

    uint24 private _CRV_WETH_FEE = 10000;

    IERC20 private constant _WETH =
        IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    uint24 private _WETH_STABLECOIN_FEE = 500;

    IERC20 private immutable _STABLECOIN;

    event Swap(ISwapRouter.ExactInputParams params, uint256 amountOut);

    constructor(IERC20 stablecoin) public {
        _STABLECOIN = stablecoin;
    }

    // TODO: create function for calculating min amount
    function swap(uint256 amount) external override {
        _CRV.safeApprove(address(_ROUTER), 0);
        _CRV.safeApprove(address(_ROUTER), amount);

        // solhint-disable not-rely-on-time
        ISwapRouter.ExactInputParams memory params =
            ISwapRouter.ExactInputParams({
                path: abi.encodePacked(
                    address(_CRV),
                    _CRV_WETH_FEE,
                    address(_WETH),
                    _WETH_STABLECOIN_FEE,
                    address(_STABLECOIN)
                ),
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amount,
                amountOutMinimum: 0
            });
        // solhint-enable not-rely-on-time

        uint256 amountOut = _ROUTER.exactInput(params);

        emit Swap(params, amountOut);
    }

    function erc20Allocations()
        external
        view
        override
        returns (IERC20[] memory)
    {
        IERC20[] memory allocations = new IERC20[](2);
        allocations[0] = _CRV;
        allocations[1] = _STABLECOIN;
        return allocations;
    }
}
