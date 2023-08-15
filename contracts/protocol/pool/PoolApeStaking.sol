// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {PoolStorage} from "./PoolStorage.sol";
import "../../interfaces/IPoolApeStaking.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import "../libraries/logic/BorrowLogic.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";
import "../../interfaces/IParaApeStaking.sol";

contract PoolApeStaking is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolApeStaking
{
    uint256 internal constant POOL_REVISION = 149;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    address internal immutable APE_COIN;
    address internal immutable APE_COMPOUND;
    address internal immutable PARA_APE_STAKING;

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(
        IPoolAddressesProvider provider,
        address apeCoin,
        address apeCompound,
        address apeStakingVault
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COIN = apeCoin;
        APE_COMPOUND = apeCompound;
        PARA_APE_STAKING = apeStakingVault;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    /// @inheritdoc IPoolApeStaking
    function paraApeStaking() external view returns (address) {
        return PARA_APE_STAKING;
    }

    /// @inheritdoc IPoolApeStaking
    function borrowPoolCApe(uint256 amount)
        external
        nonReentrant
        returns (uint256)
    {
        require(msg.sender == PARA_APE_STAKING, Errors.CALLER_NOT_ALLOWED);
        DataTypes.PoolStorage storage ps = poolStorage();

        uint256 latestBorrowIndex = BorrowLogic.executeBorrowWithoutCollateral(
            ps._reserves,
            PARA_APE_STAKING,
            APE_COMPOUND,
            amount
        );

        return latestBorrowIndex;
    }

    /// @inheritdoc IPoolApeStaking
    function calculateTimeLockParams(address asset, uint256 amount)
        external
        returns (DataTypes.TimeLockParams memory)
    {
        require(msg.sender == PARA_APE_STAKING, Errors.CALLER_NOT_ALLOWED);
        DataTypes.PoolStorage storage ps = poolStorage();

        DataTypes.TimeLockParams memory timeLockParams = GenericLogic
            .calculateTimeLockParams(
                ps._reserves[asset],
                DataTypes.TimeLockFactorParams({
                    assetType: DataTypes.AssetType.ERC20,
                    asset: asset,
                    amount: amount
                })
            );
        return timeLockParams;
    }

    /// @inheritdoc IPoolApeStaking
    function borrowAndStakingApeCoin(
        IParaApeStaking.ApeCoinDepositInfo[] calldata apeCoinDepositInfo,
        IParaApeStaking.ApeCoinPairDepositInfo[] calldata pairDepositInfo,
        address asset,
        uint256 cashAmount,
        uint256 borrowAmount,
        bool openSApeCollateralFlag
    ) external nonReentrant {
        require(
            asset == APE_COIN || asset == APE_COMPOUND,
            Errors.INVALID_ASSET_TYPE
        );
        DataTypes.PoolStorage storage ps = poolStorage();
        address msgSender = msg.sender;

        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        // 1, prepare cash part.
        if (cashAmount > 0) {
            IERC20(asset).transferFrom(msg.sender, address(this), cashAmount);
        }

        // 2, prepare borrow part.
        if (borrowAmount > 0) {
            DataTypes.ReserveData storage borrowAssetReserve = ps._reserves[
                asset
            ];
            // no time lock needed here
            DataTypes.TimeLockParams memory timeLockParams;
            IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                address(this),
                borrowAmount,
                timeLockParams
            );
        }

        // 3, stake
        uint256 arrayLength = apeCoinDepositInfo.length;
        for (uint256 index = 0; index < arrayLength; index++) {
            IParaApeStaking.ApeCoinDepositInfo
                calldata depositInfo = apeCoinDepositInfo[index];
            require(
                msgSender == depositInfo.onBehalf,
                Errors.CALLER_NOT_ALLOWED
            );
            IParaApeStaking(PARA_APE_STAKING).depositApeCoinPool(depositInfo);
        }
        arrayLength = pairDepositInfo.length;
        for (uint256 index = 0; index < arrayLength; index++) {
            IParaApeStaking.ApeCoinPairDepositInfo
                calldata depositInfo = pairDepositInfo[index];
            require(
                msgSender == depositInfo.onBehalf,
                Errors.CALLER_NOT_ALLOWED
            );
            IParaApeStaking(PARA_APE_STAKING).depositApeCoinPairPool(
                depositInfo
            );
        }

        // 4, check if need to collateralize sAPE
        if (openSApeCollateralFlag) {
            DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
                msgSender
            ];
            Helpers.setAssetUsedAsCollateral(
                userConfig,
                ps._reserves,
                DataTypes.SApeAddress,
                msgSender
            );
        }

        // 5, execute borrow
        if (borrowAmount > 0) {
            BorrowLogic.executeBorrow(
                ps._reserves,
                ps._reservesList,
                ps._usersConfig[msgSender],
                DataTypes.ExecuteBorrowParams({
                    asset: asset,
                    user: msgSender,
                    onBehalfOf: msgSender,
                    amount: borrowAmount,
                    referralCode: 0,
                    releaseUnderlying: false,
                    reservesCount: ps._reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                    priceOracleSentinel: ADDRESSES_PROVIDER
                        .getPriceOracleSentinel()
                })
            );
        }

        uint256 balanceAfter = IERC20(asset).balanceOf(address(this));
        require(balanceAfter == balanceBefore, Errors.INVALID_PARAMETER);
    }
}
