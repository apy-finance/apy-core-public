// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {ApyUnderlyerConstants} from "contracts/protocols/apy.sol";

import {AaveBasePool} from "./common/AaveBasePool.sol";
import {ApyUnderlyerConstants} from "contracts/protocols/apy.sol";

contract AaveDaiZap is AaveBasePool, ApyUnderlyerConstants {
    string public constant override NAME = "aave-dai";

    constructor() public AaveBasePool(DAI_ADDRESS, LENDING_POOL_ADDRESS) {} // solhint-disable-line no-empty-blocks
}
