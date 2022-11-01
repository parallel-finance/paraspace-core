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
contract NTokenBAYC is NTokenApeStaking {
    uint256 constant BAYC_POOL_ID = 1;

    constructor(IPool pool, address apeCoinStaking)
        NTokenApeStaking(pool, apeCoinStaking)
    {}

    function _depositApeCoin(ApeCoinStaking.SingleNft[] calldata _nfts)
        internal
        virtual
        override
    {
        _apeCoinStaking.depositBAYC(_nfts);
    }

    function _claimApeCoin(uint256[] calldata _nfts, address _recipient)
        internal
        virtual
        override
    {
        _apeCoinStaking.claimBAYC(_nfts, _recipient);
    }

    function _withdrawApeCoin(
        ApeCoinStaking.SingleNft[] memory _nfts,
        address _recipient
    ) internal virtual override {
        _apeCoinStaking.withdrawBAYC(_nfts, _recipient);
    }

    function POOL_ID() internal virtual override returns (uint256) {
        return BAYC_POOL_ID;
    }
}
