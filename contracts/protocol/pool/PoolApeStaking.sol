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
import {ISwapRouter} from "../../dependencies/univ3/interfaces/ISwapRouter.sol";
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
    IERC20 internal immutable USDC;
    ISwapRouter internal immutable SWAP_ROUTER;

    uint24 internal immutable APE_WETH_FEE;
    uint24 internal immutable WETH_USDC_FEE;
    address internal immutable WETH;
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
        uint256 compoundFee;
        address compoundBot;
        uint256 totalUsdcSwapAmount;
        uint256 totalWethSwapAmount;
        uint256 usdcApePrice;
        uint256 wethApePrice;
        address pUSDCAddress;
        address pWETHAddress;
    }

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(
        IPoolAddressesProvider provider,
        IAutoCompoundApe apeCompound,
        IERC20 apeCoin,
        IERC20 usdc,
        ISwapRouter uniswapV3SwapRouter,
        address weth,
        uint24 apeWethFee,
        uint24 wethUsdcFee,
        address apeStakingVault
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
        APE_COIN = apeCoin;
        USDC = IERC20(usdc);
        SWAP_ROUTER = ISwapRouter(uniswapV3SwapRouter);
        WETH = weth;
        APE_WETH_FEE = apeWethFee;
        WETH_USDC_FEE = wethUsdcFee;
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
            DataTypes.UserConfigurationMap memory userConfig = ps._usersConfig[
                positionOwner
            ];
            _checkUserHf(ps, userConfig, positionOwner, false);
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

    /// @inheritdoc IPoolApeStaking
    function claimApeAndCompound(
        address nftAsset,
        address[] calldata users,
        uint256[][] calldata tokenIds,
        uint256 minUsdcApePrice,
        uint256 minWethApePrice
    ) external nonReentrant {
        require(
            users.length == tokenIds.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.PoolStorage storage ps = poolStorage();
        ApeStakingLocalVars memory localVar = _compoundCache(
            ps,
            nftAsset,
            users.length
        );
        require(msg.sender == localVar.compoundBot, Errors.CALLER_NOT_OPERATOR);

        for (uint256 i = 0; i < users.length; i++) {
            for (uint256 j = 0; j < tokenIds[i].length; j++) {
                require(
                    users[i] ==
                        INToken(localVar.xTokenAddress).ownerOf(tokenIds[i][j]),
                    Errors.NOT_THE_OWNER
                );
            }

            INTokenApeStaking(localVar.xTokenAddress).claimApeCoin(
                tokenIds[i],
                address(this)
            );

            _addUserToCompoundCache(ps, localVar, i, users[i]);
        }

        _compoundForUsers(
            ps,
            localVar,
            users,
            minUsdcApePrice,
            minWethApePrice
        );
    }

    /// @inheritdoc IPoolApeStaking
    function claimPairedApeAndCompound(
        address nftAsset,
        address[] calldata users,
        ApeCoinStaking.PairNft[][] calldata _nftPairs,
        uint256 minUsdcApePrice,
        uint256 minWethApePrice
    ) external nonReentrant {
        require(
            users.length == _nftPairs.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.PoolStorage storage ps = poolStorage();
        ApeStakingLocalVars memory localVar = _compoundCache(
            ps,
            nftAsset,
            users.length
        );
        require(msg.sender == localVar.compoundBot, Errors.CALLER_NOT_OPERATOR);

        for (uint256 i = 0; i < _nftPairs.length; i++) {
            localVar.transferredTokenOwners = new address[](
                _nftPairs[i].length
            );
            for (uint256 j = 0; j < _nftPairs[i].length; j++) {
                require(
                    users[i] ==
                        INToken(localVar.xTokenAddress).ownerOf(
                            _nftPairs[i][j].mainTokenId
                        ),
                    Errors.NOT_THE_OWNER
                );

                localVar.transferredTokenOwners[
                        j
                    ] = _validateBAKCOwnerAndTransfer(
                    localVar,
                    _nftPairs[i][j].bakcTokenId,
                    users[i]
                );
            }

            INTokenApeStaking(localVar.xTokenAddress).claimBAKC(
                _nftPairs[i],
                address(this)
            );

            for (uint256 index = 0; index < _nftPairs[i].length; index++) {
                localVar.bakcContract.safeTransferFrom(
                    localVar.xTokenAddress,
                    localVar.transferredTokenOwners[index],
                    _nftPairs[i][index].bakcTokenId
                );
            }

            _addUserToCompoundCache(ps, localVar, i, users[i]);
        }

        _compoundForUsers(
            ps,
            localVar,
            users,
            minUsdcApePrice,
            minWethApePrice
        );
    }

    function _generalCache(DataTypes.PoolStorage storage ps, address nftAsset)
        internal
        view
        returns (ApeStakingLocalVars memory localVar)
    {
        localVar.xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        localVar.bakcContract = INTokenApeStaking(localVar.xTokenAddress)
            .getBAKC();
        localVar.bakcNToken = ps
            ._reserves[address(localVar.bakcContract)]
            .xTokenAddress;
    }

    function _compoundCache(
        DataTypes.PoolStorage storage ps,
        address nftAsset,
        uint256 numUsers
    ) internal view returns (ApeStakingLocalVars memory localVar) {
        localVar = _generalCache(ps, nftAsset);
        localVar.balanceBefore = APE_COIN.balanceOf(address(this));
        localVar.amounts = new uint256[](numUsers);
        localVar.swapAmounts = new uint256[](numUsers);
        localVar.options = new DataTypes.ApeCompoundStrategy[](numUsers);
        localVar.compoundFee = ps._apeCompoundFee;
        localVar.compoundBot = ps._apeCompoundBot;
    }

    function _addUserToCompoundCache(
        DataTypes.PoolStorage storage ps,
        ApeStakingLocalVars memory localVar,
        uint256 i,
        address user
    ) internal view {
        localVar.balanceAfter = APE_COIN.balanceOf(address(this));
        localVar.options[i] = ps._apeCompoundStrategies[user];
        unchecked {
            localVar.amounts[i] = (localVar.balanceAfter -
                localVar.balanceBefore).percentMul(
                    PercentageMath.PERCENTAGE_FACTOR - localVar.compoundFee
                );
            localVar.balanceBefore = localVar.balanceAfter;
            localVar.totalAmount += localVar.amounts[i];
        }

        if (localVar.options[i].swapPercent > 0) {
            localVar.swapAmounts[i] = localVar.amounts[i].percentMul(
                localVar.options[i].swapPercent
            );
            if (
                localVar.options[i].swapTokenOut ==
                DataTypes.ApeCompoundTokenOut.USDC
            ) {
                localVar.totalUsdcSwapAmount += localVar.swapAmounts[i];
            } else {
                localVar.totalWethSwapAmount += localVar.swapAmounts[i];
            }
        }
    }

    /// @inheritdoc IPoolApeStaking
    function getApeCompoundFeeRate() external view returns (uint256) {
        DataTypes.PoolStorage storage ps = poolStorage();
        return uint256(ps._apeCompoundFee);
    }

    function _checkUserHf(
        DataTypes.PoolStorage storage ps,
        DataTypes.UserConfigurationMap memory userConfig,
        address user,
        bool checkAbove
    ) private view {
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

    function _checkSApeIsNotPaused(DataTypes.PoolStorage storage ps)
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

    function _compoundForUsers(
        DataTypes.PoolStorage storage ps,
        ApeStakingLocalVars memory localVar,
        address[] calldata users,
        uint256 minUsdcApePrice,
        uint256 minWethApePrice
    ) internal {
        uint256 totalSwapAmount = localVar.totalUsdcSwapAmount +
            localVar.totalWethSwapAmount;
        if (localVar.totalAmount > totalSwapAmount) {
            APE_COMPOUND.deposit(
                address(this),
                localVar.totalAmount - totalSwapAmount
            );
        }

        uint256 compoundFee = localVar
            .totalAmount
            .percentDiv(PercentageMath.PERCENTAGE_FACTOR - localVar.compoundFee)
            .percentMul(localVar.compoundFee);
        if (compoundFee > 0) {
            APE_COIN.safeTransfer(localVar.compoundBot, compoundFee);
        }

        if (localVar.totalUsdcSwapAmount > 0) {
            bytes memory usdcSwapPath = abi.encodePacked(
                APE_COIN,
                APE_WETH_FEE,
                WETH,
                WETH_USDC_FEE,
                USDC
            );
            localVar.pUSDCAddress = ps._reserves[address(USDC)].xTokenAddress;
            localVar.usdcApePrice = _swapAndSupplyForUser(
                ps,
                address(USDC),
                localVar.pUSDCAddress,
                localVar.totalUsdcSwapAmount,
                usdcSwapPath,
                address(this),
                minUsdcApePrice
            );
        }

        if (localVar.totalWethSwapAmount > 0) {
            bytes memory wethSwapPath = abi.encodePacked(
                APE_COIN,
                APE_WETH_FEE,
                WETH
            );
            localVar.pWETHAddress = ps._reserves[address(WETH)].xTokenAddress;
            localVar.wethApePrice = _swapAndSupplyForUser(
                ps,
                address(WETH),
                localVar.pWETHAddress,
                localVar.totalWethSwapAmount,
                wethSwapPath,
                address(this),
                minWethApePrice
            );
        }

        for (uint256 i = 0; i < users.length; i++) {
            if (localVar.swapAmounts[i] > 0) {
                address swapTokenOut;
                uint256 price;
                if (
                    localVar.options[i].swapTokenOut ==
                    DataTypes.ApeCompoundTokenOut.USDC
                ) {
                    swapTokenOut = localVar.pUSDCAddress;
                    price = localVar.usdcApePrice;
                } else {
                    swapTokenOut = localVar.pWETHAddress;
                    price = localVar.wethApePrice;
                }
                IERC20(swapTokenOut).safeTransfer(
                    users[i],
                    (localVar.swapAmounts[i] * price) / 1e18
                );
            }
            _repayAndSupplyForUser(
                ps,
                address(APE_COMPOUND),
                address(this),
                users[i],
                localVar.amounts[i] - localVar.swapAmounts[i]
            );
        }
    }

    function _swapAndSupplyForUser(
        DataTypes.PoolStorage storage ps,
        address tokenOut,
        address xTokenAddress,
        uint256 amountIn,
        bytes memory swapPath,
        address user,
        uint256 price
    ) internal returns (uint256) {
        if (amountIn == 0) {
            return price;
        }
        uint256 amountOut = SWAP_ROUTER.exactInput(
            ISwapRouter.ExactInputParams({
                path: swapPath,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountIn.wadMul(price)
            })
        );
        uint256 beforeBalance = IERC20(xTokenAddress).balanceOf(address(this));
        _supplyForUser(ps, tokenOut, address(this), user, amountOut);
        return
            ((IERC20(xTokenAddress).balanceOf(address(this)) - beforeBalance) *
                1e18) / amountIn;
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
                (bakcOwner == localVar.bakcNToken &&
                    userAddress ==
                    INToken(localVar.bakcNToken).ownerOf(tokenId)),
            Errors.NOT_THE_BAKC_OWNER
        );
        localVar.bakcContract.safeTransferFrom(
            bakcOwner,
            localVar.xTokenAddress,
            tokenId
        );
    }
}
