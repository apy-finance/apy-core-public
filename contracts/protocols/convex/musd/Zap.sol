// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {ConvexMusdConstants} from "./Constants.sol";
import {
    MetaPoolOldDepositorZap
} from "contracts/protocols/convex/metapool/Imports.sol";

contract ConvexMusdZap is MetaPoolOldDepositorZap, ConvexMusdConstants {
    constructor()
        public
        MetaPoolOldDepositorZap(
            DEPOSITOR,
            META_POOL,
            address(LP_TOKEN),
            PID,
            10000,
            100
        ) // solhint-disable-next-line no-empty-blocks
    {}

    function assetAllocations() public view override returns (string[] memory) {
        string[] memory allocationNames = new string[](2);
        allocationNames[0] = "curve-musd";
        allocationNames[1] = NAME;
        return allocationNames;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = _createErc20AllocationArray(2);
        allocations[4] = IERC20(CVX_ADDRESS);
        allocations[5] = PRIMARY_UNDERLYER;
        return allocations;
    }
}
