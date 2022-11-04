// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {NTokenApeStaking} from "./NTokenApeStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";

/**
 * @title BAYC NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
contract NTokenMAYC is NTokenApeStaking {
    uint256 constant MAYC_POOL_ID = 2;

    constructor(IPool pool, address apeCoinStaking)
        NTokenApeStaking(pool, apeCoinStaking)
    {}

    function _depositApeCoin(ApeCoinStaking.SingleNft[] calldata _nfts)
        internal
        virtual
        override
    {
        _apeCoinStaking.depositMAYC(_nfts);
    }

    function _claimApeCoin(uint256[] calldata _nfts, address _recipient)
        internal
        virtual
        override
    {
        _apeCoinStaking.claimMAYC(_nfts, _recipient);
    }

    function _withdrawApeCoin(
        ApeCoinStaking.SingleNft[] memory _nfts,
        address _recipient
    ) internal virtual override {
        _apeCoinStaking.withdrawMAYC(_nfts, _recipient);
    }

    function POOL_ID() internal virtual override returns (uint256) {
        return MAYC_POOL_ID;
    }
}
