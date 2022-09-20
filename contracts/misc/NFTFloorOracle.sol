// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../dependencies/openzeppelin/contracts/AccessControl.sol";
import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "./interfaces/INFTFloorOracle.sol";

//maxSubmissions by default we keep 3 submission at most for each feeder
uint8 constant Default_MaxSubmissions = 3;
//minCountToAggregate to aggregate with,at least the number of feeders
//assume we deploy 3 oracle clients here
uint8 constant Default_MinCountToAggregate = 3;
//expirationPeriod at least the interval of client to feed data(currently 6h=21600s in mainnet)
//we do not accept price lags behind to much
uint64 constant Default_ExpirationPeriod = 21600;
//reject when price increase/decrease 10 times more than original value
uint128 constant Default_MaxPriceDeviation = 10;

struct OracleConfig {
    // Max submissions for each feeder
    uint8 maxSubmissions;
    // Min count to aggregate price with
    uint8 minCountToAggregate;
    // Expiration Period for each feed price
    uint64 expirationPeriod;
    // Maximum deviation allowed between two consecutive oracle prices
    uint128 maxPriceDeviation;
}

struct PriceInformation {
    /// @dev last reported floor price
    uint128 twap;
    uint64 lastUpdateTime;
}

struct PricePriceInformationBuffer {
    /// @dev next index in ring buffer
    uint8 next;
    /// @dev last reported floor price
    PriceInformation[Default_MaxSubmissions] ring;
}

struct FeederRegistrar {
    // if asset not registered,reject the price
    bool registered;
    // index in asset list
    uint8 index;
    // if asset paused,reject the price
    bool paused;
    // feeder -> PricePriceInformationBuffer
    mapping(address => PricePriceInformationBuffer) feederBuffer;
}

