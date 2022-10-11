// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {VersionedInitializable} from "../libraries/paraspace-upgradeability/VersionedInitializable.sol";
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
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPoolParameters} from "../../interfaces/IPoolParameters.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {PoolStorage} from "./PoolStorage.sol";
import {FlashClaimLogic} from "../libraries/logic/FlashClaimLogic.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {IERC721Receiver} from "../../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {ReentrancyGuard} from "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import {IAuctionableERC721} from "../../interfaces/IAuctionableERC721.sol";
import {IReserveAuctionStrategy} from "../../interfaces/IReserveAuctionStrategy.sol";

/**
 * @title Pool Parameters contract
 *
 * @notice Main point of interaction with an ParaSpace protocol's market
 * - Users can:
 *   - mintToTreasury
 *   - setMaxAtomicTokensAllowed
 *   - ...
 * @dev To be covered by a proxy contract, owned by the PoolAddressesProvider of the specific market
 * @dev All admin functions are callable by the PoolConfigurator contract defined also in the
 *   PoolAddressesProvider
 **/
contract PoolParameters is
    VersionedInitializable,
    ReentrancyGuard,
    PoolStorage,
    IPoolParameters
{
    using ReserveLogic for DataTypes.ReserveData;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    uint256 internal constant POOL_REVISION = 1;

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
    function mintToTreasury(address[] calldata assets)
        external
        virtual
        override
        nonReentrant
    {
        PoolLogic.executeMintToTreasury(_reserves, assets);
    }

    /// @inheritdoc IPoolParameters
    function initReserve(
        address asset,
        address xTokenAddress,
        address stableDebtAddress,
        address variableDebtAddress,
        address interestRateStrategyAddress,
        address auctionStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        if (
            PoolLogic.executeInitReserve(
                _reserves,
                _reservesList,
                DataTypes.InitReserveParams({
                    asset: asset,
                    xTokenAddress: xTokenAddress,
                    stableDebtAddress: stableDebtAddress,
                    variableDebtAddress: variableDebtAddress,
                    interestRateStrategyAddress: interestRateStrategyAddress,
                    auctionStrategyAddress: auctionStrategyAddress,
                    reservesCount: _reservesCount,
                    maxNumberReserves: ReserveConfiguration.MAX_RESERVES_COUNT
                })
            )
        ) {
            _reservesCount++;
        }
    }

    /// @inheritdoc IPoolParameters
    function dropReserve(address asset)
        external
        virtual
        override
        onlyPoolConfigurator
    {
        PoolLogic.executeDropReserve(_reserves, _reservesList, asset);
    }

    /// @inheritdoc IPoolParameters
    function setReserveInterestRateStrategyAddress(
        address asset,
        address rateStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset].interestRateStrategyAddress = rateStrategyAddress;
    }

    /// @inheritdoc IPoolParameters
    function setReserveAuctionStrategyAddress(
        address asset,
        address auctionStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset].auctionStrategyAddress = auctionStrategyAddress;
    }

    /// @inheritdoc IPoolParameters
    function setReserveDynamicConfigsStrategyAddress(
        address asset,
        address dynamicConfigsStrategyAddress
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset]
            .dynamicConfigsStrategyAddress = dynamicConfigsStrategyAddress;
    }

    /// @inheritdoc IPoolParameters
    function setConfiguration(
        address asset,
        DataTypes.ReserveConfigurationMap calldata configuration
    ) external virtual override onlyPoolConfigurator {
        require(asset != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        require(
            _reserves[asset].id != 0 || _reservesList[0] == asset,
            Errors.ASSET_NOT_LISTED
        );
        _reserves[asset].configuration = configuration;
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
    function increaseUserTotalAtomicTokens(
        address asset,
        address user,
        uint24 changeBy
    ) external virtual override {
        require(
            msg.sender == _reserves[asset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );
        uint24 newUserAtomicTokens = _usersConfig[user].userAtomicTokens +
            changeBy;

        require(newUserAtomicTokens <= _maxAtomicTokensAllowed);

        _usersConfig[user].userAtomicTokens = newUserAtomicTokens;
    }

    /// @inheritdoc IPoolParameters
    function decreaseUserTotalAtomicTokens(
        address asset,
        address user,
        uint24 changeBy
    ) external virtual override {
        require(
            msg.sender == _reserves[asset].xTokenAddress,
            Errors.CALLER_NOT_XTOKEN
        );

        _usersConfig[user].userAtomicTokens -= changeBy;
    }

    /// @inheritdoc IPoolParameters
    function setMaxAtomicTokensAllowed(uint24 value)
        external
        virtual
        override
        onlyPoolConfigurator
    {
        require(value != 0, Errors.INVALID_AMOUNT);

        _maxAtomicTokensAllowed = value;
    }

    /// @inheritdoc IPoolParameters
    function setAuctionRecoveryHealthFactor(uint64 value)
        external
        virtual
        override
        onlyPoolConfigurator
    {
        require(value != 0, Errors.INVALID_AMOUNT);

        _auctionRecoveryHealthFactor = value;
    }
}
