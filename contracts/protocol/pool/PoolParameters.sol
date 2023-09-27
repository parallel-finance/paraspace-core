// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.10;

import {ParaVersionedInitializable} from "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";
import {PoolLogic} from "../libraries/logic/PoolLogic.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {SupplyLogic} from "../libraries/logic/SupplyLogic.sol";
import {MarketplaceLogic} from "../libraries/logic/MarketplaceLogic.sol";
import {BorrowLogic} from "../libraries/logic/BorrowLogic.sol";
import {LiquidationLogic} from "../libraries/logic/LiquidationLogic.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IERC20WithPermit} from "../../interfaces/IERC20WithPermit.sol";
import {IERC20Detailed} from "../../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPoolParameters} from "../../interfaces/IPoolParameters.sol";
import {IAutoCompoundApe} from "../../interfaces/IAutoCompoundApe.sol";
import {IWstETH} from "../../interfaces/IWstETH.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {ISwapRouter} from "../../dependencies/uniswapv3-periphery/interfaces/ISwapRouter.sol";
import {IPriceOracleGetter} from "../../interfaces/IPriceOracleGetter.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {FlashClaimLogic} from "../libraries/logic/FlashClaimLogic.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IERC721Receiver} from "../../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {PercentageMath} from "../libraries/math/PercentageMath.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ParaReentrancyGuard} from "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import {IAuctionableERC721} from "../../interfaces/IAuctionableERC721.sol";
import {IReserveAuctionStrategy} from "../../interfaces/IReserveAuctionStrategy.sol";
import {PercentageMath} from "../libraries/math/PercentageMath.sol";
import "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";

/**
 * @title Pool Parameters contract
 *
 * @notice Main point of interaction with an ParaSpace protocol's market
 * - Users can:
 *   - mintToTreasury
 *   - ...
 * @dev To be covered by a proxy contract, owned by the PoolAddressesProvider of the specific market
 * @dev All admin functions are callable by the PoolConfigurator contract defined also in the
 *   PoolAddressesProvider
 **/
