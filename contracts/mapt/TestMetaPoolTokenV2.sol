// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IReservePool} from "contracts/pool/Imports.sol";
import {MetaPoolTokenV2} from "./MetaPoolTokenV2.sol";

/**
 * @dev Proxy contract to test internal variables and functions
 * Should not be used other than in test files!
 */
contract TestMetaPoolTokenV2 is MetaPoolTokenV2 {
    /// @dev useful for changing supply during calc tests
    function testMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    /// @dev useful for changing supply during calc tests
    function testBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    function testFundLpAccount(
        IReservePool[] memory pools,
        uint256[] memory amounts
    ) public {
        _fundLpAccount(pools, amounts);
    }

    function testWithdrawFromLpAccount(
        IReservePool[] memory pools,
        uint256[] memory amounts
    ) public {
        _withdrawFromLpAccount(pools, amounts);
    }

    function testMultipleMintAndTransfer(
        IReservePool[] memory pools,
        uint256[] memory amounts
    ) public {
        _multipleMintAndTransfer(pools, amounts);
    }

    function testMintAndTransfer(
        IReservePool pool,
        uint256 mintAmount,
        uint256 transferAmount
    ) public {
        _mintAndTransfer(pool, mintAmount, transferAmount);
    }

    function testMultipleBurnAndTransfer(
        IReservePool[] memory pools,
        uint256[] memory amounts
    ) public {
        _multipleBurnAndTransfer(pools, amounts);
    }

    function testBurnAndTransfer(
        IReservePool pool,
        address lpSafe,
        uint256 burnAmount,
        uint256 transferAmount
    ) public {
        _burnAndTransfer(pool, lpSafe, burnAmount, transferAmount);
    }

    function testRegisterPoolUnderlyers(IReservePool[] memory pools) public {
        _registerPoolUnderlyers(pools);
    }

    function testGetTvl() public view returns (uint256) {
        return _getTvl();
    }

    function testCalculateDeltas(
        IReservePool[] memory pools,
        uint256[] memory amounts
    ) public view returns (uint256[] memory) {
        return _calculateDeltas(pools, amounts);
    }

    function testCalculateDelta(
        uint256 amount,
        uint256 tokenPrice,
        uint8 decimals
    ) public view returns (uint256) {
        return _calculateDelta(amount, tokenPrice, decimals);
    }

    function testGetFundAmounts(int256[] memory amounts)
        public
        pure
        returns (uint256[] memory)
    {
        return _getFundAmounts(amounts);
    }

    function testCalculateAmountsToWithdraw(
        int256[] memory topupAmounts,
        uint256[] memory lpAccountBalances
    ) public pure returns (uint256[] memory) {
        return _calculateAmountsToWithdraw(topupAmounts, lpAccountBalances);
    }
}
