// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "../APYGenericExecutor.sol";

interface IAccount {
    function execute(APYGenericExecutor.Data[] memory steps) external;
}