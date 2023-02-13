// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPoolPoisitionMover} from "../../interfaces/IPoolPoisitionMover.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {PositionMoverLogic} from "../libraries/logic/PositionMoverLogic.sol";
import {ParaReentrancyGuard} from "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import {ILendPoolLoan} from "../../dependencies/benddao/contracts/interfaces/ILendPoolLoan.sol";
import {ILendPool} from "../../dependencies/benddao/contracts/interfaces/ILendPool.sol";

/**
 * @title Pool PoisitionMover contract
 *
 **/
contract PoolPoisitionMover is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolPoisitionMover
{
    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    ILendPoolLoan internal immutable BENDDAO_LEND_POOL_LOAN;
    ILendPool internal immutable BENDDAO_LEND_POOL;
    uint256 internal constant POOL_REVISION = 130;

    constructor(
        IPoolAddressesProvider addressProvider,
        ILendPoolLoan benddaoLendPoolLoan,
        ILendPool benddaoLendPool
    ) {
        ADDRESSES_PROVIDER = addressProvider;
        BENDDAO_LEND_POOL_LOAN = benddaoLendPoolLoan;
        BENDDAO_LEND_POOL = benddaoLendPool;
    }

    function movePositionFromBendDAO(uint256[] calldata loanIds)
        external
        nonReentrant
    {
        DataTypes.PoolStorage storage ps = poolStorage();

        PositionMoverLogic.executeMovePositionFromBendDAO(
            ps,
            ADDRESSES_PROVIDER,
            BENDDAO_LEND_POOL_LOAN,
            BENDDAO_LEND_POOL,
            loanIds
        );
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }
}
