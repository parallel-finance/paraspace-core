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

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    uint256 internal constant POOL_REVISION = 1;

    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );

    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(IPoolAddressesProvider provider) {
        ADDRESSES_PROVIDER = provider;
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

    struct WithdrawBAKCLocalVar {
        address xTokenAddress;
        IERC721 bakcContract;
        address bakcNToken;
        uint256 actualTransferAmount;
        ApeCoinStaking apeCoinStaking;
        uint256[] transferredTokenIds;
        address[] originArray;
    }

    /// @inheritdoc IPoolApeStaking
    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        WithdrawBAKCLocalVar memory vars;
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        vars.xTokenAddress = nftReserve.xTokenAddress;
        vars.bakcContract = INTokenApeStaking(vars.xTokenAddress).getBAKC();
        DataTypes.ReserveData storage bakcReserve = ps._reserves[
            address(vars.bakcContract)
        ];
        vars.bakcNToken = bakcReserve.xTokenAddress;
        vars.apeCoinStaking = INTokenApeStaking(vars.xTokenAddress)
            .getApeStaking();
        vars.transferredTokenIds = new uint256[](_nftPairs.length);
        vars.originArray = new address[](_nftPairs.length);
        vars.actualTransferAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(vars.xTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            (uint256 stakedAmount, ) = vars.apeCoinStaking.nftPosition(
                ApeStakingLogic.BAKC_POOL_ID,
                _nftPairs[index].bakcTokenId
            );

            //only partially withdraw need user's BAKC
            if (_nftPairs[index].amount != stakedAmount) {
                vars.originArray[
                    vars.actualTransferAmount
                ] = validateBAKCOwnerAndTransfer(
                    vars.bakcContract,
                    _nftPairs[index].bakcTokenId,
                    vars.bakcNToken,
                    vars.xTokenAddress
                );
                vars.transferredTokenIds[vars.actualTransferAmount] = _nftPairs[
                    index
                ].bakcTokenId;
                vars.actualTransferAmount++;
            }
        }
        INTokenApeStaking(vars.xTokenAddress).withdrawBAKC(
            _nftPairs,
            msg.sender
        );

        ////transfer BAKC back for user
        for (uint256 index = 0; index < vars.actualTransferAmount; index++) {
            vars.bakcContract.safeTransferFrom(
                vars.xTokenAddress,
                vars.originArray[index],
                vars.transferredTokenIds[index]
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

        address xTokenAddress;
        IERC721 bakcContract;
        address bakcNToken;
        {
            DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
            xTokenAddress = nftReserve.xTokenAddress;
            bakcContract = INTokenApeStaking(xTokenAddress).getBAKC();
            DataTypes.ReserveData storage bakcReserve = ps._reserves[
                address(bakcContract)
            ];
            bakcNToken = bakcReserve.xTokenAddress;
        }

        address[] memory originArray = new address[](_nftPairs.length);
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(xTokenAddress).ownerOf(_nftPairs[index].mainTokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );

            originArray[index] = validateBAKCOwnerAndTransfer(
                bakcContract,
                _nftPairs[index].bakcTokenId,
                bakcNToken,
                xTokenAddress
            );
        }

        INTokenApeStaking(xTokenAddress).claimBAKC(_nftPairs, msg.sender);

        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                originArray[index],
                _nftPairs[index].bakcTokenId
            );
        }
    }

    struct BorrowAndStakeLocalVar {
        address nTokenAddress;
        IERC20 apeCoin;
        uint256 beforeBalance;
        address bakcNToken;
        IERC721 bakcContract;
        address[] originArray;
    }

    /// @inheritdoc IPoolApeStaking
    function borrowApeAndStake(
        StakingInfo calldata stakingInfo,
        ApeCoinStaking.SingleNft[] calldata _nfts,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        BorrowAndStakeLocalVar memory localVar;
        {
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

            DataTypes.ReserveData storage bakcReserve = ps._reserves[
                address(localVar.bakcContract)
            ];

            localVar.bakcNToken = bakcReserve.xTokenAddress;

            localVar.originArray = new address[](_nftPairs.length);
        }

        // 1, send borrow part to xTokenAddress
        if (stakingInfo.borrowAmount > 0) {
            DataTypes.ReserveData storage apeReserve = ps._reserves[
                address(localVar.apeCoin)
            ];
            ValidationLogic.validateFlashloanSimple(apeReserve);
            IPToken(apeReserve.xTokenAddress).transferUnderlyingTo(
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

            localVar.originArray[index] = validateBAKCOwnerAndTransfer(
                localVar.bakcContract,
                _nftPairs[index].bakcTokenId,
                localVar.bakcNToken,
                localVar.nTokenAddress
            );
        }

        INTokenApeStaking(localVar.nTokenAddress).depositBAKC(_nftPairs);
        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            localVar.bakcContract.safeTransferFrom(
                localVar.nTokenAddress,
                localVar.originArray[index],
                _nftPairs[index].bakcTokenId
            );
        }

        // 5 set sape as collateral
        setSApeUseAsCollateral(msg.sender);

        // 6 mint debt token
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
            SupplyLogic.executeSupply(
                ps._reserves,
                ps._usersConfig[onBehalfOf],
                DataTypes.ExecuteSupplyParams({
                    asset: repayAsset,
                    amount: supplyAmount,
                    onBehalfOf: onBehalfOf,
                    payer: msg.sender,
                    referralCode: 0
                })
            );
        }
    }

    function setSApeUseAsCollateral(address user) internal {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage sApeReserve = ps._reserves[
            DataTypes.SApeAddress
        ];
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            user
        ];
        bool currentStatus = userConfig.isUsingAsCollateral(sApeReserve.id);
        if (!currentStatus) {
            userConfig.setUsingAsCollateral(sApeReserve.id, true);
            emit ReserveUsedAsCollateralEnabled(DataTypes.SApeAddress, user);
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

    function validateBAKCOwnerAndTransfer(
        IERC721 bakcContract,
        uint256 tokenId,
        address bakcNToken,
        address apeStakingNToken
    ) internal returns (address bakcOwner) {
        bakcOwner = bakcContract.ownerOf(tokenId);
        address nBAKCOwner;
        if (bakcNToken != address(0)) {
            nBAKCOwner = INToken(bakcNToken).ownerOf(tokenId);
        }
        require(
            (msg.sender == bakcOwner) || (msg.sender == nBAKCOwner),
            Errors.NOT_THE_BAKC_OWNER
        );
        bakcContract.safeTransferFrom(bakcOwner, apeStakingNToken, tokenId);
    }
}
