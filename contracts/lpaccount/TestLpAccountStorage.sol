// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IAssetAllocation, IERC20} from "contracts/common/Imports.sol";

abstract contract TestLpAccountStorage {
    string internal _name;

    string[] internal _sortedSymbols;

    uint256[][] internal _deploysArray;
    uint256[] internal _unwindsArray;
    uint256[] internal _swapsArray;

    uint256 public _claimsCounter;

    string[] internal _assetAllocations;
    IERC20[] internal _tokens;

    IERC20[] internal _rewardTokens;
}
