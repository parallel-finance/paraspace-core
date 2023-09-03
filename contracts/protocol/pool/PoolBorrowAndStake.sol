// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {PoolStorage} from "./PoolStorage.sol";
import "../../interfaces/IPoolBorrowAndStake.sol";
import "../../interfaces/IPToken.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../../interfaces/IXTokenType.sol";
import "../../interfaces/INTokenApeStaking.sol";
import {ValidationLogic} from "../libraries/logic/ValidationLogic.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";
import {UserConfiguration} from "../libraries/configuration/UserConfiguration.sol";
import {ApeStakingLogic} from "../tokenization/libraries/ApeStakingLogic.sol";
import "../libraries/logic/BorrowLogic.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IAutoCompoundApe} from "../../interfaces/IAutoCompoundApe.sol";
import {Math} from "../../dependencies/openzeppelin/contracts/Math.sol";
import {ISwapRouter} from "../../dependencies/uniswapv3-periphery/interfaces/ISwapRouter.sol";
import {IPriceOracleGetter} from "../../interfaces/IPriceOracleGetter.sol";
import {Helpers} from "../libraries/helpers/Helpers.sol";

contract PoolBorrowAndStake is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolBorrowAndStake
{
    using ReserveLogic for DataTypes.ReserveData;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using SafeERC20 for IERC20;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using SafeCast for uint256;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    IAutoCompoundApe internal immutable APE_COMPOUND;
    IERC20 internal immutable APE_COIN;
    uint256 internal constant POOL_REVISION = 149;

    event ReserveUsedAsCollateralDisabled(
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
        IERC20 apeCoin
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
        APE_COIN = apeCoin;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    /// @inheritdoc IPoolBorrowAndStake
    function borrowApeAndStakeV2(
        StakingInfoV2 calldata stakingInfo,
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

        // no time lock needed here
        DataTypes.TimeLockParams memory timeLockParams;
        // 1, handle borrow part
        if (stakingInfo.borrowAmount > 0) {
            DataTypes.ReserveData storage borrowAssetReserve = ps._reserves[
                stakingInfo.borrowAsset
            ];
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
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            msg.sender
        ];
        if (stakingInfo.cashAmount > 0) {
            if (stakingInfo.cashAsset == address(APE_COIN)) {
                APE_COIN.safeTransferFrom(
                    msg.sender,
                    localVar.xTokenAddress,
                    stakingInfo.cashAmount
                );
            } else {
                //pcApe
                DataTypes.ReserveData storage cApeReserve = ps._reserves[
                    address(APE_COMPOUND)
                ];
                DataTypes.ReserveCache memory cApeReserveCache = cApeReserve
                    .cache();
                address PCAPE = cApeReserveCache.xTokenAddress;
                require(
                    stakingInfo.cashAsset == PCAPE,
                    Errors.INVALID_ASSET_TYPE
                );
                cApeReserve.updateState(cApeReserveCache);
                cApeReserve.updateInterestRates(
                    cApeReserveCache,
                    address(APE_COMPOUND),
                    0,
                    stakingInfo.cashAmount
                );
                IPToken(PCAPE).burn(
                    msg.sender,
                    address(this),
                    stakingInfo.cashAmount,
                    cApeReserveCache.nextLiquidityIndex,
                    timeLockParams
                );
                uint16 cApeId = cApeReserve.id;
                if (userConfig.isUsingAsCollateral(cApeId)) {
                    uint256 userBalance = IPToken(PCAPE).balanceOf(msg.sender);
                    if (userBalance == 0) {
                        userConfig.setUsingAsCollateral(cApeId, false);
                        emit ReserveUsedAsCollateralDisabled(
                            address(APE_COMPOUND),
                            msg.sender
                        );
                    }
                }

                APE_COMPOUND.withdraw(stakingInfo.cashAmount);
                APE_COIN.safeTransfer(
                    localVar.xTokenAddress,
                    stakingInfo.cashAmount
                );
            }
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

        //5 collateralize sAPE
        Helpers.setAssetUsedAsCollateral(
            userConfig,
            ps._reserves,
            DataTypes.SApeAddress,
            msg.sender
        );

        // 6 mint debt token
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

        //7 checkout ape balance
        require(
            APE_COIN.balanceOf(localVar.xTokenAddress) ==
                localVar.balanceBefore,
            Errors.TOTAL_STAKING_AMOUNT_WRONG
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
