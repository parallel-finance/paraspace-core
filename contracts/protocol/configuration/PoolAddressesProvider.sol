// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {Ownable} from "../../dependencies/openzeppelin/contracts/Ownable.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IParaProxy} from "../../interfaces/IParaProxy.sol";
import {InitializableImmutableAdminUpgradeabilityProxy} from "../libraries/paraspace-upgradeability/InitializableImmutableAdminUpgradeabilityProxy.sol";
import {ParaProxy} from "../libraries/paraspace-upgradeability/ParaProxy.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";

/**
 * @title PoolAddressesProvider
 *
 * @notice Main registry of addresses part of or connected to the protocol, including permissioned roles
 * @dev Acts as factory of proxies and admin of those, so with right to change its implementations
 * @dev Owned by the ParaSpace Governance
 **/
contract PoolAddressesProvider is Ownable, IPoolAddressesProvider {
    // Identifier of the ParaSpace Market
    string private _marketId;

    // Map of registered addresses (identifier => registeredAddress)
    mapping(bytes32 => address) private _addresses;

    // Map of marketplace contracts (id => address)
    mapping(bytes32 => DataTypes.Marketplace) internal _marketplaces;

    // Main identifiers
    bytes32 private constant POOL = "POOL";
    bytes32 private constant POOL_CONFIGURATOR = "POOL_CONFIGURATOR";
    bytes32 private constant PRICE_ORACLE = "PRICE_ORACLE";
    bytes32 private constant ACL_MANAGER = "ACL_MANAGER";
    bytes32 private constant ACL_ADMIN = "ACL_ADMIN";
    bytes32 private constant PRICE_ORACLE_SENTINEL = "PRICE_ORACLE_SENTINEL";
    bytes32 private constant DATA_PROVIDER = "DATA_PROVIDER";
    bytes32 private constant WETH = "WETH";

    /**
     * @dev Constructor.
     * @param marketId The identifier of the market.
     * @param owner The owner address of this contract.
     */
    constructor(string memory marketId, address owner) {
        _setMarketId(marketId);
        transferOwnership(owner);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getMarketId() external view override returns (string memory) {
        return _marketId;
    }

    /// @inheritdoc IPoolAddressesProvider
    function setMarketId(string memory newMarketId)
        external
        override
        onlyOwner
    {
        _setMarketId(newMarketId);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getAddress(bytes32 id) public view override returns (address) {
        return _addresses[id];
    }

    /// @inheritdoc IPoolAddressesProvider
    function setAddress(bytes32 id, address newAddress)
        external
        override
        onlyOwner
    {
        address oldAddress = _addresses[id];
        _addresses[id] = newAddress;
        emit AddressSet(id, oldAddress, newAddress);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setAddressAsProxy(bytes32 id, address newImplementationAddress)
        external
        override
        onlyOwner
    {
        require(id != POOL, Errors.INVALID_ADDRESSES_PROVIDER_ID);

        address proxyAddress = _addresses[id];
        address oldImplementationAddress = _getProxyImplementation(id);
        _updateImpl(id, newImplementationAddress);
        emit AddressSetAsProxy(
            id,
            proxyAddress,
            oldImplementationAddress,
            newImplementationAddress
        );
    }

    /// @inheritdoc IPoolAddressesProvider
    function getPool() external view override returns (address) {
        return getAddress(POOL);
    }

    /// @inheritdoc IPoolAddressesProvider
    function updatePoolImpl(
        IParaProxy.ProxyImplementation[] calldata implementationParams,
        address _init,
        bytes calldata _calldata
    ) external override onlyOwner {
        _updateParaProxyImpl(POOL, implementationParams, _init, _calldata);

        emit PoolUpdated(implementationParams, _init, _calldata);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getPoolConfigurator() external view override returns (address) {
        return getAddress(POOL_CONFIGURATOR);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setPoolConfiguratorImpl(address newPoolConfiguratorImpl)
        external
        override
        onlyOwner
    {
        address oldPoolConfiguratorImpl = _getProxyImplementation(
            POOL_CONFIGURATOR
        );
        _updateImpl(POOL_CONFIGURATOR, newPoolConfiguratorImpl);
        emit PoolConfiguratorUpdated(
            oldPoolConfiguratorImpl,
            newPoolConfiguratorImpl
        );
    }

    /// @inheritdoc IPoolAddressesProvider
    function getPriceOracle() external view override returns (address) {
        return getAddress(PRICE_ORACLE);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setPriceOracle(address newPriceOracle)
        external
        override
        onlyOwner
    {
        address oldPriceOracle = _addresses[PRICE_ORACLE];
        _addresses[PRICE_ORACLE] = newPriceOracle;
        emit PriceOracleUpdated(oldPriceOracle, newPriceOracle);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getACLManager() external view override returns (address) {
        return getAddress(ACL_MANAGER);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setACLManager(address newAclManager) external override onlyOwner {
        address oldAclManager = _addresses[ACL_MANAGER];
        _addresses[ACL_MANAGER] = newAclManager;
        emit ACLManagerUpdated(oldAclManager, newAclManager);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getACLAdmin() external view override returns (address) {
        return getAddress(ACL_ADMIN);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setACLAdmin(address newAclAdmin) external override onlyOwner {
        address oldAclAdmin = _addresses[ACL_ADMIN];
        _addresses[ACL_ADMIN] = newAclAdmin;
        emit ACLAdminUpdated(oldAclAdmin, newAclAdmin);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getPriceOracleSentinel() external view override returns (address) {
        return getAddress(PRICE_ORACLE_SENTINEL);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setPriceOracleSentinel(address newPriceOracleSentinel)
        external
        override
        onlyOwner
    {
        address oldPriceOracleSentinel = _addresses[PRICE_ORACLE_SENTINEL];
        _addresses[PRICE_ORACLE_SENTINEL] = newPriceOracleSentinel;
        emit PriceOracleSentinelUpdated(
            oldPriceOracleSentinel,
            newPriceOracleSentinel
        );
    }

    /// @inheritdoc IPoolAddressesProvider
    function getPoolDataProvider() external view override returns (address) {
        return getAddress(DATA_PROVIDER);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getWETH() external view override returns (address) {
        return getAddress(WETH);
    }

    /// @inheritdoc IPoolAddressesProvider
    function getMarketplace(bytes32 id)
        external
        view
        override
        returns (DataTypes.Marketplace memory)
    {
        DataTypes.Marketplace memory marketplace = _marketplaces[id];
        if (
            marketplace.marketplace != address(0) &&
            Address.isContract(marketplace.marketplace)
        ) {
            return marketplace;
        } else {
            revert(Errors.INVALID_MARKETPLACE_ID);
        }
    }

    /// @inheritdoc IPoolAddressesProvider
    function setPoolDataProvider(address newDataProvider)
        external
        override
        onlyOwner
    {
        address oldDataProvider = _addresses[DATA_PROVIDER];
        _addresses[DATA_PROVIDER] = newDataProvider;
        emit PoolDataProviderUpdated(oldDataProvider, newDataProvider);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setWETH(address newWETH) external override onlyOwner {
        address oldWETH = _addresses[WETH];
        _addresses[WETH] = newWETH;
        emit WETHUpdated(oldWETH, newWETH);
    }

    /// @inheritdoc IPoolAddressesProvider
    function setMarketplace(
        bytes32 id,
        address marketplace,
        address adapter,
        address operator,
        bool paused
    ) external override onlyOwner {
        _marketplaces[id] = DataTypes.Marketplace(
            marketplace,
            adapter,
            operator,
            paused
        );
        emit MarketplaceUpdated(id, marketplace, adapter, operator, paused);
    }

    /**
     * @notice Internal function to update the implementation of a specific proxied component of the protocol.
     * @dev If there is no proxy registered with the given identifier, it creates the proxy setting `newAddress`
     *   as implementation and calls the initialize() function on the proxy
     * @dev If there is already a proxy registered, it just updates the implementation to `newAddress` and
     *   calls the initialize() function via upgradeToAndCall() in the proxy
     * @param id The id of the proxy to be updated
     * @param newAddress The address of the new implementation
     **/
    function _updateImpl(bytes32 id, address newAddress) internal {
        address proxyAddress = _addresses[id];
        InitializableImmutableAdminUpgradeabilityProxy proxy;
        bytes memory params = abi.encodeWithSignature(
            "initialize(address)",
            address(this)
        );

        if (proxyAddress == address(0)) {
            proxy = new InitializableImmutableAdminUpgradeabilityProxy(
                address(this)
            );
            _addresses[id] = proxyAddress = address(proxy);
            proxy.initialize(newAddress, params);
            emit ProxyCreated(id, proxyAddress, newAddress);
        } else {
            proxy = InitializableImmutableAdminUpgradeabilityProxy(
                payable(proxyAddress)
            );
            proxy.upgradeToAndCall(newAddress, params);
        }
    }

    /**
     * @notice Internal function to update the implementation of a specific proxied component of the protocol that uses ParaProxy.
     * @dev If there is no proxy registered with the given identifier, it creates the proxy setting `newAddress`
     *   as implementation and calls the calldata on the _init
     * @dev If there is already a proxy registered, it just updates the implementation using the implementationParams
     * @param id The id of the proxy to be updated
     * @param implementationParams Contains the implementation addresses and function selectors
     * @param _init The address of the contract or implementation to execute _calldata
     * @param _calldata A function call, including function selector and arguments
     *                  _calldata is executed with delegatecall on _init
     **/
    function _updateParaProxyImpl(
        bytes32 id,
        IParaProxy.ProxyImplementation[] calldata implementationParams,
        address _init,
        bytes calldata _calldata
    ) internal {
        address proxyAddress = _addresses[id];

        IParaProxy proxy;

        if (proxyAddress == address(0)) {
            proxy = IParaProxy(address(new ParaProxy(address(this))));

            _addresses[id] = proxyAddress = address(proxy);
            proxy.updateImplementation(implementationParams, _init, _calldata);
            emit ParaProxyCreated(id, proxyAddress, implementationParams);
        } else {
            proxy = IParaProxy(payable(proxyAddress));

            proxy.updateImplementation(implementationParams, _init, _calldata);
            emit ParaProxyUpdated(id, proxyAddress, implementationParams);
        }
    }

    /**
     * @notice Updates the identifier of the ParaSpace market.
     * @param newMarketId The new id of the market
     **/
    function _setMarketId(string memory newMarketId) internal {
        string memory oldMarketId = _marketId;
        _marketId = newMarketId;
        emit MarketIdSet(oldMarketId, newMarketId);
    }

    /**
     * @notice Returns the the implementation contract of the proxy contract by its identifier.
     * @dev It returns ZERO if there is no registered address with the given id
     * @dev It reverts if the registered address with the given id is not `InitializableImmutableAdminUpgradeabilityProxy`
     * @param id The id
     * @return The address of the implementation contract
     */
    function _getProxyImplementation(bytes32 id) internal returns (address) {
        address proxyAddress = _addresses[id];
        if (proxyAddress == address(0)) {
            return address(0);
        } else {
            address payable payableProxyAddress = payable(proxyAddress);
            return
                InitializableImmutableAdminUpgradeabilityProxy(
                    payableProxyAddress
                ).implementation();
        }
    }
}
