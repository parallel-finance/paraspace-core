// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/contracts/AccessControl.sol";
import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "./interfaces/INFTFloorOracle.sol";

//we need to deploy 3 oracles at least
uint8 constant MIN_ORACLES_NUM = 3;
//expirationPeriod at least the interval of client to feed data(currently 6h=21600s/12=1800 in mainnet)
//we do not accept price lags behind to much
uint128 constant EXPIRATION_PERIOD = 1800;
//reject when price increase/decrease 1.5 times more than original value
uint128 constant MAX_DEVIATION_RATE = 150;

struct OracleConfig {
    // Expiration Period for each feed price
    uint128 expirationPeriod;
    // Maximum deviation allowed between two consecutive oracle prices
    uint128 maxPriceDeviation;
}

struct PriceInformation {
    // last reported floor price(offchain twap)
    uint256 twap;
    // last updated blocknumber
    uint256 updatedAt;
    // last updated timestamp
    uint256 updatedTimestamp;
}

struct FeederRegistrar {
    // if asset registered or not
    bool registered;
    // index in asset list
    uint8 index;
    // if asset paused,reject the price
    bool paused;
    // feeder -> PriceInformation
    mapping(address => PriceInformation) feederPrice;
}

struct FeederPosition {
    // if feeder registered or not
    bool registered;
    // index in feeder list
    uint8 index;
}

