// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {AlphaDeployment} from "./AlphaDeployment.sol";

contract TestAlphaDeployment is AlphaDeployment {
    constructor(
        address proxyAdminFactory_,
        address proxyFactory_,
        address addressRegistryV2Factory,
        address mAptFactory_,
        address poolTokenV1Factory_,
        address poolTokenV2Factory_,
        address tvlManagerFactory_,
        address oracleAdapterFactory_,
        address lpAccountFactory_
    )
        public
        AlphaDeployment(
            proxyAdminFactory_,
            proxyFactory_,
            addressRegistryV2Factory,
            mAptFactory_,
            poolTokenV1Factory_,
            poolTokenV2Factory_,
            tvlManagerFactory_,
            oracleAdapterFactory_,
            lpAccountFactory_
        )
    {} // solhint-disable no-empty-blocks

    function testSetStep(uint256 step_) public {
        step = step_;
    }

    function testSetMapt(address mApt_) public {
        mApt = mApt_;
    }

    function testSetTvlManager(address tvlManager_) public {
        tvlManager = tvlManager_;
    }
}