contract PoolParameters is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolParameters
{
    using ReserveLogic for DataTypes.ReserveData;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using WadRayMath for uint256;
    using PercentageMath for uint256;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    uint256 internal constant POOL_REVISION = 200;
    uint256 internal constant MAX_AUCTION_HEALTH_FACTOR = 3e18;
    uint256 internal constant MIN_AUCTION_HEALTH_FACTOR = 1e18;
    using SafeERC20 for IERC20;

    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address internal constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address internal constant APE = 0x4d224452801ACEd8B2F0aebE155379bb5D594381;
    address internal constant cAPE = 0xC5c9fB6223A989208Df27dCEE33fC59ff5c26fFF;
    address internal constant stETH =
        0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
    address internal constant wstETH =
        0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
    address internal constant BLUR = 0x5283D291DBCF85356A21bA090E6db59121208b44;
    address internal constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    // treasury
    // USDC     36332.400416844017842702
    // USDT     25589.910495216331539289
    // WETH     58.789391688101992366
    // APE      7037.045327108643146337
    // DAI      282.197432234440448224
    // cAPE     19559.598786628743644699
    // stETH    5.411339509592198291
    // BLUR     2327.337115360498087797
    // WBTC     0.021642026967485478

    // shortfalls
    // -- 0xbc737139dd8c8d192f4b9aa713ad99036f004007 17    ETH.  28288.1
    // -- 0x10cda82ea4cd56d32c5a5e6dfcaa7af51d2ba350 0.82  WBTC  21223.6
    // -- 0xa5683dda11c1f1f0143471e0741b5be6d4cb9323 12    ETH   19781
    // -- 0x650915fcd9f4d7c186affba606ca5bae1d05f4a5 11.6  ETH   19189.7
    // -- 0x5f27e1a81965c8a91f7ec287f0a62067c173045d 18693 USDT  18686.5
    // -- 0x70a93e4d958bf023bf1e2cb7efcfc935e5b2c29d 11.3  ETH   18596
    // -- 0xe541529b40f00a081fcea9be3e3dc00919e6ce1a 10.6  ETH   17505.5
    // -- 0x0981f0e2b61575ff55074c76a539108bdc354148 0.6   WBTC  15892.3
    // -- 0x7f08a7924d7f09d603cdefa061c3e8914147ead7 8.76  ETH   14420.5
    // -- 0x9caa3c46a0635a1eb79033a22aaa72c82fba9cfe 7.4   ETH   12308.3
    // -- 0x82bbcac5a8b81368a4a96f0265cb40e46020a1e1 2.54  ETH   4176.8
    // -- 0xa38232df0d62f6a36d7761680c9e2106d049bd3d 2.43  ETH   4007.6
    // -- 0xb9a292ca3856b64d1b69503e7a8f78bb03cdc4e5 1.45  ETH   2382.9
    // -- 0xefbd0604d91919dda0a3d64a50e0659de93d417c 303   USDC  301.9
    //
    // 85.08 ETH
    // 1.42  WBTC
    // 18693 USDT
    // 303   USDC
    uint256 internal constant USDC_SHORTFALL = 303100000;
    uint256 internal constant USDT_SHORTFALL = 18693100000;
    uint256 internal constant WBTC_SHORTFALL = 142100000;
    uint256 internal constant WETH_SHORTFALL = 85081000000000000000;
    uint256 internal constant DEFAULT_MAX_SLIPPAGE = 500; // 5%
    uint24 internal constant USDC_WETH_FEE = 500;
    uint24 internal constant WETH_WBTC_FEE = 500;
    uint24 internal constant USDT_USDC_FEE = 100;
    uint24 internal constant APE_WETH_FEE = 3000;
    uint24 internal constant DAI_WETH_FEE = 500;
    uint24 internal constant BLUR_WETH_FEE = 3000;
    uint24 internal constant WSTETH_WETH_FEE = 100;
    ISwapRouter internal constant SWAP_ROUTER =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    /**
     * @dev Only pool configurator can call functions marked by this modifier.
     **/
    modifier onlyPoolConfigurator() {
        _onlyPoolConfigurator();
        _;
    }

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    function _onlyPoolConfigurator() internal view virtual {
        require(
            ADDRESSES_PROVIDER.getPoolConfigurator() == msg.sender,
            Errors.CALLER_NOT_POOL_CONFIGURATOR
        );
    }

    function _onlyPoolAdmin() internal view virtual {
        require(
            IACLManager(ADDRESSES_PROVIDER.getACLManager()).isPoolAdmin(
                msg.sender
            ),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }

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

    /// @inheritdoc IPoolParameters
    function mintToTreasury(
        address[] calldata assets
    ) external virtual override nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();

        PoolLogic.executeMintToTreasury(ps._reserves, assets);
    }

    /// @inheritdoc IPoolParameters
    function fixShortfalls(
        address[] calldata assets
    ) external virtual override nonReentrant onlyPoolAdmin {
        DataTypes.PoolStorage storage ps = poolStorage();

        for (uint256 i = 0; i < assets.length; i++) {
            address assetAddress = assets[i];

            DataTypes.ReserveData storage reserve = ps._reserves[assetAddress];

            DataTypes.ReserveConfigurationMap
                memory reserveConfiguration = reserve.configuration;

            // this cover both inactive reserves and invalid reserves since the flag will be 0 for both
            if (
                !reserveConfiguration.getActive() ||
                reserveConfiguration.getAssetType() != DataTypes.AssetType.ERC20
            ) {
                continue;
            }

            uint256 accruedToTreasury = reserve.accruedToTreasury;

            if (accruedToTreasury != 0) {
                reserve.accruedToTreasury = 0;
                uint256 normalizedIncome = reserve.getNormalizedIncome();
                uint256 amountToMint = accruedToTreasury.rayMul(
                    normalizedIncome
                );
                IPToken(reserve.xTokenAddress).mint(
                    address(this),
                    address(this),
                    amountToMint,
                    normalizedIncome
                );
                SupplyLogic.executeWithdraw(
                    ps._reserves,
                    ps._reservesList,
                    ps._usersConfig[address(this)],
                    DataTypes.ExecuteWithdrawParams({
                        asset: assetAddress,
                        amount: amountToMint,
                        from: address(this),
                        to: address(this),
                        reservesCount: ps._reservesCount,
                        oracle: ADDRESSES_PROVIDER.getPriceOracle(),
                        immediate: true
                    })
                );

                if (assetAddress == cAPE) {
                    IAutoCompoundApe(assetAddress).withdraw(amountToMint);
                    assetAddress = APE;
                }
                if (assetAddress == stETH) {
                    amountToMint = IWstETH(wstETH).wrap(amountToMint);
                    assetAddress = wstETH;
                }

                if (
                    IERC20(assetAddress).allowance(
                        address(this),
                        address(SWAP_ROUTER)
                    ) == 0
                ) {
                    IERC20(assetAddress).safeApprove(
                        address(SWAP_ROUTER),
                        type(uint256).max
                    );
                }

                if (assetAddress == USDC) {
                    _swap(
                        amountToMint - USDC_SHORTFALL,
                        _getSwapPath(USDC, WBTC),
                        ps._reserves[WBTC].xTokenAddress,
                        _getRelativePrice(USDC, WBTC)
                    );
                    IERC20(USDC).safeTransfer(
                        ps._reserves[USDC].xTokenAddress,
                        USDC_SHORTFALL
                    );
                } else if (assetAddress == USDT) {
                    _swap(
                        amountToMint - USDT_SHORTFALL,
                        _getSwapPath(USDT, WETH),
                        ps._reserves[WETH].xTokenAddress,
                        _getRelativePrice(USDT, WETH)
                    );
                    IERC20(USDT).safeTransfer(
                        ps._reserves[USDT].xTokenAddress,
                        USDT_SHORTFALL
                    );
                } else if (assetAddress == WBTC || assetAddress == WETH) {
                    IERC20(assetAddress).safeTransfer(
                        ps._reserves[assetAddress].xTokenAddress,
                        amountToMint
                    );
                } else {
                    _swap(
                        amountToMint,
                        _getSwapPath(assetAddress, WETH),
                        ps._reserves[WETH].xTokenAddress,
                        _getRelativePrice(assetAddress, WETH)
                    );
                }
            }
        }
    }

    function _getRelativePrice(
        address tokenIn,
        address tokenOut
    ) internal view returns (uint256) {
        IPriceOracleGetter oracle = IPriceOracleGetter(
            ADDRESSES_PROVIDER.getPriceOracle()
        );
        uint256 tokenInPrice = oracle.getAssetPrice(tokenIn);
        uint256 tokenOutPrice = oracle.getAssetPrice(tokenOut);

        return
            (
                (tokenInPrice * (10 ** IERC20Detailed(tokenOut).decimals()))
                    .wadDiv(tokenOutPrice * (10 ** IERC20Detailed(tokenIn).decimals()))
            ).percentMul(
                    PercentageMath.PERCENTAGE_FACTOR - DEFAULT_MAX_SLIPPAGE
                );
    }

    function _getSwapPath(
        address tokenIn,
        address tokenOut
    ) internal pure returns (bytes memory) {
        // USDC -> WETH -> WBTC
        if (tokenIn == USDC && tokenOut == WBTC) {
            return
                abi.encodePacked(
                    USDC,
                    USDC_WETH_FEE,
                    WETH,
                    WETH_WBTC_FEE,
                    WBTC
                );
            // USDT -> USDC -> WETH
        } else if (tokenIn == USDT && tokenOut == WETH) {
            return
                abi.encodePacked(
                    USDT,
                    USDT_USDC_FEE,
                    USDC,
                    USDC_WETH_FEE,
                    WETH
                );
            // APE -> WETH, BLUR -> WETH
        } else if ((tokenIn == APE || tokenIn == BLUR) && tokenOut == WETH) {
            return abi.encodePacked(tokenIn, APE_WETH_FEE, tokenOut);
            // USDC -> WETH, DAI -> WETH
        } else if ((tokenIn == USDC || tokenOut == DAI) && tokenOut == WETH) {
            return abi.encodePacked(tokenIn, USDC_WETH_FEE, tokenOut);
            // WSTETH -> WETH
        } else if (tokenIn == wstETH && tokenOut == WETH) {
            return abi.encodePacked(tokenIn, WSTETH_WETH_FEE, tokenOut);
        } else {
            revert("No route available");
        }
    }

    function _swap(
        uint256 amountIn,
        bytes memory swapPath,
        address recipient,
        uint256 price
    ) internal {
        if (amountIn == 0) {
            return;
        }
        SWAP_ROUTER.exactInput(
            ISwapRouter.ExactInputParams({
                path: swapPath,
                recipient: recipient,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountIn.wadMul(price)
            })
        );
    }

    /// @inheritdoc IPoolParameters
    function initReserve(
        address asset,
        address xTokenAddress,
        address variableDebtAddress,
        address interestRateStrategyAddress,
        address auctionStrategyAddress,
        address timeLockStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        DataTypes.PoolStorage storage ps = poolStorage();

        if (
            PoolLogic.executeInitReserve(
                ps._reserves,
                ps._reservesList,
                DataTypes.InitReserveParams({
                    asset: asset,
                    xTokenAddress: xTokenAddress,
                    variableDebtAddress: variableDebtAddress,
                    interestRateStrategyAddress: interestRateStrategyAddress,
                    timeLockStrategyAddress: timeLockStrategyAddress,
                    auctionStrategyAddress: auctionStrategyAddress,
                    reservesCount: ps._reservesCount,
                    maxNumberReserves: ReserveConfiguration.MAX_RESERVES_COUNT
                })
            )
        ) {
            ps._reservesCount++;
        }
    }

    /// @inheritdoc IPoolParameters
    function dropReserve(
        address asset
    ) external virtual override onlyPoolConfigurator {
        DataTypes.PoolStorage storage ps = poolStorage();

        PoolLogic.executeDropReserve(ps._reserves, ps._reservesList, asset);
    }

    /// @inheritdoc IPoolParameters
    function setReserveInterestRateStrategyAddress(
        address asset,
        address rateStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            ps._reserves[asset].id != 0 || ps._reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        ps._reserves[asset].interestRateStrategyAddress = rateStrategyAddress;
    }

    /// @inheritdoc IPoolParameters
    function setReserveTimeLockStrategyAddress(
        address asset,
        address newStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            ps._reserves[asset].id != 0 || ps._reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        ps._reserves[asset].timeLockStrategyAddress = newStrategyAddress;
    }

    /// @inheritdoc IPoolParameters
    function setReserveAuctionStrategyAddress(
        address asset,
        address auctionStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            ps._reserves[asset].id != 0 || ps._reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        ps._reserves[asset].auctionStrategyAddress = auctionStrategyAddress;
    }

    /// @inheritdoc IPoolParameters
    function setConfiguration(
        address asset,
        DataTypes.ReserveConfigurationMap calldata configuration
    ) external virtual override onlyPoolConfigurator {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            ps._reserves[asset].id != 0 || ps._reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        ps._reserves[asset].configuration = configuration;
    }

    /// @inheritdoc IPoolParameters
    function rescueTokens(
        DataTypes.AssetType assetType,
        address token,
        address to,
        uint256 amountOrTokenId
    ) external virtual override onlyPoolAdmin {
        PoolLogic.executeRescueTokens(assetType, token, to, amountOrTokenId);
    }

    /// @inheritdoc IPoolParameters
    function unlimitedApproveTo(
        address token,
        address to
    ) external virtual override onlyPoolAdmin {
        if (IERC20(token).allowance(address(this), to) == 0) {
            IERC20(token).safeApprove(to, type(uint256).max);
        }
    }

    /// @inheritdoc IPoolParameters
    function revokeUnlimitedApprove(
        address token,
        address to
    ) external virtual override onlyPoolAdmin {
        IERC20(token).approve(to, 0);
    }

    /// @inheritdoc IPoolParameters
    function setClaimApeForCompoundFee(uint256 fee) external onlyPoolAdmin {
        require(fee < PercentageMath.HALF_PERCENTAGE_FACTOR, "Value Too High");
        DataTypes.PoolStorage storage ps = poolStorage();
        uint256 oldValue = ps._apeCompoundFee;
        if (oldValue != fee) {
            ps._apeCompoundFee = uint16(fee);
            emit ClaimApeForYieldIncentiveUpdated(oldValue, fee);
        }
    }

    /// @inheritdoc IPoolParameters
    function setApeCompoundStrategy(
        DataTypes.ApeCompoundStrategy calldata strategy
    ) external {
        require(
            strategy.swapPercent == 0 ||
                (strategy.ty == DataTypes.ApeCompoundType.SwapAndSupply &&
                    strategy.swapPercent > 0 &&
                    strategy.swapPercent <= PercentageMath.PERCENTAGE_FACTOR),
            "Invalid swap percent"
        );
        DataTypes.PoolStorage storage ps = poolStorage();
        ps._apeCompoundStrategies[msg.sender] = strategy;
    }

    /// @inheritdoc IPoolParameters
    function getUserApeCompoundStrategy(
        address user
    ) external view returns (DataTypes.ApeCompoundStrategy memory strategy) {
        DataTypes.PoolStorage storage ps = poolStorage();
        strategy = ps._apeCompoundStrategies[user];
    }

    /// @inheritdoc IPoolParameters
    function setAuctionRecoveryHealthFactor(
        uint64 value
    ) external virtual override onlyPoolConfigurator {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(value != 0, Errors.INVALID_AMOUNT);

        require(
            value > MIN_AUCTION_HEALTH_FACTOR &&
                value <= MAX_AUCTION_HEALTH_FACTOR,
            Errors.INVALID_AMOUNT
        );

        ps._auctionRecoveryHealthFactor = value;
    }

    /// @inheritdoc IPoolParameters
    function getUserAccountData(
        address user
    )
        external
        view
        virtual
        override
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor,
            uint256 erc721HealthFactor
        )
    {
        DataTypes.PoolStorage storage ps = poolStorage();

        return
            PoolLogic.executeGetUserAccountData(
                user,
                ps,
                ADDRESSES_PROVIDER.getPriceOracle()
            );
    }

    function getAssetLtvAndLT(
        address asset,
        uint256 tokenId
    ) external view virtual override returns (uint256 ltv, uint256 lt) {
        DataTypes.PoolStorage storage ps = poolStorage();
        return PoolLogic.executeGetAssetLtvAndLT(ps, asset, tokenId);
    }

    /// @inheritdoc IPoolParameters
    function setAuctionValidityTime(
        address user
    ) external virtual override nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();

        require(user != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            user
        ];
        (, , , , , , uint256 erc721HealthFactor) = PoolLogic
            .executeGetUserAccountData(
                user,
                ps,
                ADDRESSES_PROVIDER.getPriceOracle()
            );
        require(
            erc721HealthFactor >= ps._auctionRecoveryHealthFactor,
            Errors.ERC721_HEALTH_FACTOR_NOT_ABOVE_THRESHOLD
        );
        userConfig.auctionValidityTime = block.timestamp;
    }
}
