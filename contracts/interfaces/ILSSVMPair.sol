// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";

interface ILSSVMPair {
    function nft() external pure returns (IERC721 _nft);

    function token() external pure returns (IERC20 _token);
}