/// @title A simple on-chain price oracle mechanism
/// @author github.com/drbh,github.com/yrong
/// @notice Offchain clients can update the prices in this contract. The public can read prices
/// aggeregate prices which are not expired from different feeders, if number of valid/unexpired prices
/// not enough, we do not aggeregate and just use previous price
contract NFTFloorOracle is Initializable, AccessControl, INFTFloorOracle {
    event AssetAdded(address indexed asset);
    event AssetRemoved(address indexed asset);
    event AssetPaused(address indexed asset, bool paused);

    event FeederAdded(address indexed feeder);
    event FeederRemoved(address indexed feeder);

    event OracleConfigSet(uint128 expirationPeriod, uint128 maxPriceDeviation);
    event AssetDataSet(
        address indexed asset,
        uint256 twap,
        uint256 lastUpdatedBlock
    );

    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    /// @dev Aggregated price with address
    // the NFT contract -> latest price information
    mapping(address => PriceInformation) public assetPriceMap;

    /// @dev All feeders
    address[] public feeders;

    /// @dev feeder map
    // feeder address -> index in feeder list
    mapping(address => FeederPosition) public feederPositionMap;

    /// @dev All asset list
    address[] public assets;

    /// @dev Original raw value to aggregate with
    // the NFT contract address -> FeederRegistrar which contains price from each feeder
    mapping(address => FeederRegistrar) public assetFeederMap;

    /// @dev storage for oracle configurations
    OracleConfig public config;

    /// @notice Allow contract creator to set admin and updaters
    /// @param _admin The admin who can change roles
    /// @param _feeders The initial updaters
    /// @param _assets The initial nft assets
    function initialize(
        address _admin,
        address[] memory _feeders,
        address[] memory _assets
    ) public initializer {
        _addAssets(_assets);
        _addFeeders(_feeders);
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        //still need to grant update_role to admin for emergency call
        _setupRole(UPDATER_ROLE, _admin);
        _setConfig(EXPIRATION_PERIOD, MAX_DEVIATION_RATE);
    }

    modifier whenNotPaused(address _asset) {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            _whenNotPaused(_asset);
        }
        _;
    }

    modifier onlyWhenAssetExisted(address _asset) {
        require(_isAssetExisted(_asset), "NFTOracle: asset not existed");
        _;
    }

    modifier onlyWhenAssetNotExisted(address _asset) {
        require(!_isAssetExisted(_asset), "NFTOracle: asset existed");
        _;
    }

    modifier onlyWhenFeederExisted(address _feeder) {
        require(_isFeederExisted(_feeder), "NFTOracle: feeder not existed");
        _;
    }

    modifier onlyWhenFeederNotExisted(address _feeder) {
        require(!_isFeederExisted(_feeder), "NFTOracle: feeder existed");
        _;
    }

    /// @notice Allows owner to add assets.
    /// @param _assets assets to add
    function addAssets(address[] calldata _assets)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _addAssets(_assets);
    }

    /// @notice Allows owner to remove asset.
    /// @param _asset asset to remove
    function removeAsset(address _asset)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        onlyWhenAssetExisted(_asset)
    {
        _removeAsset(_asset);
    }

    /// @notice Allows owner to add feeders.
    /// @param _feeders feeders to add
    function addFeeders(address[] calldata _feeders)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _addFeeders(_feeders);
    }

    /// @notice Allows owner to remove feeders.
    /// @param _feeders feeders to remove
    function removeFeeders(address[] calldata _feeders)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < _feeders.length; i++) {
            _removeFeeder(_feeders[i]);
        }
    }

    /// @notice Allows owner to remove feeder.
    /// @param _feeder feeder to remove
    function removeFeeder(address _feeder)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _removeFeeder(_feeder);
    }

    /// @notice Allows owner to update oracle configs
    function setConfig(uint128 expirationPeriod, uint128 maxPriceDeviation)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setConfig(expirationPeriod, maxPriceDeviation);
    }

    /// @notice Allows owner to pause asset
    function setPause(address _asset, bool _flag)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        assetFeederMap[_asset].paused = _flag;
        emit AssetPaused(_asset, _flag);
    }

    /// @notice Allows updater to set new price on PriceInformation and updates the
    /// internal Median cumulativePrice.
    /// @param _asset The nft contract to set a floor price for
    /// @param _twap The last floor twap
    function setPrice(address _asset, uint256 _twap)
        public
        onlyRole(UPDATER_ROLE)
        onlyWhenAssetExisted(_asset)
        whenNotPaused(_asset)
    {
        bool dataValidity = false;
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            _finalizePrice(_asset, _twap);
            return;
        }
        dataValidity = _checkValidity(_asset, _twap);
        require(dataValidity, "NFTOracle: invalid price data");
        // add price to raw feeder storage
        _addRawValue(_asset, _twap);
        uint256 medianPrice;
        // set twap price only when median value is valid
        (dataValidity, medianPrice) = _combine(_asset, _twap);
        if (dataValidity) {
            _finalizePrice(_asset, medianPrice);
        }
    }

    /// @notice Allows owner to set new price on PriceInformation and updates the
    /// internal Median cumulativePrice.
    /// @param _assets The nft contract to set a floor price for
    function setMultiplePrices(
        address[] calldata _assets,
        uint256[] calldata _twaps
    ) external onlyRole(UPDATER_ROLE) {
        require(
            _assets.length == _twaps.length,
            "NFTOracle: Tokens and price length differ"
        );
        for (uint256 i = 0; i < _assets.length; i++) {
            setPrice(_assets[i], _twaps[i]);
        }
    }

    /// @param _asset The nft contract
    /// @return price The most recent price on chain
    function getPrice(address _asset)
        external
        view
        override
        returns (uint256 price)
    {
        PriceInformation storage priceInfo = assetPriceMap[_asset];
        uint256 twap = priceInfo.twap;
        require(
            (block.number - priceInfo.updatedAt) <= config.expirationPeriod,
            "NFTOracle: asset price expired"
        );
        require(twap > 0, "NFTOracle: invalid zero asset price");

        return twap;
    }

    /// @param _asset The nft contract
    /// @return timestamp The timestamp of the last update for an asset
    function getLastUpdateTime(address _asset)
        external
        view
        override
        returns (uint256 timestamp)
    {
        return assetPriceMap[_asset].updatedTimestamp;
    }

    function getFeederSize() public view returns (uint256) {
        return feeders.length;
    }

    function _whenNotPaused(address _asset) internal view {
        bool _paused = assetFeederMap[_asset].paused;
        require(!_paused, "NFTOracle: nft price feed paused");
    }

    function _isAssetExisted(address _asset) internal view returns (bool) {
        return assetFeederMap[_asset].registered;
    }

    function _isFeederExisted(address _feeder) internal view returns (bool) {
        return feederPositionMap[_feeder].registered;
    }

    function _addAsset(address _asset)
        internal
        onlyWhenAssetNotExisted(_asset)
    {
        assetFeederMap[_asset].registered = true;
        assets.push(_asset);
        assetFeederMap[_asset].index = uint8(assets.length - 1);
        emit AssetAdded(_asset);
    }

    /// @notice add nft assets.
    /// @param _assets assets to add
    function _addAssets(address[] memory _assets) internal {
        for (uint256 i = 0; i < _assets.length; i++) {
            _addAsset(_assets[i]);
        }
    }

    function _removeAsset(address _asset)
        internal
        onlyWhenAssetExisted(_asset)
    {
        uint8 assetIndex = assetFeederMap[_asset].index;
        delete assets[assetIndex];
        delete assetPriceMap[_asset];
        delete assetFeederMap[_asset];
        emit AssetRemoved(_asset);
    }

    function _addFeeder(address _feeder)
        internal
        onlyWhenFeederNotExisted(_feeder)
    {
        feeders.push(_feeder);
        feederPositionMap[_feeder].index = uint8(feeders.length - 1);
        feederPositionMap[_feeder].registered = true;
        _setupRole(UPDATER_ROLE, _feeder);
        emit FeederAdded(_feeder);
    }

    /// @notice set feeders.
    /// @param _feeders feeders to set
    function _addFeeders(address[] memory _feeders) internal {
        for (uint256 i = 0; i < _feeders.length; i++) {
            _addFeeder(_feeders[i]);
        }
    }

    function _removeFeeder(address _feeder)
        internal
        onlyWhenFeederExisted(_feeder)
    {
        uint8 feederIndex = feederPositionMap[_feeder].index;
        require(
            feeders[feederIndex] == _feeder,
            "NFTOracle: feeder mismatched"
        );

        address lastFeeder = feeders[feeders.length - 1];
        if (_feeder != lastFeeder) {
            feeders[feederIndex] = lastFeeder;
            feederPositionMap[lastFeeder].index = feederIndex;
        }
        feeders.pop();
        delete feederPositionMap[_feeder];
        revokeRole(UPDATER_ROLE, _feeder);
        emit FeederRemoved(_feeder);
    }

    /// @notice set oracle configs
    /// @param _expirationPeriod only prices not expired will be aggregated with
    /// @param _maxPriceDeviation use to reject when price increase/decrease rate more than this value
    function _setConfig(uint128 _expirationPeriod, uint128 _maxPriceDeviation)
        internal
    {
        config.expirationPeriod = _expirationPeriod;
        config.maxPriceDeviation = _maxPriceDeviation;
        emit OracleConfigSet(_expirationPeriod, _maxPriceDeviation);
    }

    function _checkValidity(address _asset, uint256 _twap)
        internal
        view
        returns (bool)
    {
        require(_twap > 0, "NFTOracle: price should be more than 0");
        PriceInformation memory assetPriceMapEntry = assetPriceMap[_asset];
        uint256 _priorTwap = assetPriceMapEntry.twap;
        uint256 _updatedAt = assetPriceMapEntry.updatedAt;
        uint256 priceDeviation;
        //first price is always valid
        if (_priorTwap == 0 || _updatedAt == 0) {
            return true;
        }
        priceDeviation = _twap > _priorTwap
            ? (_twap * 100) / _priorTwap
            : (_priorTwap * 100) / _twap;

        // config maxPriceDeviation as multiple directly(not percent) for simplicity
        if (priceDeviation >= config.maxPriceDeviation) {
            return false;
        }
        return true;
    }

    function _finalizePrice(address _asset, uint256 _twap) internal {
        PriceInformation storage assetPriceMapEntry = assetPriceMap[_asset];
        assetPriceMapEntry.twap = _twap;
        assetPriceMapEntry.updatedAt = block.number;
        assetPriceMapEntry.updatedTimestamp = block.timestamp;
        emit AssetDataSet(
            _asset,
            assetPriceMapEntry.twap,
            assetPriceMapEntry.updatedAt
        );
    }

    function _addRawValue(address _asset, uint256 _twap) internal {
        FeederRegistrar storage feederRegistrar = assetFeederMap[_asset];
        PriceInformation storage priceInfo = feederRegistrar.feederPrice[
            msg.sender
        ];
        priceInfo.twap = _twap;
        priceInfo.updatedAt = block.number;
    }

    function _combine(address _asset, uint256 _twap)
        internal
        view
        returns (bool, uint256)
    {
        FeederRegistrar storage feederRegistrar = assetFeederMap[_asset];
        uint256 currentBlock = block.number;
        uint256 currentTwap = assetPriceMap[_asset].twap;
        //first time just use the feeding value
        if (currentTwap == 0) {
            return (true, _twap);
        }
        //use memory here so allocate with maximum length
        uint256 feederSize = feeders.length;
        uint256[] memory validPriceList = new uint256[](feederSize);
        uint256 validNum = 0;
        //aggeregate with price from all feeders
        for (uint256 i = 0; i < feederSize; i++) {
            PriceInformation memory priceInfo = feederRegistrar.feederPrice[
                feeders[i]
            ];
            if (priceInfo.updatedAt > 0) {
                uint256 diffBlock = currentBlock - priceInfo.updatedAt;
                if (diffBlock <= config.expirationPeriod) {
                    validPriceList[validNum] = priceInfo.twap;
                    validNum++;
                }
            }
        }
        if (validNum < MIN_ORACLES_NUM) {
            return (false, currentTwap);
        }
        _quickSort(validPriceList, 0, int256(validNum - 1));
        return (true, validPriceList[validNum / 2]);
    }

    function _quickSort(
        uint256[] memory arr,
        int256 left,
        int256 right
    ) internal pure {
        int256 i = left;
        int256 j = right;
        if (i == j) return;
        uint256 pivot = arr[uint256(left + (right - left) / 2)];
        while (i <= j) {
            while (arr[uint256(i)] < pivot) i++;
            while (pivot < arr[uint256(j)]) j--;
            if (i <= j) {
                (arr[uint256(i)], arr[uint256(j)]) = (
                    arr[uint256(j)],
                    arr[uint256(i)]
                );
                i++;
                j--;
            }
        }
        if (left < j) _quickSort(arr, left, j);
        if (i < right) _quickSort(arr, i, right);
    }
}
