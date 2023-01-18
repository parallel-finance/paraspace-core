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
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {Math} from "../../dependencies/openzeppelin/contracts/Math.sol";
import {ISwapRouter} from "../../dependencies/univ3/interfaces/ISwapRouter.sol";
import {IPriceOracleGetter} from "../../interfaces/IPriceOracleGetter.sol";

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
    IERC20 internal immutable USDC;
    uint256 internal constant POOL_REVISION = 130;
    ISwapRouter internal immutable SWAP_ROUTER;

    uint256 internal constant DEFAULT_MAX_SLIPPAGE = 500; // 5%

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
        address[] transferredTokenOwners;
        DataTypes.ApeCompoundStrategy[] options;
        uint256 totalAmount;
        uint256 totalSwapAmount;
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
        ISwapRouter uniswapV3SwapRouter
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
        APE_COIN = apeCoin;
        USDC = IERC20(usdc);
        SWAP_ROUTER = ISwapRouter(uniswapV3SwapRouter);
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

        ApeStakingLocalVars memory localVar = _cache(ps, nftAsset);
        uint256[] memory transferredTokenIds = new uint256[](_nftPairs.length);
        address[] memory transferredTokenOwners = new address[](
            _nftPairs.length
        );
        uint256 actualTransferAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(localVar.xTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            //only partially withdraw need user's BAKC
            if (!_nftPairs[index].isUncommit) {
                transferredTokenOwners[
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

        ApeStakingLocalVars memory localVar = _cache(ps, nftAsset);
        address[] memory transferredTokenOwners = new address[](
            _nftPairs.length
        );
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(localVar.xTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            transferredTokenOwners[index] = _validateBAKCOwnerAndTransfer(
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
                transferredTokenOwners[index],
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
        checkSApeIsNotPaused(ps);

        require(
            stakingInfo.borrowAsset == address(APE_COIN) ||
                stakingInfo.borrowAsset == address(APE_COMPOUND),
            Errors.INVALID_ASSET_TYPE
        );

        ApeStakingLocalVars memory localVar = _cache(ps, stakingInfo.nftAsset);
        localVar.balanceBefore = APE_COIN.balanceOf(localVar.xTokenAddress);
        localVar.transferredTokenOwners = new address[](_nftPairs.length);

        DataTypes.ReserveData storage borrowAssetReserve = ps._reserves[
            stakingInfo.borrowAsset
        ];

        // 1, handle borrow part
        if (stakingInfo.borrowAmount > 0) {
            ValidationLogic.validateFlashloanSimple(borrowAssetReserve);
            if (stakingInfo.borrowAsset == address(APE_COIN)) {
                IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                    localVar.xTokenAddress,
                    stakingInfo.borrowAmount
                );
            } else {
                IPToken(borrowAssetReserve.xTokenAddress).transferUnderlyingTo(
                    address(this),
                    stakingInfo.borrowAmount
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
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                INToken(localVar.xTokenAddress).ownerOf(_nfts[index].tokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );
        }
        INTokenApeStaking(localVar.xTokenAddress).depositApeCoin(_nfts);

        // 4, deposit bakc pool
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
        INTokenApeStaking(localVar.xTokenAddress).depositBAKC(_nftPairs);
        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            localVar.bakcContract.safeTransferFrom(
                localVar.xTokenAddress,
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
            APE_COIN.balanceOf(localVar.xTokenAddress) ==
                localVar.balanceBefore,
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
    function repayAndSupplyApe(
        address underlyingAsset,
        address onBehalfOf,
        uint256 totalAmount
    ) external {
        DataTypes.PoolStorage storage ps = poolStorage();
        require(
            msg.sender == ps._reserves[underlyingAsset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );

        // 1, repay APE
        uint256 leftAmount = totalAmount;
        leftAmount -= _repayForUser(
            ps,
            address(APE_COIN),
            msg.sender,
            onBehalfOf,
            leftAmount
        );
        if (leftAmount == 0) {
            return;
        }

        // 2, deposit APE as cAPE
        APE_COIN.safeTransferFrom(msg.sender, address(this), leftAmount);
        APE_COMPOUND.deposit(address(this), leftAmount);

        // 3, repay and supply cAPE for user
        _supplyForUser(
            ps,
            address(APE_COMPOUND),
            address(this),
            onBehalfOf,
            leftAmount,
            true
        );
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

        ApeStakingLocalVars memory localVar;
        localVar.xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        localVar.balanceBefore = APE_COIN.balanceOf(address(this));
        localVar.amounts = new uint256[](users.length);
        localVar.options = new DataTypes.ApeCompoundStrategy[](users.length);

        for (uint256 i = 0; i < users.length; i++) {
            for (uint256 j = 0; j < tokenIds[i].length; j++) {
                address positionOwner = INToken(localVar.xTokenAddress).ownerOf(
                    tokenIds[i][j]
                );
                require(users[i] == positionOwner, Errors.NOT_THE_OWNER);
            }

            INTokenApeStaking(localVar.xTokenAddress).claimApeCoin(
                tokenIds[i],
                address(this)
            );

            uint256 balanceAfter = APE_COIN.balanceOf(address(this));
            localVar.options[i] = ps._apeCompoundStrategies[users[i]];
            unchecked {
                localVar.amounts[i] = balanceAfter - localVar.balanceBefore;
                localVar.balanceBefore = balanceAfter;
                localVar.totalAmount += localVar.amounts[i];
                if (
                    localVar.options[i].ty !=
                    DataTypes.ApeCompoundType.SwapAndSupply
                ) {
                    continue;
                }
                localVar.totalSwapAmount += localVar.amounts[i].percentMul(
                    localVar.options[i].swapPercent
                );
            }
        }

        _compoundForUsers(ps, localVar, users);
    }

    function _cache(DataTypes.PoolStorage storage ps, address nftAsset)
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

        ApeStakingLocalVars memory localVar = _cache(ps, nftAsset);
        localVar.balanceBefore = APE_COIN.balanceOf(address(this));
        localVar.amounts = new uint256[](users.length);
        localVar.options = new DataTypes.ApeCompoundStrategy[](users.length);

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

            localVar.balanceAfter = APE_COIN.balanceOf(address(this));
            localVar.amounts[i] =
                localVar.balanceAfter -
                localVar.balanceBefore;
            localVar.balanceBefore = localVar.balanceAfter;
            localVar.totalAmount += localVar.amounts[i];
            localVar.options[i] = ps._apeCompoundStrategies[users[i]];
            if (
                localVar.options[i].ty !=
                DataTypes.ApeCompoundType.SwapAndSupply
            ) {
                continue;
            }
            localVar.totalSwapAmount += localVar.amounts[i].percentMul(
                localVar.options[i].swapPercent
            );
        }

        _compoundForUsers(ps, localVar, users);
    }

    /// @inheritdoc IPoolApeStaking
    function getApeCompoundFeeRate() external view returns (uint256) {
        DataTypes.PoolStorage storage ps = poolStorage();
        return uint256(ps._apeCompoundFee);
    }

    function getUserHf(DataTypes.PoolStorage storage ps, address user)
        internal
        view
        returns (uint256)
    {
        DataTypes.UserConfigurationMap memory userConfig = ps._usersConfig[
            user
        ];
        if (!userConfig.isBorrowingAny()) {
            return type(uint256).max;
        }
        DataTypes.CalculateUserAccountDataParams memory params = DataTypes
            .CalculateUserAccountDataParams({
                userConfig: userConfig,
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

    function _depositApeAndPayFees(
        DataTypes.PoolStorage storage ps,
        ApeStakingLocalVars memory localVar
    ) internal returns (uint256 compoundFee) {
        compoundFee = ps._apeCompoundFee;
        uint256 totalDepositAmount = localVar.totalAmount -
            localVar.totalSwapAmount;
        APE_COMPOUND.deposit(
            address(this),
            totalDepositAmount.percentMul(
                PercentageMath.PERCENTAGE_FACTOR - compoundFee
            )
        );
        uint256 apeFee = localVar.totalAmount.percentMul(compoundFee);
        if (apeFee > 0) {
            APE_COMPOUND.deposit(msg.sender, apeFee);
        }
    }

    function _compoundForUsers(
        DataTypes.PoolStorage storage ps,
        ApeStakingLocalVars memory localVar,
        address[] calldata users
    ) internal {
        uint256 compoundFee = _depositApeAndPayFees(ps, localVar);

        address weth = ADDRESSES_PROVIDER.getWETH();
        uint256 usdcApePrice;
        uint256 wethApePrice;
        if (localVar.totalSwapAmount > 0) {
            usdcApePrice = _getApeRelativePrice(address(USDC), 1E6);
            wethApePrice = _getApeRelativePrice(weth, 1E18);
        }

        for (uint256 index = 0; index < users.length; index++) {
            uint256 amount = localVar.amounts[index].percentMul(
                PercentageMath.PERCENTAGE_FACTOR - compoundFee
            );
            if (amount == 0) {
                continue;
            }
            if (
                localVar.options[index].ty ==
                DataTypes.ApeCompoundType.RepayAndSupply
            ) {
                _supplyForUser(
                    ps,
                    address(APE_COMPOUND),
                    address(this),
                    users[index],
                    amount,
                    true
                );
            } else if (
                localVar.options[index].ty == DataTypes.ApeCompoundType.Supply
            ) {
                _supplyForUser(
                    ps,
                    address(APE_COMPOUND),
                    address(this),
                    users[index],
                    amount,
                    false
                );
            } else {
                uint256 swapAmount = amount.percentMul(
                    localVar.options[index].swapPercent
                );
                address tokenOut = localVar.options[index].swapTokenOut ==
                    DataTypes.ApeCompoundTokenOut.USDC
                    ? address(USDC)
                    : weth;
                uint256 price = localVar.options[index].swapTokenOut ==
                    DataTypes.ApeCompoundTokenOut.USDC
                    ? usdcApePrice
                    : wethApePrice;
                _swapExactTokensForTokens(
                    tokenOut,
                    swapAmount,
                    users[index],
                    price
                );

                if (swapAmount == amount) {
                    continue;
                }
                _supplyForUser(
                    ps,
                    address(APE_COMPOUND),
                    address(this),
                    users[index],
                    amount - swapAmount,
                    false
                );
            }
        }
    }

    function _swapExactTokensForTokens(
        address tokenOut,
        uint256 amountIn,
        address recipient,
        uint256 price
    ) internal returns (uint256 amountOut) {
        return
            SWAP_ROUTER.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: address(APE_COIN),
                    tokenOut: tokenOut,
                    fee: 3000,
                    recipient: recipient,
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: amountIn.wadMul(price),
                    sqrtPriceLimitX96: 0
                })
            );
    }

    function _getApeRelativePrice(address tokenOut, uint256 tokenOutUnit)
        internal
        view
        returns (uint256)
    {
        IPriceOracleGetter oracle = IPriceOracleGetter(
            ADDRESSES_PROVIDER.getPriceOracle()
        );
        uint256 apePrice = oracle.getAssetPrice(address(APE_COIN));
        uint256 tokenOutPrice = oracle.getAssetPrice(tokenOut);

        return
            ((apePrice * tokenOutUnit).wadDiv(tokenOutPrice * 1E18)).percentMul(
                PercentageMath.PERCENTAGE_FACTOR - DEFAULT_MAX_SLIPPAGE
            );
    }

    function _supplyForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 amount,
        bool repay
    ) internal {
        if (repay)
            amount -= _repayForUser(ps, asset, payer, onBehalfOf, amount);
        if (amount == 0) return;
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
        DataTypes.ReserveData storage assetReserve = ps._reserves[asset];
        uint16 reserveId = assetReserve.id;
        if (!userConfig.isUsingAsCollateral(reserveId)) {
            userConfig.setUsingAsCollateral(reserveId, true);
            emit ReserveUsedAsCollateralEnabled(asset, onBehalfOf);
        }
    }

    function _repayForUser(
        DataTypes.PoolStorage storage ps,
        address asset,
        address payer,
        address onBehalfOf,
        uint256 maxAmount
    ) internal returns (uint256) {
        uint256 repayAmount = IERC20(
            ps._reserves[asset].variableDebtTokenAddress
        ).balanceOf(onBehalfOf);
        if (repayAmount == 0 || maxAmount == 0) {
            return 0;
        }

        repayAmount = Math.min(repayAmount, maxAmount);
        BorrowLogic.executeRepay(
            ps._reserves,
            ps._usersConfig[onBehalfOf],
            DataTypes.ExecuteRepayParams({
                asset: asset,
                amount: repayAmount,
                onBehalfOf: onBehalfOf,
                payer: payer,
                usePTokens: false
            })
        );
        return repayAmount;
    }

    function _validateBAKCOwnerAndTransfer(
        ApeStakingLocalVars memory localVar,
        uint256 tokenId,
        address userAddress
    ) internal returns (address bakcOwner) {
        bakcOwner = localVar.bakcContract.ownerOf(tokenId);
        address nBAKCOwner;
        if (localVar.bakcNToken != address(0)) {
            nBAKCOwner = INToken(localVar.bakcNToken).ownerOf(tokenId);
        }
        require(
            (userAddress == bakcOwner) || (userAddress == nBAKCOwner),
            Errors.NOT_THE_BAKC_OWNER
        );
        localVar.bakcContract.safeTransferFrom(
            bakcOwner,
            localVar.xTokenAddress,
            tokenId
        );
    }
}
