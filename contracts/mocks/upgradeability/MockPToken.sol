// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {PToken} from "../../protocol/tokenization/PToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";

contract MockPToken is PToken {
    constructor(IPool pool) PToken(pool) {}

    function getRevision() internal pure override returns (uint256) {
        return 999;
    }
}