/// @title A simple on-chain price oracle mechanism
/// @author github.com/drbh,github.com/yrong
/// @notice Offchain clients can update the prices in this contract. The public can read prices
/// aggeregate prices which are not expired from different feeders, if number of valid/unexpired prices
/// not enough, we do not aggeregate and just use previous price
contract NFTFloorOracle is Initializable, AccessControl, INFTFloorOracle {
    event AssetAdded(address indexed asset);
    event AssetRemoved(address indexed asset);
    event SetAssetData(address indexed asset, uint128 price, uint64 timestamp);
    event OracleNodesSet(address[] indexed nodes);
    event OracleConfigSet(
        uint8 maxSubmissions,
        uint8 minCountToAggregate,
        uint64 expirationPeriod,
        uint128 maxPriceDeviation
    );
    event OracleNftPaused(address indexed asset, bool paused);

    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    /// @dev Aggregated price with address
    // the NFT contract -> price information
    mapping(address => PriceInformation) internal priceMap;

    /// @dev All valid feeders
    address[] internal feeders;

    /// @dev All asset list
    address[] internal nfts;

    /// @dev Original raw value to aggregate with
    // contract address -> FeederRegistrar
    mapping(address => FeederRegistrar) internal priceFeederMap;

    /// @dev storage for oracle configurations
    OracleConfig internal config;

    modifier whenNotPaused(address _nftContract) {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            _whenNotPaused(_nftContract);
        }
        _;
    }

    function _whenNotPaused(address _nftContract) internal view {
        bool _paused = priceFeederMap[_nftContract].paused;
        require(!_paused, "NFTOracle: nft price feed paused");
    }

    function setPause(address _nftContract, bool val)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        priceFeederMap[_nftContract].paused = val;
        emit OracleNftPaused(_nftContract, val);
    }

    modifier onlyWhenKeyExisted(address _nftContract) {
        require(isExistedKey(_nftContract), "NFTOracle: asset not existed");
        _;
    }

    modifier onlyWhenKeyNotExisted(address _nftContract) {
        require(!isExistedKey(_nftContract), "NFTOracle: asset existed");
        _;
    }

    function isExistedKey(address _nftContract) private view returns (bool) {
        return priceFeederMap[_nftContract].registered;
    }

    function _addAsset(address _nftContract)
        internal
        onlyWhenKeyNotExisted(_nftContract)
    {
        priceFeederMap[_nftContract].registered = true;
        nfts.push(_nftContract);
        priceFeederMap[_nftContract].index = uint8(nfts.length - 1);
        emit AssetAdded(_nftContract);
    }

    function _removeAsset(address _nftContract)
        internal
        onlyWhenKeyExisted(_nftContract)
    {
        delete priceMap[_nftContract];
        if (nfts[priceFeederMap[_nftContract].index] == _nftContract) {
            delete nfts[priceFeederMap[_nftContract].index];
        }
        delete priceFeederMap[_nftContract];
        emit AssetRemoved(_nftContract);
    }

    function addAssets(address[] calldata _nftContracts)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < _nftContracts.length; i++) {
            _addAsset(_nftContracts[i]);
        }
    }

    function removeAsset(address _nftContract)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        onlyWhenKeyExisted(_nftContract)
    {
        _removeAsset(_nftContract);
    }

    /// @notice set nft assets.
    /// @param assets assets to set
    function _setAssets(address[] memory assets) internal {
        for (uint256 i = 0; i < assets.length; i++) {
            _addAsset(assets[i]);
        }
    }

    /// @notice Allow contract creator to set admin and first updater
    /// @param admin The admin who can change roles
    /// @param updaters The initial updaters
    /// @param assets The initial nft assets
    function initialize(
        address admin,
        address[] memory updaters,
        address[] memory assets
    ) public initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(UPDATER_ROLE, admin);
        _setAssets(assets);
        _setOracles(updaters);
        _setConfig(
            Default_MinCountToAggregate,
            Default_ExpirationPeriod,
            Default_MaxPriceDeviation
        );
    }

    /// @notice set oracle configs
    /// @param expirationPeriod only prices not expired will be aggregated with
    /// @param minCountToAggregate the minimum number of valid price to aggregate with
    /// @param maxPriceDeviation use to reject when price increase/decrease more than this value
    function _setConfig(
        uint8 minCountToAggregate,
        uint64 expirationPeriod,
        uint128 maxPriceDeviation
    ) internal {
        // since we use ring buffer, to keep it simple not allow to change maxSubmissions here
        // or need extra steps to reallocate storage
        config.maxSubmissions = Default_MaxSubmissions;
        config.minCountToAggregate = minCountToAggregate;
        config.expirationPeriod = expirationPeriod;
        config.maxPriceDeviation = maxPriceDeviation;
        emit OracleConfigSet(
            Default_MaxSubmissions,
            minCountToAggregate,
            expirationPeriod,
            maxPriceDeviation
        );
    }

    /// @notice set oracles.
    /// @param nodes feeders to set
    function _setOracles(address[] memory nodes) internal {
        for (uint256 i = 0; i < feeders.length; i++) {
            revokeRole(UPDATER_ROLE, feeders[i]);
        }
        for (uint256 i = 0; i < nodes.length; i++) {
            _setupRole(UPDATER_ROLE, nodes[i]);
        }
        feeders = nodes;
        emit OracleNodesSet(nodes);
    }

    /// @notice Allows owner to change oracles.
    /// @param nodes feeders to set
    function setOracles(address[] calldata nodes)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setOracles(nodes);
    }

    /// @notice Allows owner to update oracle configs
    function setConfig(
        uint8 minCountToAggregate,
        uint64 expirationPeriod,
        uint128 maxPriceDeviation
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setConfig(minCountToAggregate, expirationPeriod, maxPriceDeviation);
    }

    function checkValidityOfPrice(address _nftContract, uint128 _price)
        private
        view
        returns (bool)
    {
        require(_price > 0, "NFTOracle: price can not be 0");
        PriceInformation memory priceMapEntry = priceMap[_nftContract];
        uint128 price = priceMapEntry.twap;
        uint64 timestamp = priceMapEntry.lastUpdateTime;
        uint256 percentDeviation;
        //first price is always valid
        if (price == 0 || timestamp == 0) {
            return true;
        }
        if (_price > price) {
            percentDeviation = _price / price;
        } else {
            percentDeviation = price / _price;
        }
        if (percentDeviation >= config.maxPriceDeviation) {
            return false;
        }
        return true;
    }

    /// @notice Allows updater to set new price on PriceInformation and updates the
    /// internal TWAP cumulativePrice.
    /// @param token The nft contracts to set a floor price for
    /// @param twap The last floor twap
    function setPrice(address token, uint128 twap)
        public
        onlyRole(UPDATER_ROLE)
        onlyWhenKeyExisted(token)
        whenNotPaused(token)
    {
        bool dataValidity = false;
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            finalizePrice(token, twap);
            return;
        }
        dataValidity = checkValidityOfPrice(token, twap);
        require(dataValidity, "NFTOracle: invalid price data");
        // add price to raw feeder storage
        addRawValue(token, twap);
        uint128 medianPrice;
        // set twap price only when median value is valid
        (dataValidity, medianPrice) = combine(token, twap);
        if (dataValidity) {
            finalizePrice(token, medianPrice);
        }
    }

    function finalizePrice(address token, uint128 twap) internal {
        PriceInformation storage priceMapEntry = priceMap[token];
        priceMapEntry.twap = twap;
        priceMapEntry.lastUpdateTime = uint64(block.timestamp);
        emit SetAssetData(
            token,
            priceMapEntry.twap,
            priceMapEntry.lastUpdateTime
        );
    }

    function addRawValue(address token, uint128 twap) internal {
        FeederRegistrar storage feederRegistrar = priceFeederMap[token];
        PricePriceInformationBuffer storage priceBuffer = feederRegistrar
            .feederBuffer[msg.sender];
        if (priceBuffer.next >= config.maxSubmissions) {
            priceBuffer.next -= config.maxSubmissions;
        }
        priceBuffer.ring[priceBuffer.next] = PriceInformation({
            twap: twap,
            lastUpdateTime: uint64(block.timestamp)
        });
        priceBuffer.next += 1;
    }

    function combine(address token, uint128 twap)
        internal
        view
        returns (bool, uint128)
    {
        FeederRegistrar storage feederRegistrar = priceFeederMap[token];
        uint64 _timestamp = uint64(block.timestamp);
        //first time just use the feeding value
        if (priceMap[token].twap == 0) {
            return (true, twap);
        }
        //use memory here so allocate with maximum length
        uint128[] memory validPriceList = new uint128[](
            feeders.length * config.maxSubmissions
        );
        uint256 validNum = 0;
        //aggeregate with feed prices from all feeders
        for (uint256 i = 0; i < feeders.length; i++) {
            PricePriceInformationBuffer memory priceBuffer = feederRegistrar
                .feederBuffer[feeders[i]];
            for (uint256 j = 0; j < priceBuffer.ring.length; j++) {
                PriceInformation memory priceInfo = priceBuffer.ring[j];
                if (priceInfo.lastUpdateTime > 0) {
                    uint64 laggingTimestamp = _timestamp -
                        priceInfo.lastUpdateTime;
                    if (laggingTimestamp <= config.expirationPeriod) {
                        //since it is memory array we can not push here
                        validPriceList[validNum] = priceInfo.twap;
                        validNum++;
                    }
                }
            }
            //break earlier if we have enough valid prices
            if (validNum >= config.minCountToAggregate) {
                break;
            }
        }

        // only calculate median value when number of valid data greater than minCountToAggregate
        if (validNum >= config.minCountToAggregate) {
            // ignore sort for saving gas, we just pick fixed element from validPriceList
            // sort(validPriceList, 0, validNum);
            return (true, validPriceList[config.minCountToAggregate / 2]);
        }
        // or use the previous twap instead
        return (false, priceMap[token].twap);
    }

    /// @notice Allows owner to set new price on PriceInformation and updates the
    /// internal TWAP cumulativePrice.
    /// @param tokens The nft contract to set a floor price for
    function setMultiplePrices(
        address[] calldata tokens,
        uint128[] calldata twaps
    ) external onlyRole(UPDATER_ROLE) {
        require(
            tokens.length == twaps.length,
            "Tokens and price length differ"
        );
        for (uint256 i = 0; i < tokens.length; i++) {
            setPrice(tokens[i], twaps[i]);
        }
    }

    /// @param token The nft contract
    /// @return twap The most recent twap on chain
    function getTwap(address token) external view returns (uint128 twap) {
        return priceMap[token].twap;
    }

    /// @param token The nft contract
    /// @return timestamp The timestamp of the last update for an asset
    function getLastUpdateTime(address token)
        external
        view
        returns (uint128 timestamp)
    {
        return priceMap[token].lastUpdateTime;
    }

    function getFeeders() external view returns (address[] memory) {
        return feeders;
    }

    function getFeederPriceList(address token, address feeder)
        external
        view
        returns (PriceInformation[Default_MaxSubmissions] memory)
    {
        FeederRegistrar storage feederRegistrar = priceFeederMap[token];
        PriceInformation[Default_MaxSubmissions]
            memory pricesList = feederRegistrar.feederBuffer[feeder].ring;
        return pricesList;
    }

    function getConfig() external view returns (OracleConfig memory) {
        return config;
    }

    function getAssets() external view returns (address[] memory) {
        return nfts;
    }
}
