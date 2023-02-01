// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "../../protocol/tokenization/NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";

contract MockNToken is NToken {
    constructor(IPool pool) NToken(pool, false) {}

    function getRevision() internal pure override returns (uint256) {
        return 999;
    }
}
