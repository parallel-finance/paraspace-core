// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.10;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPoolCrossChain} from "../../interfaces/IPoolCrossChain.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {ParaReentrancyGuard} from "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import "../../cross-chain/L2/IParaxL2MessageHandler.sol";

/**
 * @title Pool Parameters contract
 *
 * @notice Main point of interaction with an ParaSpace protocol's market
 **/
contract PoolCrossChain is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolCrossChain
{
    uint256 public constant POOL_REVISION = 200;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    address public immutable CROSS_CHAIN_MSG_HANDLER;

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     * @param msgHandler The address of the L2 message handler contract
     */
    constructor(IPoolAddressesProvider provider, address msgHandler) {
        ADDRESSES_PROVIDER = provider;
        CROSS_CHAIN_MSG_HANDLER = msgHandler;
    }

    function updateTokenDelegation(
        address delegateTo,
        address underlyingAsset,
        uint256[] calldata tokenIds,
        bool value
    ) external {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(
            msg.sender == ps._reserves[underlyingAsset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );

        IParaxL2MessageHandler(CROSS_CHAIN_MSG_HANDLER).updateTokenDelegation(
            delegateTo,
            underlyingAsset,
            tokenIds,
            value
        );
    }
}
