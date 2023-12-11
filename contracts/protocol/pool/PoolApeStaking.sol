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
import "../../apestaking/logic/ApeStakingCommonLogic.sol";
import "../../interfaces/IApeStakingP2P.sol";
import "../../interfaces/IParaApeStaking.sol";
import "../../interfaces/IApeCoinPool.sol";

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
    uint256 internal constant POOL_REVISION = 200;
    address internal immutable PARA_APE_STAKING;
    address internal immutable BAYC;
    address internal immutable MAYC;
    address internal immutable BAKC;

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
        address bayc,
        address mayc,
        address bakc,
        address apeStakingVault
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
        APE_COIN = apeCoin;
        BAYC = bayc;
        MAYC = mayc;
        BAKC = bakc;
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

    function apeStakingMigration(
        UnstakingInfo[] calldata unstakingInfos,
        ParaStakingInfo[] calldata stakingInfos,
        ApeCoinInfo calldata apeCoinInfo
    ) external nonReentrant {
        address onBehalf = msg.sender;
        DataTypes.PoolStorage storage ps = poolStorage();
        uint256 beforeBalance = APE_COIN.balanceOf(address(this));
        //unstake in v1
        {
            address nBakc;
            uint256 unstakingLength = unstakingInfos.length;
            for (uint256 index = 0; index < unstakingLength; index++) {
                UnstakingInfo calldata unstakingInfo = unstakingInfos[index];

                DataTypes.ReserveData storage nftReserve = ps._reserves[
                    unstakingInfo.nftAsset
                ];
                address nToken = nftReserve.xTokenAddress;
                uint256 singleLength = unstakingInfo._nfts.length;
                if (singleLength > 0) {
                    for (uint256 j = 0; j < singleLength; j++) {
                        require(
                            IERC721(nToken).ownerOf(
                                unstakingInfo._nfts[j].tokenId
                            ) == onBehalf,
                            Errors.NOT_THE_OWNER
                        );
                    }
                    INTokenApeStaking(nToken).withdrawApeCoin(
                        unstakingInfo._nfts,
                        address(this)
                    );
                }
                uint256 pairLength = unstakingInfo._nftPairs.length;
                if (pairLength > 0) {
                    if (nBakc == address(0)) {
                        nBakc = ps._reserves[BAKC].xTokenAddress;
                    }
                    //transfer bakc from nBakc to nApe
                    for (uint256 j = 0; j < pairLength; j++) {
                        require(
                            IERC721(nBakc).ownerOf(
                                unstakingInfo._nftPairs[j].bakcTokenId
                            ) == onBehalf,
                            Errors.NOT_THE_BAKC_OWNER
                        );
                        IERC721(BAKC).safeTransferFrom(
                            nBakc,
                            nToken,
                            unstakingInfo._nftPairs[j].bakcTokenId
                        );
                    }

                    //unstake
                    INTokenApeStaking(nToken).withdrawBAKC(
                        unstakingInfo._nftPairs,
                        address(this)
                    );

                    //transfer bakc back to nBakc
                    for (uint256 j = 0; j < pairLength; j++) {
                        IERC721(BAKC).safeTransferFrom(
                            nToken,
                            nBakc,
                            unstakingInfo._nftPairs[j].bakcTokenId
                        );
                    }
                }
            }
        }

        //handle ape coin
        {
            require(
                apeCoinInfo.asset == address(APE_COIN) ||
                    apeCoinInfo.asset == address(APE_COMPOUND),
                Errors.INVALID_ASSET_TYPE
            );
            // 1, prepare cash part.
            uint256 cashAmount = apeCoinInfo.totalAmount -
                apeCoinInfo.borrowAmount;
            if (cashAmount > 0) {
                IERC20(apeCoinInfo.asset).transferFrom(
                    onBehalf,
                    address(this),
                    cashAmount
                );
            }

            // 2, prepare borrow part.
            if (apeCoinInfo.borrowAmount > 0) {
                DataTypes.ReserveData storage borrowAssetReserve = ps._reserves[
                    apeCoinInfo.asset
                ];
                // no time lock needed here
                DataTypes.TimeLockParams memory timeLockParams;
                IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                    address(this),
                    apeCoinInfo.borrowAmount,
                    timeLockParams
                );
            }

            if (
                apeCoinInfo.asset == address(APE_COMPOUND) &&
                apeCoinInfo.totalAmount > 0
            ) {
                APE_COMPOUND.withdraw(apeCoinInfo.totalAmount);
            }
        }

        //staking in paraApeStaking
        {
            uint256 stakingLength = stakingInfos.length;
            uint256 bakcPairCap;
            for (uint256 index = 0; index < stakingLength; index++) {
                ParaStakingInfo calldata stakingInfo = stakingInfos[index];

                if (
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID ||
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.MAYC_BAKC_PAIR_POOL_ID
                ) {
                    bool isBayc = (stakingInfo.PoolId ==
                        ApeStakingCommonLogic.BAYC_BAKC_PAIR_POOL_ID);
                    IParaApeStaking(PARA_APE_STAKING).depositPairNFT(
                        onBehalf,
                        isBayc,
                        stakingInfo.apeTokenIds,
                        stakingInfo.bakcTokenIds
                    );
                } else if (
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID ||
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID ||
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.BAKC_SINGLE_POOL_ID
                ) {
                    address nft = (stakingInfo.PoolId ==
                        ApeStakingCommonLogic.BAYC_SINGLE_POOL_ID)
                        ? BAYC
                        : (stakingInfo.PoolId ==
                            ApeStakingCommonLogic.MAYC_SINGLE_POOL_ID)
                        ? MAYC
                        : BAKC;
                    IParaApeStaking(PARA_APE_STAKING).depositNFT(
                        onBehalf,
                        nft,
                        stakingInfo.apeTokenIds
                    );
                } else if (
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.BAYC_APECOIN_POOL_ID ||
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.MAYC_APECOIN_POOL_ID
                ) {
                    bool isBayc = (stakingInfo.PoolId ==
                        ApeStakingCommonLogic.BAYC_APECOIN_POOL_ID);
                    IApeStakingP2P.StakingType stakingType = isBayc
                        ? IApeStakingP2P.StakingType.BAYCStaking
                        : IApeStakingP2P.StakingType.MAYCStaking;
                    uint256 cap = IParaApeStaking(PARA_APE_STAKING)
                        .getApeCoinStakingCap(stakingType);
                    IParaApeStaking(PARA_APE_STAKING).depositApeCoinPool(
                        IApeCoinPool.ApeCoinDepositInfo({
                            onBehalf: onBehalf,
                            cashToken: address(APE_COIN),
                            cashAmount: cap * stakingInfo.apeTokenIds.length,
                            isBAYC: isBayc,
                            tokenIds: stakingInfo.apeTokenIds
                        })
                    );
                } else if (
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.BAYC_BAKC_APECOIN_POOL_ID ||
                    stakingInfo.PoolId ==
                    ApeStakingCommonLogic.MAYC_BAKC_APECOIN_POOL_ID
                ) {
                    if (bakcPairCap == 0) {
                        bakcPairCap = IParaApeStaking(PARA_APE_STAKING)
                            .getApeCoinStakingCap(
                                IApeStakingP2P.StakingType.BAKCPairStaking
                            );
                    }

                    bool isBayc = (stakingInfo.PoolId ==
                        ApeStakingCommonLogic.BAYC_BAKC_APECOIN_POOL_ID);
                    IParaApeStaking(PARA_APE_STAKING).depositApeCoinPairPool(
                        IApeCoinPool.ApeCoinPairDepositInfo({
                            onBehalf: onBehalf,
                            cashToken: address(APE_COIN),
                            cashAmount: bakcPairCap *
                                stakingInfo.apeTokenIds.length,
                            isBAYC: isBayc,
                            apeTokenIds: stakingInfo.apeTokenIds,
                            bakcTokenIds: stakingInfo.bakcTokenIds
                        })
                    );
                }
            }
        }

        // repay and supply remaining apecoin
        uint256 diffBalance = APE_COIN.balanceOf(address(this)) - beforeBalance;
        if (diffBalance > 0) {
            require(apeCoinInfo.totalAmount == 0, Errors.INVALID_PARAMETER);
            APE_COMPOUND.deposit(address(this), diffBalance);
            _repayAndSupplyForUser(
                ps,
                address(APE_COMPOUND),
                address(this),
                onBehalf,
                diffBalance
            );
        }

        // check if need to collateralize sAPE
        if (apeCoinInfo.openSApeCollateralFlag) {
            DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
                onBehalf
            ];
            Helpers.setAssetUsedAsCollateral(
                userConfig,
                ps._reserves,
                DataTypes.SApeAddress,
                onBehalf
            );
        }

        // execute borrow
        if (apeCoinInfo.borrowAmount > 0) {
            BorrowLogic.executeBorrow(
                ps._reserves,
                ps._reservesList,
                ps._usersConfig[onBehalf],
                DataTypes.ExecuteBorrowParams({
                    asset: apeCoinInfo.asset,
                    user: onBehalf,
                    onBehalfOf: onBehalf,
                    amount: apeCoinInfo.borrowAmount,
                    referralCode: 0,
                    releaseUnderlying: false,
                    reservesCount: ps._reservesCount,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                    priceOracleSentinel: ADDRESSES_PROVIDER
                        .getPriceOracleSentinel()
                })
            );
        }
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
