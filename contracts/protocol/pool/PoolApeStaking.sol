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
import {ISwapRouter} from "../../dependencies/univ3/interfaces/ISwapRouter.sol";

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
    ISwapRouter internal immutable SWAP_ROUTER;

    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );

    struct LocalVar {
        address xTokenAddress;
        IERC721 bakcContract;
        address bakcNToken;
        uint256 balanceBefore;
        uint256 balanceAfter;
        uint256[] amounts;
        address[] transferredTokenOwners;
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
        IERC20 apeCoin
    ) {
        ADDRESSES_PROVIDER = provider;
        APE_COMPOUND = apeCompound;
        APE_COIN = apeCoin;
        SWAP_ROUTER = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
        uint256 allowance = APE_COIN.allowance(
            address(this),
            address(SWAP_ROUTER)
        );
        if (allowance == 0) {
            APE_COIN.safeApprove(address(SWAP_ROUTER), type(uint256).max);
        }
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

        LocalVar memory vars = _cache(ps, nftAsset);
        uint256[] memory transferredTokenIds = new uint256[](_nftPairs.length);
        address[] memory transferredTokenOwners = new address[](
            _nftPairs.length
        );
        uint256 actualTransferAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(vars.xTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            //only partially withdraw need user's BAKC
            if (!_nftPairs[index].isUncommit) {
                transferredTokenOwners[
                    actualTransferAmount
                ] = _validateBAKCOwnerAndTransfer(
                    vars,
                    _nftPairs[index].bakcTokenId,
                    msg.sender
                );
                transferredTokenIds[actualTransferAmount] = _nftPairs[index]
                    .bakcTokenId;
                actualTransferAmount++;
            }
        }
        INTokenApeStaking(vars.xTokenAddress).withdrawBAKC(
            _nftPairs,
            msg.sender
        );

        ////transfer BAKC back for user
        for (uint256 index = 0; index < actualTransferAmount; index++) {
            vars.bakcContract.safeTransferFrom(
                vars.xTokenAddress,
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

        LocalVar memory vars = _cache(ps, nftAsset);
        address[] memory transferredTokenOwners = new address[](
            _nftPairs.length
        );
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(vars.xTokenAddress).ownerOf(
                    _nftPairs[index].mainTokenId
                ) == msg.sender,
                Errors.NOT_THE_OWNER
            );

            transferredTokenOwners[index] = _validateBAKCOwnerAndTransfer(
                vars,
                _nftPairs[index].bakcTokenId,
                msg.sender
            );
        }

        INTokenApeStaking(vars.xTokenAddress).claimBAKC(_nftPairs, msg.sender);

        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            vars.bakcContract.safeTransferFrom(
                vars.xTokenAddress,
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

        LocalVar memory localVar = _cache(ps, stakingInfo.nftAsset);
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
        uint256[][] calldata tokenIds,
        CompoundOption[] calldata options
    ) external nonReentrant {
        require(
            users.length == tokenIds.length &&
                tokenIds.length == options.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.PoolStorage storage ps = poolStorage();
        checkSApeIsNotPaused(ps);

        LocalVar memory vars;
        vars.xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        vars.balanceBefore = APE_COIN.balanceOf(address(this));
        vars.amounts = new uint256[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            for (uint256 j = 0; j < tokenIds[i].length; j++) {
                address positionOwner = INToken(vars.xTokenAddress).ownerOf(
                    tokenIds[i][j]
                );
                require(users[i] == positionOwner, Errors.NOT_THE_OWNER);
            }

            INTokenApeStaking(vars.xTokenAddress).claimApeCoin(
                tokenIds[i],
                address(this)
            );

            uint256 balanceAfter = APE_COIN.balanceOf(address(this));
            unchecked {
                vars.amounts[i] = balanceAfter - vars.balanceBefore;
                vars.balanceBefore = balanceAfter;
                vars.totalAmount += vars.amounts[i];
                if (
                    options[i].ty == CompoundType.SwapAndSupply &&
                    options[i].swapPercent != 0
                ) {
                    vars.totalSwapAmount += vars.amounts[i].percentMul(
                        options[i].swapPercent
                    );
                }
            }
        }

        _compoundForUsers(ps, vars, users, options);
    }

    function _cache(DataTypes.PoolStorage storage ps, address nftAsset)
        internal
        view
        returns (LocalVar memory vars)
    {
        vars.xTokenAddress = ps._reserves[nftAsset].xTokenAddress;
        vars.bakcContract = INTokenApeStaking(vars.xTokenAddress).getBAKC();
        vars.bakcNToken = ps
            ._reserves[address(vars.bakcContract)]
            .xTokenAddress;
    }

    /// @inheritdoc IPoolApeStaking
    function claimPairedApeAndCompound(
        address nftAsset,
        address[] calldata users,
        ApeCoinStaking.PairNft[][] calldata _nftPairs,
        CompoundOption[] calldata options
    ) external nonReentrant {
        require(
            users.length == _nftPairs.length &&
                _nftPairs.length == options.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        DataTypes.PoolStorage storage ps = poolStorage();

        LocalVar memory localVar = _cache(ps, nftAsset);
        localVar.balanceBefore = APE_COIN.balanceOf(address(this));
        localVar.amounts = new uint256[](_nftPairs.length);

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
            if (
                options[i].ty == CompoundType.SwapAndSupply &&
                options[i].swapPercent != 0
            ) {
                localVar.totalSwapAmount += localVar.amounts[i].percentMul(
                    options[i].swapPercent
                );
            }
        }

        _compoundForUsers(ps, localVar, users, options);
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
        LocalVar memory vars
    ) internal returns (uint256 compoundFee) {
        uint256 totalDepositAmount = vars.totalAmount - vars.totalSwapAmount;
        APE_COMPOUND.deposit(address(this), totalDepositAmount);
        compoundFee = ps._apeCompoundFee;
        uint256 cApeFee = totalDepositAmount.percentMul(compoundFee);
        uint256 apeFee = vars.totalSwapAmount.percentMul(compoundFee);
        if (cApeFee > 0) {
            IERC20(address(APE_COMPOUND)).safeTransfer(msg.sender, cApeFee);
        }
        if (apeFee > 0) {
            IERC20(address(APE_COIN)).safeTransfer(msg.sender, apeFee);
        }
    }

    function _compoundForUsers(
        DataTypes.PoolStorage storage ps,
        LocalVar memory vars,
        address[] calldata users,
        CompoundOption[] calldata options
    ) internal {
        uint256 compoundFee = _depositApeAndPayFees(ps, vars);

        for (uint256 index = 0; index < users.length; index++) {
            uint256 amount = vars.amounts[index].percentMul(
                PercentageMath.PERCENTAGE_FACTOR - compoundFee
            );
            if (amount == 0) {
                continue;
            }
            if (options[index].ty == CompoundType.RepayAndSupply) {
                _supplyForUser(
                    ps,
                    address(APE_COMPOUND),
                    address(this),
                    users[index],
                    amount,
                    true
                );
            } else if (
                options[index].ty == CompoundType.Supply ||
                options[index].swapPercent == 0
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
                uint256 supplyAmount = amount.percentMul(
                    PercentageMath.PERCENTAGE_FACTOR -
                        options[index].swapPercent
                );
                uint256 swapAmount = amount - supplyAmount;
                if (supplyAmount > 0) {
                    _supplyForUser(
                        ps,
                        address(APE_COMPOUND),
                        address(this),
                        users[index],
                        supplyAmount,
                        false
                    );
                }
                if (swapAmount > 0) {
                    _swapApeForUser(
                        options[index].swapPath,
                        users[index],
                        swapAmount
                    );
                }
            }
        }
    }

    function _swapApeForUser(
        bytes calldata path,
        address onBehalf,
        uint256 amount
    ) internal returns (uint256 amountOut) {
        return
            SWAP_ROUTER.exactInput(
                ISwapRouter.ExactInputParams({
                    path: path,
                    recipient: onBehalf,
                    deadline: block.timestamp, // FIXME
                    amountIn: amount,
                    amountOutMinimum: 0 // FIXME
                })
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
        if (repay) {
            amount -= _repayForUser(ps, asset, payer, onBehalfOf, amount);
        }
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
        LocalVar memory vars,
        uint256 tokenId,
        address userAddress
    ) internal returns (address bakcOwner) {
        bakcOwner = vars.bakcContract.ownerOf(tokenId);
        address nBAKCOwner;
        if (vars.bakcNToken != address(0)) {
            nBAKCOwner = INToken(vars.bakcNToken).ownerOf(tokenId);
        }
        require(
            (userAddress == bakcOwner) || (userAddress == nBAKCOwner),
            Errors.NOT_THE_BAKC_OWNER
        );
        vars.bakcContract.safeTransferFrom(
            bakcOwner,
            vars.xTokenAddress,
            tokenId
        );
    }
}
