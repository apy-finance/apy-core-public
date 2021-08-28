// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {IDetailedERC20} from "./IDetailedERC20.sol";

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "./AccessControl.sol";
