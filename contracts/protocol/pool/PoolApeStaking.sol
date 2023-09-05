// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {PoolStorage} from "./PoolStorage.sol";
import "../../interfaces/IPoolApeStaking.sol";
import "../../interfaces/IPToken.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../../interfaces/IXTokenType.sol";
import "../../interfaces/INTokenApeStaking.sol";
import {ValidationLogic} from "../libraries/logic/ValidationLogic.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";
import {UserConfiguration} from "../libraries/configuration/UserConfiguration.sol";
import {ApeStakingLogic} from "../tokenization/libraries/ApeStakingLogic.sol";
import "../libraries/logic/BorrowLogic.sol";
import "../libraries/logic/SupplyLogic.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IAutoCompoundApe} from "../../interfaces/IAutoCompoundApe.sol";
import {PercentageMath} from "../libraries/math/PercentageMath.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {Math} from "../../dependencies/openzeppelin/contracts/Math.sol";
import {ISwapRouter} from "../../dependencies/uniswapv3-periphery/interfaces/ISwapRouter.sol";
import {IPriceOracleGetter} from "../../interfaces/IPriceOracleGetter.sol";
import {Helpers} from "../libraries/helpers/Helpers.sol";

contract PoolApeStaking is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolApeStaking
{
    using ReserveLogic for DataTypes.ReserveData;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using SafeERC20 for IERC20;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using SafeCast for uint256;
    using PercentageMath for uint256;
    using WadRayMath for uint256;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    IAutoCompoundApe internal immutable APE_COMPOUND;
    IERC20 internal immutable APE_COIN;
    uint256 internal constant POOL_REVISION = 149;
    address internal immutable PARA_APE_STAKING;

    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );

    struct ApeStakingLocalVars {
        address xTokenAddress;
        IERC721 bakcContract;
        address bakcNToken;
        uint256 balanceBefore;
        uint256 balanceAfter;
        uint256[] amounts;
        uint256[] swapAmounts;
        address[] transferredTokenOwners;
        DataTypes.ApeCompoundStrategy[] options;
        uint256 totalAmount;
        uint256 totalNonDepositAmount;
        uint256 compoundFee;
        bytes usdcSwapPath;
        bytes wethSwapPath;
    }

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(
        IPoolAddressesProvider provider,
        IAutoCompoundApe apeCompound,
        IERC20 apeCoin,
        address apeStakingVault
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
        APE_COIN = apeCoin;
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
    function borrowPoolCApe(
        uint256 amount
    ) external nonReentrant returns (uint256) {
        require(msg.sender == PARA_APE_STAKING, Errors.CALLER_NOT_ALLOWED);
        DataTypes.PoolStorage storage ps = poolStorage();

        uint256 latestBorrowIndex = BorrowLogic.executeBorrowWithoutCollateral(
            ps._reserves,
            PARA_APE_STAKING,
            address(APE_COMPOUND),
            amount
        );

        return latestBorrowIndex;
    }

    /// @inheritdoc IPoolApeStaking
    function calculateTimeLockParams(
        address asset,
        uint256 amount
    ) external returns (DataTypes.TimeLockParams memory) {
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
            asset == address(APE_COIN) || asset == address(APE_COMPOUND),
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

    /// @inheritdoc IPoolApeStaking
    function withdrawApeCoin(
        address nftAsset,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        _checkSApeIsNotPaused(ps);

        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index].tokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
        }
        INTokenApeStaking(xTokenAddress).withdrawApeCoin(_nfts, msg.sender);

        _checkUserHf(ps, msg.sender, true);
    }

    /// @inheritdoc IPoolApeStaking
    function claimApeCoin(
        address nftAsset,
        uint256[] calldata _nfts
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        _checkSApeIsNotPaused(ps);

        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index]) == msg.sender,
                Errors.NOT_THE_OWNER
            );
        }
        INTokenApeStaking(xTokenAddress).claimApeCoin(_nfts, msg.sender);

        _checkUserHf(ps, msg.sender, true);
    }

    /// @inheritdoc IPoolApeStaking
    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithdrawWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        _checkSApeIsNotPaused(ps);

        ApeStakingLocalVars memory localVar = _generalCache(ps, nftAsset);
        localVar.transferredTokenOwners = new address[](_nftPairs.length);

        uint256[] memory transferredTokenIds = new uint256[](_nftPairs.length);
        uint256 actualTransferAmount = 0;

        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(localVar.xTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            if (
                !_nftPairs[index].isUncommit ||
                localVar.bakcContract.ownerOf(_nftPairs[index].bakcTokenId) ==
                localVar.bakcNToken
            ) {
                localVar.transferredTokenOwners[
                    actualTransferAmount
                ] = _validateBAKCOwnerAndTransfer(
                    localVar,
                    _nftPairs[index].bakcTokenId,
                    msg.sender
                );
                transferredTokenIds[actualTransferAmount] = _nftPairs[index]
                    .bakcTokenId;
                actualTransferAmount++;
            }
        }

        INTokenApeStaking(localVar.xTokenAddress).withdrawBAKC(
            _nftPairs,
            msg.sender
        );

        ////transfer BAKC back for user
        for (uint256 index = 0; index < actualTransferAmount; index++) {
            localVar.bakcContract.safeTransferFrom(
                localVar.xTokenAddress,
                localVar.transferredTokenOwners[index],
                transferredTokenIds[index]
            );
        }

        _checkUserHf(ps, msg.sender, true);
    }

    /// @inheritdoc IPoolApeStaking
    function claimBAKC(
        address nftAsset,
        ApeCoinStaking.PairNft[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        _checkSApeIsNotPaused(ps);

        ApeStakingLocalVars memory localVar = _generalCache(ps, nftAsset);
        localVar.transferredTokenOwners = new address[](_nftPairs.length);

        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(localVar.xTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            localVar.transferredTokenOwners[
                index
            ] = _validateBAKCOwnerAndTransfer(
                localVar,
                _nftPairs[index].bakcTokenId,
                msg.sender
            );
        }

        INTokenApeStaking(localVar.xTokenAddress).claimBAKC(
            _nftPairs,
            msg.sender
        );

        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            localVar.bakcContract.safeTransferFrom(
                localVar.xTokenAddress,
                localVar.transferredTokenOwners[index],
                _nftPairs[index].bakcTokenId
            );
        }
    }

    /// @inheritdoc IPoolApeStaking
    function borrowApeAndStake(
        StakingInfo calldata stakingInfo,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        ApeCoinStaking.PairNftDepositWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        _checkSApeIsNotPaused(ps);

        require(
            stakingInfo.borrowAsset == address(APE_COIN) ||
                stakingInfo.borrowAsset == address(APE_COMPOUND),
            Errors.INVALID_ASSET_TYPE
        );

        ApeStakingLocalVars memory localVar = _generalCache(
            ps,
            stakingInfo.nftAsset
        );
        localVar.transferredTokenOwners = new address[](_nftPairs.length);
        localVar.balanceBefore = APE_COIN.balanceOf(localVar.xTokenAddress);

        DataTypes.ReserveData storage borrowAssetReserve = ps._reserves[
            stakingInfo.borrowAsset
        ];
        // no time lock needed here
        DataTypes.TimeLockParams memory timeLockParams;
        // 1, handle borrow part
        if (stakingInfo.borrowAmount > 0) {
            if (stakingInfo.borrowAsset == address(APE_COIN)) {
                IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                    localVar.xTokenAddress,
                    stakingInfo.borrowAmount,
                    timeLockParams
                );
            } else {
                IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                    address(this),
                    stakingInfo.borrowAmount,
                    timeLockParams
                );
                APE_COMPOUND.withdraw(stakingInfo.borrowAmount);
                APE_COIN.safeTransfer(
                    localVar.xTokenAddress,
                    stakingInfo.borrowAmount
                );
            }
        }

        // 2, send cash part to xTokenAddress
        if (stakingInfo.cashAmount > 0) {
            APE_COIN.safeTransferFrom(
                msg.sender,
                localVar.xTokenAddress,
                stakingInfo.cashAmount
            );
        }

        // 3, deposit bayc or mayc pool
        {
            uint256 nftsLength = _nfts.length;
            for (uint256 index = 0; index < nftsLength; index++) {
                require(
                    INToken(localVar.xTokenAddress).ownerOf(
                        _nfts[index].tokenId
                    ) == msg.sender,
                    Errors.NOT_THE_OWNER
                );
            }

            if (nftsLength > 0) {
                INTokenApeStaking(localVar.xTokenAddress).depositApeCoin(_nfts);
            }
        }

        // 4, deposit bakc pool
        {
            uint256 nftPairsLength = _nftPairs.length;
            for (uint256 index = 0; index < nftPairsLength; index++) {
                require(
                    INToken(localVar.xTokenAddress).ownerOf(
                        _nftPairs[index].mainTokenId
                    ) == msg.sender,
                    Errors.NOT_THE_OWNER
                );

                localVar.transferredTokenOwners[
                    index
                ] = _validateBAKCOwnerAndTransfer(
                    localVar,
                    _nftPairs[index].bakcTokenId,
                    msg.sender
                );
            }

            if (nftPairsLength > 0) {
                INTokenApeStaking(localVar.xTokenAddress).depositBAKC(
                    _nftPairs
                );
            }
            //transfer BAKC back for user
            for (uint256 index = 0; index < nftPairsLength; index++) {
                localVar.bakcContract.safeTransferFrom(
                    localVar.xTokenAddress,
                    localVar.transferredTokenOwners[index],
                    _nftPairs[index].bakcTokenId
                );
            }
        }

        // 5 mint debt token
        if (stakingInfo.borrowAmount > 0) {
            BorrowLogic.executeBorrow(
                ps._reserves,
                ps._reservesList,
                ps._usersConfig[msg.sender],
                DataTypes.ExecuteBorrowParams({
                    asset: stakingInfo.borrowAsset,
                    user: msg.sender,
                    onBehalfOf: msg.sender,
                    amount: stakingInfo.borrowAmount,
                    referralCode: 0,
                    releaseUnderlying: false,
                    reservesCount: ps._reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                    priceOracleSentinel: ADDRESSES_PROVIDER
                        .getPriceOracleSentinel()
                })
            );
        }

        //6 checkout ape balance
        require(
            APE_COIN.balanceOf(localVar.xTokenAddress) ==
                localVar.balanceBefore,
            Errors.TOTAL_STAKING_AMOUNT_WRONG
        );

        //7 collateralize sAPE
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            msg.sender
        ];
        Helpers.setAssetUsedAsCollateral(
            userConfig,
            ps._reserves,
            DataTypes.SApeAddress,
            msg.sender
        );
    }

    /// @inheritdoc IPoolApeStaking
    function unstakeApePositionAndRepay(
        address nftAsset,
        uint256 tokenId
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        address incentiveReceiver = address(0);
        address positionOwner = INToken(xTokenAddress).ownerOf(tokenId);
        if (msg.sender != positionOwner) {
            _checkUserHf(ps, positionOwner, false);
            incentiveReceiver = msg.sender;
        }

        INTokenApeStaking(xTokenAddress).unstakePositionAndRepay(
            tokenId,
            incentiveReceiver
        );
    }

    /// @inheritdoc IPoolApeStaking
    function repayAndSupply(
        address underlyingAsset,
        address onBehalfOf,
        uint256 totalAmount
    ) external {
        DataTypes.PoolStorage storage ps = poolStorage();
        require(
            msg.sender == ps._reserves[underlyingAsset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );

        // 1, deposit APE as cAPE
        APE_COIN.safeTransferFrom(msg.sender, address(this), totalAmount);
        APE_COMPOUND.deposit(address(this), totalAmount);

        // 2, repay cAPE and supply cAPE for user
        _repayAndSupplyForUser(
            ps,
            address(APE_COMPOUND),
            address(this),
            onBehalfOf,
            totalAmount
        );
    }

    function _generalCache(
        DataTypes.PoolStorage storage ps,
        address nftAsset
    ) internal view returns (ApeStakingLocalVars memory localVar) {
        localVar.xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        localVar.bakcContract = INTokenApeStaking(localVar.xTokenAddress)
            .getBAKC();
        localVar.bakcNToken = ps
            ._reserves[address(localVar.bakcContract)]
            .xTokenAddress;
    }

    function _checkUserHf(
        DataTypes.PoolStorage storage ps,
        address user,
        bool checkAbove
    ) private view {
        DataTypes.UserConfigurationMap memory userConfig = ps._usersConfig[
            user
        ];

        uint256 healthFactor;
        if (!userConfig.isBorrowingAny()) {
            healthFactor = type(uint256).max;
        } else {
            (, , , , , , , healthFactor, , ) = GenericLogic
                .calculateUserAccountData(
                    ps._reserves,
                    ps._reservesList,
                    DataTypes.CalculateUserAccountDataParams({
                        userConfig: userConfig,
                        reservesCount: ps._reservesCount,
                        user: user,
                        oracle: ADDRESSES_PROVIDER.getPriceOracle()
                    })
                );
        }

        if (checkAbove) {
            require(
                healthFactor > DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
            );
        } else {
            require(
                healthFactor < DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
            );
        }
    }

    function _checkSApeIsNotPaused(
        DataTypes.PoolStorage storage ps
    ) internal view {
        DataTypes.ReserveData storage reserve = ps._reserves[
            DataTypes.SApeAddress
        ];

        (bool isActive, , , bool isPaused, ) = reserve.configuration.getFlags();

        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
    }

    function _repayAndSupplyForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 totalAmount
    ) internal {
        address variableDebtTokenAddress = ps
            ._reserves[asset]
            .variableDebtTokenAddress;
        uint256 repayAmount = Math.min(
            IERC20(variableDebtTokenAddress).balanceOf(onBehalfOf),
            totalAmount
        );
        _repayForUser(ps, asset, payer, onBehalfOf, repayAmount);
        _supplyForUser(ps, asset, payer, onBehalfOf, totalAmount - repayAmount);
    }

    function _supplyForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 amount
    ) internal {
        if (amount == 0) {
            return;
        }
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            onBehalfOf
        ];
        SupplyLogic.executeSupply(
            ps._reserves,
            userConfig,
            DataTypes.ExecuteSupplyParams({
                asset: asset,
                amount: amount,
                onBehalfOf: onBehalfOf,
                payer: payer,
                referralCode: 0
            })
        );
        Helpers.setAssetUsedAsCollateral(
            userConfig,
            ps._reserves,
            asset,
            onBehalfOf
        );
    }

    function _repayForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 amount
    ) internal returns (uint256) {
        if (amount == 0) {
            return 0;
        }
        return
            BorrowLogic.executeRepay(
                ps._reserves,
                ps._usersConfig[onBehalfOf],
                DataTypes.ExecuteRepayParams({
                    asset: asset,
                    amount: amount,
                    onBehalfOf: onBehalfOf,
                    payer: payer,
                    usePTokens: false
                })
            );
    }

    function _validateBAKCOwnerAndTransfer(
        ApeStakingLocalVars memory localVar,
        uint256 tokenId,
        address userAddress
    ) internal returns (address bakcOwner) {
        bakcOwner = localVar.bakcContract.ownerOf(tokenId);
        require(
            (userAddress == bakcOwner) ||
                (userAddress == INToken(localVar.bakcNToken).ownerOf(tokenId)),
            Errors.NOT_THE_BAKC_OWNER
        );
        localVar.bakcContract.safeTransferFrom(
            bakcOwner,
            localVar.xTokenAddress,
            tokenId
        );
    }
}
