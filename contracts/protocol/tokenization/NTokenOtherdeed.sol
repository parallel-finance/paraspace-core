// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IHotWalletProxy} from "../../interfaces/IHotWalletProxy.sol";
import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";

/**
 * @title Otherdeed NToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NTokenOtherdeed is NToken, IHotWalletProxy {
    IHotWalletProxy private immutable WARM_WALLET;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(
        IPool pool,
        IHotWalletProxy warmWallet,
        address delegateRegistry
    ) NToken(pool, false, delegateRegistry) {
        WARM_WALLET = warmWallet;
    }

    function setHotWallet(
        address hotWalletAddress,
        uint256 expirationTimestamp,
        bool lockHotWalletAddress
    ) external onlyPoolAdmin {
        WARM_WALLET.setHotWallet(
            hotWalletAddress,
            expirationTimestamp,
            lockHotWalletAddress
        );
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenOtherdeed;
    }
}
