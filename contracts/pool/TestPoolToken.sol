// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {PoolToken} from "./PoolToken.sol";

/**
 * @dev Proxy contract to test internal variables and functions
 * Should not be used other than in test files!
 */
contract TestPoolToken is PoolToken {
    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}
