// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    MetaPoolAllocationBaseV2
} from "contracts/protocols/convex/metapool/Imports.sol";

import {ConvexFraxConstants} from "./Constants.sol";

contract ConvexFraxAllocation is MetaPoolAllocationBaseV2, ConvexFraxConstants {
    function balanceOf(address account, uint8 tokenIndex)
        public
        view
        override
        returns (uint256)
    {
        return
            super.getUnderlyerBalance(
                account,
                META_POOL,
                REWARD_CONTRACT,
                LP_TOKEN,
                uint256(tokenIndex)
            );
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        return _getBasePoolTokenData(address(PRIMARY_UNDERLYER), "FRAX", 18);
    }
}
