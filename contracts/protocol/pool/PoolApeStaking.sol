// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {PoolStorage} from "./PoolStorage.sol";
import "../../interfaces/IPoolApeStaking.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import "../libraries/logic/BorrowLogic.sol";

contract PoolApeStaking is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolApeStaking
{
    uint256 internal constant POOL_REVISION = 149;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    address internal immutable APE_COMPOUND;
    address internal immutable PARA_APE_STAKING;

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(
        IPoolAddressesProvider provider,
        address apeCompound,
        address apeStakingVault
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
        PARA_APE_STAKING = apeStakingVault;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    function paraApeStaking() external view returns (address) {
        return PARA_APE_STAKING;
    }

    function borrowPoolCApe(uint256 amount)
        external
        nonReentrant
        returns (uint256)
    {
        require(msg.sender == PARA_APE_STAKING);
        DataTypes.PoolStorage storage ps = poolStorage();

        uint256 latestBorrowIndex = BorrowLogic.executeBorrowWithoutCollateral(
            ps._reserves,
            PARA_APE_STAKING,
            address(APE_COMPOUND),
            amount
        );

        return latestBorrowIndex;
    }
}
