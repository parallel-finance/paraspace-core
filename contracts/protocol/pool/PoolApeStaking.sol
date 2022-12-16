// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

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
import {Errors} from "../libraries/helpers/Errors.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";
import {UserConfiguration} from "../libraries/configuration/UserConfiguration.sol";
import {ApeStakingLogic} from "../tokenization/libraries/ApeStakingLogic.sol";
import "../libraries/logic/BorrowLogic.sol";
import "../libraries/logic/SupplyLogic.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IApeYield} from "../../interfaces/IApeYield.sol";

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

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    IApeYield internal immutable APE_YIELD;
    IERC20 internal immutable APE_COIN;
    uint256 internal constant POOL_REVISION = 120;

    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(
        IPoolAddressesProvider provider,
        IApeYield apeYield,
        IERC20 apeCoin
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_YIELD = apeYield;
        APE_COIN = apeCoin;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    /// @inheritdoc IPoolApeStaking
    function withdrawApeCoin(
        address nftAsset,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);

        uint256 amountToWithdraw = 0;
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index].tokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
            amountToWithdraw += _nfts[index].amount;
        }

        INTokenApeStaking(nftReserve.xTokenAddress).withdrawApeCoin(
            _nfts,
            msg.sender
        );

        require(
            getUserHf(msg.sender) >
                DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );
    }

    /// @inheritdoc IPoolApeStaking
    function claimApeCoin(address nftAsset, uint256[] calldata _nfts)
        external
        nonReentrant
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

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

        require(
            getUserHf(msg.sender) >
                DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );
    }

    /// @inheritdoc IPoolApeStaking
    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithdrawWithAmount[] memory _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        address xTokenAddress;
        {
            DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
            xTokenAddress = nftReserve.xTokenAddress;
        }

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(xTokenAddress);
        IERC721 bakcContract = nTokenApeStaking.getBAKC();
        uint256[] memory transferredTokenIds = new uint256[](_nftPairs.length);
        uint256 actualTransferAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(xTokenAddress).ownerOf(_nftPairs[index].mainTokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );

            (uint256 stakedAmount, ) = nTokenApeStaking
                .getApeStaking()
                .nftPosition(
                    ApeStakingLogic.BAKC_POOL_ID,
                    _nftPairs[index].bakcTokenId
                );

            //only partially withdraw need user's BAKC
            if (_nftPairs[index].amount != stakedAmount) {
                bakcContract.safeTransferFrom(
                    msg.sender,
                    xTokenAddress,
                    _nftPairs[index].bakcTokenId
                );
                transferredTokenIds[actualTransferAmount] = _nftPairs[index]
                    .bakcTokenId;
                actualTransferAmount++;
            }
        }

        nTokenApeStaking.withdrawBAKC(_nftPairs, msg.sender);

        ////transfer BAKC back for user
        for (uint256 index = 0; index < actualTransferAmount; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                msg.sender,
                transferredTokenIds[index]
            );
        }

        require(
            getUserHf(msg.sender) >
                DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );
    }

    /// @inheritdoc IPoolApeStaking
    function claimBAKC(
        address nftAsset,
        ApeCoinStaking.PairNft[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(xTokenAddress);
        IERC721 bakcContract = nTokenApeStaking.getBAKC();
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(xTokenAddress).ownerOf(_nftPairs[index].mainTokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );
            bakcContract.safeTransferFrom(
                msg.sender,
                xTokenAddress,
                _nftPairs[index].bakcTokenId
            );
        }

        nTokenApeStaking.claimBAKC(_nftPairs, msg.sender);

        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                msg.sender,
                _nftPairs[index].bakcTokenId
            );
        }
    }

    struct BorrowAndStakeLocalVar {
        address nTokenAddress;
        IERC20 apeCoin;
        uint256 beforeBalance;
        IERC721 bakcContract;
        DataTypes.ReserveCache apeReserveCache;
    }

    /// @inheritdoc IPoolApeStaking
    function borrowApeAndStake(
        StakingInfo calldata stakingInfo,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        ApeCoinStaking.PairNftDepositWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        BorrowAndStakeLocalVar memory localVar;
        localVar.nTokenAddress = ps
            ._reserves[stakingInfo.nftAsset]
            .xTokenAddress;
        localVar.apeCoin = INTokenApeStaking(localVar.nTokenAddress)
            .getApeStaking()
            .apeCoin();
        localVar.beforeBalance = localVar.apeCoin.balanceOf(
            localVar.nTokenAddress
        );
        localVar.bakcContract = INTokenApeStaking(localVar.nTokenAddress)
            .getBAKC();

        DataTypes.ReserveData storage apeReserve = ps._reserves[
            address(localVar.apeCoin)
        ];
        localVar.apeReserveCache = apeReserve.cache();

        // 1, send borrow part to xTokenAddress
        if (stakingInfo.borrowAmount > 0) {
            ValidationLogic.validateFlashloanSimple(apeReserve);
            IPToken(localVar.apeReserveCache.xTokenAddress)
                .transferUnderlyingTo(
                    localVar.nTokenAddress,
                    stakingInfo.borrowAmount
                );
        }

        // 2, send cash part to xTokenAddress
        if (stakingInfo.cashAmount > 0) {
            localVar.apeCoin.safeTransferFrom(
                msg.sender,
                localVar.nTokenAddress,
                stakingInfo.cashAmount
            );
        }

        // 3, deposit bayc or mayc pool
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                INToken(localVar.nTokenAddress).ownerOf(_nfts[index].tokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );
        }
        INTokenApeStaking(localVar.nTokenAddress).depositApeCoin(_nfts);

        // 4, deposit bakc pool
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(localVar.nTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            localVar.bakcContract.safeTransferFrom(
                msg.sender,
                localVar.nTokenAddress,
                _nftPairs[index].bakcTokenId
            );
        }
        INTokenApeStaking(localVar.nTokenAddress).depositBAKC(_nftPairs);
        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            localVar.bakcContract.safeTransferFrom(
                localVar.nTokenAddress,
                msg.sender,
                _nftPairs[index].bakcTokenId
            );
        }

        // 5 mint debt token
        if (stakingInfo.borrowAmount > 0) {
            BorrowLogic.executeBorrow(
                ps._reserves,
                ps._reservesList,
                ps._usersConfig[msg.sender],
                DataTypes.ExecuteBorrowParams({
                    asset: address(localVar.apeCoin),
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

        //7 checkout ape balance
        require(
            localVar.apeCoin.balanceOf(localVar.nTokenAddress) ==
                localVar.beforeBalance,
            Errors.TOTAL_STAKING_AMOUNT_WRONG
        );
    }

    /// @inheritdoc IPoolApeStaking
    function unstakeApePositionAndRepay(address nftAsset, uint256 tokenId)
        external
        nonReentrant
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        address incentiveReceiver = address(0);
        address positionOwner = INToken(xTokenAddress).ownerOf(tokenId);
        if (msg.sender != positionOwner) {
            require(
                getUserHf(positionOwner) <
                    DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
            );
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
        address repayAsset,
        address onBehalfOf,
        uint256 repayAmount,
        uint256 supplyAmount
    ) external {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(
            msg.sender == ps._reserves[underlyingAsset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );

        if (repayAmount > 0) {
            BorrowLogic.executeRepay(
                ps._reserves,
                ps._usersConfig[onBehalfOf],
                DataTypes.ExecuteRepayParams({
                    asset: repayAsset,
                    amount: repayAmount,
                    onBehalfOf: onBehalfOf,
                    usePTokens: false
                })
            );
        }

        if (supplyAmount > 0) {
            DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
                onBehalfOf
            ];
            SupplyLogic.executeSupply(
                ps._reserves,
                userConfig,
                DataTypes.ExecuteSupplyParams({
                    asset: repayAsset,
                    amount: supplyAmount,
                    onBehalfOf: onBehalfOf,
                    payer: msg.sender,
                    referralCode: 0
                })
            );
            DataTypes.ReserveData storage repayReserve = ps._reserves[
                repayAsset
            ];
            bool currentStatus = userConfig.isUsingAsCollateral(
                repayReserve.id
            );
            if (!currentStatus) {
                userConfig.setUsingAsCollateral(repayReserve.id, true);
                emit ReserveUsedAsCollateralEnabled(repayAsset, onBehalfOf);
            }
        }
    }

    /// @inheritdoc IPoolApeStaking
    function claimApeAndYield(address nftAsset, uint256[] memory tokenIds)
        external
        nonReentrant
    {
        require(tokenIds.length <= 30, "length limit");
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;

        uint256 balanceBefore = APE_COIN.balanceOf(address(this));
        uint256[] memory amounts = new uint256[](tokenIds.length);
        address[] memory users = new address[](tokenIds.length);
        uint256[] memory _nfts = new uint256[](1);
        uint256 totalAmount;
        for (uint256 index = 0; index < tokenIds.length; index++) {
            _nfts[0] = tokenIds[index];
            INTokenApeStaking(xTokenAddress).claimApeCoin(_nfts, address(this));

            uint256 balanceAfter = APE_COIN.balanceOf(address(this));
            address positionOwner = INToken(xTokenAddress).ownerOf(
                tokenIds[index]
            );

            users[index] = positionOwner;
            amounts[index] = balanceAfter - balanceBefore;
            totalAmount += amounts[index];
            balanceBefore = balanceAfter;
        }

        APE_YIELD.deposit(address(this), totalAmount);
        for (uint256 index = 0; index < users.length; index++) {
            if (amounts[index] != 0) {
                _supplyPsApeForUser(ps, users[index], amounts[index]);
            }
        }
    }

    function getUserHf(address user) internal view returns (uint256) {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.CalculateUserAccountDataParams memory params = DataTypes
            .CalculateUserAccountDataParams({
                userConfig: ps._usersConfig[user],
                reservesCount: ps._reservesCount,
                user: user,
                oracle: ADDRESSES_PROVIDER.getPriceOracle()
            });

        (, , , , , , , uint256 healthFactor, , ) = GenericLogic
            .calculateUserAccountData(ps._reserves, ps._reservesList, params);
        return healthFactor;
    }

    function checkSApeIsNotPaused(DataTypes.PoolStorage storage ps)
        internal
        view
    {
        DataTypes.ReserveData storage reserve = ps._reserves[
            DataTypes.SApeAddress
        ];

        (bool isActive, , , bool isPaused, ) = reserve.configuration.getFlags();

        require(isActive, Errors.RESERVE_INACTIVE);
        require(!isPaused, Errors.RESERVE_PAUSED);
    }

    function _supplyPsApeForUser(
        DataTypes.PoolStorage storage ps,
        address user,
        uint256 amount
    ) internal {
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            user
        ];
        SupplyLogic.executeSupply(
            ps._reserves,
            userConfig,
            DataTypes.ExecuteSupplyParams({
                asset: address(APE_YIELD),
                amount: amount,
                onBehalfOf: user,
                payer: address(this),
                referralCode: 0
            })
        );
        DataTypes.ReserveData storage assetReserve = ps._reserves[
            address(APE_YIELD)
        ];
        bool currentStatus = userConfig.isUsingAsCollateral(assetReserve.id);
        if (!currentStatus) {
            userConfig.setUsingAsCollateral(assetReserve.id, true);
            emit ReserveUsedAsCollateralEnabled(address(APE_YIELD), user);
        }
    }
}
