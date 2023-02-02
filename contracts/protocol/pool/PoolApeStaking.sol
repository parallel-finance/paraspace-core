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
import {IAutoCompoundApe} from "../../interfaces/IAutoCompoundApe.sol";
import {PercentageMath} from "../libraries/math/PercentageMath.sol";
import {Math} from "../../dependencies/openzeppelin/contracts/Math.sol";

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

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    IAutoCompoundApe internal immutable APE_COMPOUND;
    IERC20 internal immutable APE_COIN;
    uint256 internal constant POOL_REVISION = 130;

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
        IAutoCompoundApe apeCompound,
        IERC20 apeCoin
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
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
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index].tokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
        }
        INTokenApeStaking(xTokenAddress).withdrawApeCoin(_nfts, msg.sender);

        require(
            getUserHf(ps, msg.sender) >
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
            getUserHf(ps, msg.sender) >
                DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
            Errors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
        );
    }

    /// @inheritdoc IPoolApeStaking
    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithdrawWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        address xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        IERC721 bakcContract = INTokenApeStaking(xTokenAddress).getBAKC();
        address bakcNToken = ps._reserves[address(bakcContract)].xTokenAddress;
        uint256[] memory transferredTokenIds = new uint256[](_nftPairs.length);
        address[] memory transferredTokenOwners = new address[](
            _nftPairs.length
        );
        uint256 actualTransferAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(xTokenAddress).ownerOf(_nftPairs[index].mainTokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );

            //only partially withdraw need user's BAKC
            if (!_nftPairs[index].isUncommit) {
                transferredTokenOwners[
                    actualTransferAmount
                ] = validateBAKCOwnerAndTransfer(
                    bakcContract,
                    _nftPairs[index].bakcTokenId,
                    bakcNToken,
                    xTokenAddress,
                    msg.sender
                );
                transferredTokenIds[actualTransferAmount] = _nftPairs[index]
                    .bakcTokenId;
                actualTransferAmount++;
            }
        }
        INTokenApeStaking(xTokenAddress).withdrawBAKC(_nftPairs, msg.sender);

        ////transfer BAKC back for user
        for (uint256 index = 0; index < actualTransferAmount; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                transferredTokenOwners[index],
                transferredTokenIds[index]
            );
        }

        require(
            getUserHf(ps, msg.sender) >
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

        address xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        IERC721 bakcContract = INTokenApeStaking(xTokenAddress).getBAKC();
        address bakcNToken = ps._reserves[address(bakcContract)].xTokenAddress;
        address[] memory transferredTokenOwners = new address[](
            _nftPairs.length
        );
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(xTokenAddress).ownerOf(_nftPairs[index].mainTokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );

            transferredTokenOwners[index] = validateBAKCOwnerAndTransfer(
                bakcContract,
                _nftPairs[index].bakcTokenId,
                bakcNToken,
                xTokenAddress,
                msg.sender
            );
        }

        INTokenApeStaking(xTokenAddress).claimBAKC(_nftPairs, msg.sender);

        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                transferredTokenOwners[index],
                _nftPairs[index].bakcTokenId
            );
        }
    }

    struct BorrowAndStakeLocalVar {
        address nTokenAddress;
        uint256 beforeBalance;
        address bakcNToken;
        IERC721 bakcContract;
        address[] transferredTokenOwners;
    }

    /// @inheritdoc IPoolApeStaking
    function borrowApeAndStake(
        StakingInfo calldata stakingInfo,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        ApeCoinStaking.PairNftDepositWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        require(
            stakingInfo.borrowAsset == address(APE_COIN) ||
                stakingInfo.borrowAsset == address(APE_COMPOUND),
            Errors.INVALID_ASSET_TYPE
        );

        BorrowAndStakeLocalVar memory localVar;
        localVar.nTokenAddress = ps
            ._reserves[stakingInfo.nftAsset]
            .xTokenAddress;
        localVar.beforeBalance = APE_COIN.balanceOf(localVar.nTokenAddress);
        localVar.bakcContract = INTokenApeStaking(localVar.nTokenAddress)
            .getBAKC();
        localVar.bakcNToken = ps
            ._reserves[address(localVar.bakcContract)]
            .xTokenAddress;
        localVar.transferredTokenOwners = new address[](_nftPairs.length);

        DataTypes.ReserveData storage borrowAssetReserve = ps._reserves[
            stakingInfo.borrowAsset
        ];

        // 1, handle borrow part
        if (stakingInfo.borrowAmount > 0) {
            ValidationLogic.validateFlashloanSimple(borrowAssetReserve);
            if (stakingInfo.borrowAsset == address(APE_COIN)) {
                IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                    localVar.nTokenAddress,
                    stakingInfo.borrowAmount
                );
            } else {
                IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                    address(this),
                    stakingInfo.borrowAmount
                );
                APE_COMPOUND.withdraw(stakingInfo.borrowAmount);
                APE_COIN.safeTransfer(
                    localVar.nTokenAddress,
                    stakingInfo.borrowAmount
                );
            }
        }

        // 2, send cash part to xTokenAddress
        if (stakingInfo.cashAmount > 0) {
            APE_COIN.safeTransferFrom(
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

            localVar.transferredTokenOwners[
                index
            ] = validateBAKCOwnerAndTransfer(
                localVar.bakcContract,
                _nftPairs[index].bakcTokenId,
                localVar.bakcNToken,
                localVar.nTokenAddress,
                msg.sender
            );
        }
        INTokenApeStaking(localVar.nTokenAddress).depositBAKC(_nftPairs);
        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            localVar.bakcContract.safeTransferFrom(
                localVar.nTokenAddress,
                localVar.transferredTokenOwners[index],
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
            APE_COIN.balanceOf(localVar.nTokenAddress) ==
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
                getUserHf(ps, positionOwner) <
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
        uint256 totalAmount
    ) external {
        DataTypes.PoolStorage storage ps = poolStorage();
        require(
            msg.sender == ps._reserves[underlyingAsset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );

        DataTypes.ReserveData storage apeCoinData = ps._reserves[repayAsset];
        uint256 repayAmount = IERC20(apeCoinData.variableDebtTokenAddress)
            .balanceOf(onBehalfOf);
        if (repayAmount > 0) {
            repayAmount = Math.min(repayAmount, totalAmount);
        }
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

        uint256 supplyAmount = totalAmount - repayAmount;
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
    function claimApeAndCompound(
        address nftAsset,
        address[] calldata users,
        uint256[][] calldata tokenIds
    ) external nonReentrant {
        require(
            users.length == tokenIds.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        address xTokenAddress = ps._reserves[nftAsset].xTokenAddress;

        uint256 balanceBefore = APE_COIN.balanceOf(address(this));
        uint256[] memory amounts = new uint256[](tokenIds.length);

        uint256 totalAmount;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256[] calldata userTokenIds = tokenIds[i];
            for (uint256 j = 0; j < userTokenIds.length; j++) {
                address positionOwner = INToken(xTokenAddress).ownerOf(
                    userTokenIds[j]
                );
                require(users[i] == positionOwner, Errors.NOT_THE_OWNER);
            }

            INTokenApeStaking(xTokenAddress).claimApeCoin(
                userTokenIds,
                address(this)
            );

            uint256 balanceAfter = APE_COIN.balanceOf(address(this));
            unchecked {
                amounts[i] = balanceAfter - balanceBefore;
                balanceBefore = balanceAfter;
                totalAmount += amounts[i];
            }
        }

        depositApeAndSupplyCApeForUser(ps, totalAmount, users, amounts);
    }

    struct CompoundPairedApeRewardLocalVar {
        address xTokenAddress;
        IERC721 bakcContract;
        address bakcNToken;
        uint256 balanceBefore;
        uint256 balanceAfter;
        uint256[] amounts;
        address[] transferredTokenOwners;
        uint256 totalAmount;
    }

    /// @inheritdoc IPoolApeStaking
    function claimPairedApeAndCompound(
        address nftAsset,
        address[] calldata users,
        ApeCoinStaking.PairNft[][] calldata _nftPairs
    ) external nonReentrant {
        require(
            users.length == _nftPairs.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.PoolStorage storage ps = poolStorage();

        CompoundPairedApeRewardLocalVar memory localVar;
        localVar.xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        localVar.bakcContract = INTokenApeStaking(localVar.xTokenAddress)
            .getBAKC();
        localVar.bakcNToken = ps
            ._reserves[address(localVar.bakcContract)]
            .xTokenAddress;
        localVar.balanceBefore = APE_COIN.balanceOf(address(this));
        localVar.amounts = new uint256[](_nftPairs.length);

        for (uint256 i = 0; i < _nftPairs.length; i++) {
            ApeCoinStaking.PairNft[] calldata nftPair = _nftPairs[i];
            localVar.transferredTokenOwners = new address[](nftPair.length);
            for (uint256 j = 0; j < nftPair.length; j++) {
                require(
                    users[i] ==
                        INToken(localVar.xTokenAddress).ownerOf(
                            nftPair[j].mainTokenId
                        ),
                    Errors.NOT_THE_OWNER
                );

                localVar.transferredTokenOwners[
                    j
                ] = validateBAKCOwnerAndTransfer(
                    localVar.bakcContract,
                    nftPair[j].bakcTokenId,
                    localVar.bakcNToken,
                    localVar.xTokenAddress,
                    users[i]
                );
            }

            INTokenApeStaking(localVar.xTokenAddress).claimBAKC(
                nftPair,
                address(this)
            );

            for (uint256 index = 0; index < nftPair.length; index++) {
                localVar.bakcContract.safeTransferFrom(
                    localVar.xTokenAddress,
                    localVar.transferredTokenOwners[index],
                    nftPair[index].bakcTokenId
                );
            }

            localVar.balanceAfter = APE_COIN.balanceOf(address(this));
            localVar.amounts[i] =
                localVar.balanceAfter -
                localVar.balanceBefore;
            localVar.balanceBefore = localVar.balanceAfter;
            localVar.totalAmount += localVar.amounts[i];
        }

        depositApeAndSupplyCApeForUser(
            ps,
            localVar.totalAmount,
            users,
            localVar.amounts
        );
    }

    /// @inheritdoc IPoolApeStaking
    function getApeCompoundFeeRate() external view returns (uint256) {
        DataTypes.PoolStorage storage ps = poolStorage();
        return uint256(ps._apeCompoundFee);
    }

    function depositApeAndSupplyCApeForUser(
        DataTypes.PoolStorage storage ps,
        uint256 totalAmount,
        address[] calldata users,
        uint256[] memory amounts
    ) internal {
        APE_COMPOUND.deposit(address(this), totalAmount);

        uint256 compoundFee = ps._apeCompoundFee;
        uint256 totalFee = totalAmount.percentMul(compoundFee);
        if (totalFee > 0) {
            IERC20(address(APE_COMPOUND)).safeTransfer(msg.sender, totalFee);
        }

        for (uint256 index = 0; index < users.length; index++) {
            if (amounts[index] != 0) {
                supplyCApeForUser(
                    ps,
                    users[index],
                    amounts[index].percentMul(
                        PercentageMath.PERCENTAGE_FACTOR - compoundFee
                    )
                );
            }
        }
    }

    function getUserHf(DataTypes.PoolStorage storage ps, address user)
        internal
        view
        returns (uint256)
    {
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

    function supplyCApeForUser(
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
                asset: address(APE_COMPOUND),
                amount: amount,
                onBehalfOf: user,
                payer: address(this),
                referralCode: 0
            })
        );
        DataTypes.ReserveData storage assetReserve = ps._reserves[
            address(APE_COMPOUND)
        ];
        bool currentStatus = userConfig.isUsingAsCollateral(assetReserve.id);
        if (!currentStatus) {
            userConfig.setUsingAsCollateral(assetReserve.id, true);
            emit ReserveUsedAsCollateralEnabled(address(APE_COMPOUND), user);
        }
    }

    function validateBAKCOwnerAndTransfer(
        IERC721 bakcContract,
        uint256 tokenId,
        address bakcNToken,
        address apeStakingNToken,
        address userAddress
    ) internal returns (address bakcOwner) {
        bakcOwner = bakcContract.ownerOf(tokenId);
        address nBAKCOwner;
        if (bakcNToken != address(0)) {
            nBAKCOwner = INToken(bakcNToken).ownerOf(tokenId);
        }
        require(
            (userAddress == bakcOwner) || (userAddress == nBAKCOwner),
            Errors.NOT_THE_BAKC_OWNER
        );
        bakcContract.safeTransferFrom(bakcOwner, apeStakingNToken, tokenId);
    }
}
