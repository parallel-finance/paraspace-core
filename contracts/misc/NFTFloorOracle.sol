// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/contracts/AccessControl.sol";
import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "./interfaces/INFTFloorOracle.sol";

//we need to deploy 3 oracle at least
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
    /// @dev last reported floor price
    uint256 twap;
    uint256 updatedAt;
    uint256 updatedTimeStamp;
}

struct FeederRegistrar {
    // if asset not registered,reject the price
    bool registered;
    // index in asset list
    uint8 index;
    // if asset paused,reject the price
    bool paused;
    // feeder -> PriceInformation
    mapping(address => PriceInformation) feederPrice;
}

/// @title A simple on-chain price oracle mechanism
/// @author github.com/drbh,github.com/yrong
/// @notice Offchain clients can update the prices in this contract. The public can read prices
/// aggeregate prices which are not expired from different feeders, if number of valid/unexpired prices
/// not enough, we do not aggeregate and just use previous price
contract NFTFloorOracle is Initializable, AccessControl, INFTFloorOracle {
    event AssetAdded(address indexed asset);
    event AssetRemoved(address indexed asset);
    event AssetDataSet(
        address indexed asset,
        uint256 price,
        uint256 lastUpdated
    );
    event OracleNodesSet(address[] indexed nodes);
    event OracleConfigSet(uint128 expirationPeriod, uint128 maxPriceDeviation);
    event OracleNftPaused(address indexed asset, bool paused);

    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    /// @dev Aggregated price with address
    // the NFT contract -> price information
    mapping(address => PriceInformation) public priceMap;

    /// @dev All feeders
    address[] public feeders;

    /// @dev All asset list
    address[] public nfts;

    /// @dev Original raw value to aggregate with
    // contract address -> FeederRegistrar
    mapping(address => FeederRegistrar) public priceFeederMap;

    /// @dev storage for oracle configurations
    OracleConfig public config;

    modifier whenNotPaused(address _nftContract) {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            _whenNotPaused(_nftContract);
        }
        _;
    }

    modifier onlyWhenKeyExisted(address _nftContract) {
        require(_isExistedKey(_nftContract), "NFTOracle: asset not existed");
        _;
    }

    modifier onlyWhenKeyNotExisted(address _nftContract) {
        require(!_isExistedKey(_nftContract), "NFTOracle: asset existed");
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

    function _isExistedKey(address _nftContract) internal view returns (bool) {
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
    function _addAssets(address[] memory assets) internal {
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
        _addAssets(assets);
        _setOracles(updaters);
        _setConfig(EXPIRATION_PERIOD, MAX_DEVIATION_RATE);
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
    function setConfig(uint64 expirationPeriod, uint128 maxPriceDeviation)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setConfig(expirationPeriod, maxPriceDeviation);
    }

    function _checkValidityOfPrice(address _nftContract, uint256 _price)
        internal
        view
        returns (bool)
    {
        require(_price > 0, "NFTOracle: price should be more than 0");
        PriceInformation memory priceMapEntry = priceMap[_nftContract];
        uint256 price = priceMapEntry.twap;
        uint256 updatedAt = priceMapEntry.updatedAt;
        uint256 priceDeviation;
        //first price is always valid
        if (price == 0 || updatedAt == 0) {
            return true;
        }
        priceDeviation = _price > price
            ? (_price * 100) / price
            : (price * 100) / _price;
        // config maxPriceDeviation as multiple directly(not percent) for simplicity
        if (priceDeviation >= config.maxPriceDeviation) {
            return false;
        }
        return true;
    }

    /// @notice Allows updater to set new price on PriceInformation and updates the
    /// internal TWAP cumulativePrice.
    /// @param token The nft contracts to set a floor price for
    /// @param twap The last floor twap
    function setPrice(address token, uint256 twap)
        public
        onlyRole(UPDATER_ROLE)
        onlyWhenKeyExisted(token)
        whenNotPaused(token)
    {
        bool dataValidity = false;
        if (hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            _finalizePrice(token, twap);
            return;
        }
        dataValidity = _checkValidityOfPrice(token, twap);
        require(dataValidity, "NFTOracle: invalid price data");
        // add price to raw feeder storage
        _addRawValue(token, twap);
        uint256 medianPrice;
        // set twap price only when median value is valid
        (dataValidity, medianPrice) = _combine(token, twap);
        if (dataValidity) {
            _finalizePrice(token, medianPrice);
        }
    }

    function _finalizePrice(address token, uint256 twap) internal {
        PriceInformation storage priceMapEntry = priceMap[token];
        priceMapEntry.twap = twap;
        priceMapEntry.updatedAt = block.number;
        priceMapEntry.updatedTimeStamp = block.timestamp;
        emit AssetDataSet(token, priceMapEntry.twap, priceMapEntry.updatedAt);
    }

    function _addRawValue(address token, uint256 twap) internal {
        FeederRegistrar storage feederRegistrar = priceFeederMap[token];
        PriceInformation storage priceInfo = feederRegistrar.feederPrice[
            msg.sender
        ];
        priceInfo.twap = twap;
        priceInfo.updatedAt = block.number;
    }

    function _combine(address token, uint256 twap)
        internal
        view
        returns (bool, uint256)
    {
        FeederRegistrar storage feederRegistrar = priceFeederMap[token];
        uint64 currentTime = uint64(block.number);
        //first time just use the feeding value
        if (priceMap[token].twap == 0) {
            return (true, twap);
        }
        //use memory here so allocate with maximum length
        uint256[] memory validPriceList = new uint256[](feeders.length);
        uint256 validNum = 0;
        //aggeregate with price in each ring position of all feeders
        for (uint256 i = 0; i < feeders.length; i++) {
            PriceInformation memory priceInfo = feederRegistrar.feederPrice[
                feeders[i]
            ];
            if (priceInfo.updatedAt > 0) {
                uint256 diffTime = currentTime - priceInfo.updatedAt;
                if (diffTime <= config.expirationPeriod) {
                    validPriceList[validNum] = priceInfo.twap;
                    validNum++;
                }
            }
        }
        if (validNum < MIN_ORACLES_NUM) {
            return (false, priceMap[token].twap);
        }
        _quickSort(validPriceList, 0, int256(validNum - 1));
        return (true, validPriceList[validNum / 2]);
    }

    /// @notice Allows owner to set new price on PriceInformation and updates the
    /// internal TWAP cumulativePrice.
    /// @param tokens The nft contract to set a floor price for
    function setMultiplePrices(
        address[] calldata tokens,
        uint256[] calldata twaps
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
    function getTwap(address token)
        external
        view
        override
        returns (uint256 twap)
    {
        uint256 updatedAt = priceMap[token].updatedAt;
        require(
            (block.number - updatedAt) <= config.expirationPeriod,
            "NFTOracle: asset price expired"
        );
        return priceMap[token].twap;
    }

    /// @param token The nft contract
    /// @return timestamp The timestamp of the last update for an asset
    function getLastUpdateTime(address token)
        external
        view
        override
        returns (uint256 timestamp)
    {
        return priceMap[token].updatedTimeStamp;
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
