// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../dependencies/openzeppelin/contracts/AccessControl.sol";
import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/chainlink/ccip/interfaces/IRouterClient.sol";
import "../dependencies/chainlink/ccip/libraries/Client.sol";
import "./interfaces/INFTFloorOracle.sol";
import "../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";

//we need to deploy 3 oracles at least
uint8 constant MIN_ORACLES_NUM = 3;
//expirationPeriod at least the interval of client to feed data(currently 6h=21600s)
//we do not accept price lags behind to much
uint128 constant EXPIRATION_PERIOD = 21600;
//reject when price increase/decrease 3 times more than original value
uint128 constant MAX_DEVIATION_RATE = 300;

struct OracleConfig {
    // Expiration Period for each feed price
    uint128 expirationPeriod;
    // Maximum deviation allowed between two consecutive oracle prices
    uint128 maxPriceDeviation;
}

struct CrossChainGasConfig {
    uint64 basGas;
    uint64 gasPerAsset;
    uint128 maxFeePerBridge;
}

struct PriceInformation {
    // last reported floor price(offchain twap)
    uint128 twap;
    // last updated timestamp
    uint128 updatedTimestamp;
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

struct FinalizedPrice {
    uint64 finalizedTimestamp;
    address nft;
    uint256 price;
}

struct CrossChainPriceMessage {
    uint256 messageId;
    MessageIdSignature signature;
    FinalizedPrice[] prices;
}

struct MessageIdSignature {
    uint8 v;
    bytes32 r;
    bytes32 s;
}

/// @title A simple on-chain price oracle mechanism
/// @author github.com/drbh,github.com/yrong
/// @notice Offchain clients can update the prices in this contract. The public can read prices
/// aggregate prices which are not expired from different feeders, if number of valid/unexpired prices
/// not enough, we do not aggregate and just use previous price
contract NFTFloorOracleProvider is
    Initializable,
    AccessControl,
    INFTFloorOracle
{
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    event AssetAdded(address indexed asset);
    event AssetRemoved(address indexed asset);
    event AssetPaused(address indexed asset, bool paused);
    event FeederAdded(address indexed feeder);
    event FeederRemoved(address indexed feeder);
    event OracleConfigSet(uint128 expirationPeriod, uint128 maxPriceDeviation);
    event AssetDataSet(
        address indexed asset,
        uint256 twap,
        uint256 lastUpdatedTimestamp
    );

    // Event emitted when a message is sent to another chain.
    event PriceBridged(
        bytes32 indexed messageId, // The unique ID of the message.
        uint256 fees, // The fees paid for sending the message.
        FinalizedPrice[] finalized // updated price pair
    );

    /**
     * @dev Emitted during rescueERC20()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param amount The amount being rescued
     **/
    event RescueERC20(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    IRouterClient private immutable router;
    IERC20 private immutable linkToken;
    uint64 private immutable destinationChainSelector;
    address private immutable destinationChainReceiver;
    address private immutable messageIdSigner;
    bytes32 internal DOMAIN_SEPARATOR;

    //keccak256("MessageId(uint256 id)");
    bytes32 internal constant MESSAGE_ID_HASH =
        0xf6f72a0dc8b4c22dd443bd4da15f9a873dbab2521e5b3a9a65f678248a96f0b2;

    //keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant EIP712_DOMAIN =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

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

    uint256 public sentMessageId;

    CrossChainGasConfig internal gasConfig;

    /**
     * @dev Constructor.
     */
    constructor(
        address _router,
        address _linkToken,
        uint64 _destinationChainSelector,
        address _destinationChainReceiver,
        address _messageIdSigner
    ) {
        router = IRouterClient(_router);
        linkToken = IERC20(_linkToken);
        destinationChainSelector = _destinationChainSelector;
        destinationChainReceiver = _destinationChainReceiver;
        messageIdSigner = _messageIdSigner;
    }

    /// @notice Allow contract creator to set admin and updaters
    /// @param _admin The admin who can change roles
    /// @param _feeders The initial updaters
    /// @param _assets The initial nft assets
    function initialize(
        address _admin,
        address[] memory _feeders,
        address[] memory _assets
    ) public initializer {
        require(_admin != address(0), "Address cannot be zero"); // Add this line
        _addAssets(_assets);
        _addFeeders(_feeders);
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        //still need to grant update_role to admin for emergency call
        _setupRole(UPDATER_ROLE, _admin);
        _setConfig(EXPIRATION_PERIOD, MAX_DEVIATION_RATE);

        gasConfig.basGas = 50000;
        gasConfig.gasPerAsset = 6000;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN,
                //keccak256("ParaSpace"),
                0x88d989289235fb06c18e3c2f7ea914f41f773e86fb0073d632539f566f4df353,
                //keccak256(bytes("1")),
                0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6,
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice Allows owner to add assets.
    /// @param _assets assets to add
    function addAssets(
        address[] calldata _assets
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _addAssets(_assets);
    }

    /// @notice Allows owner to remove assets.
    /// @param _assets asset to remove
    function removeAssets(
        address[] calldata _assets
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _assets.length; i++) {
            _removeAsset(_assets[i]);
        }
    }

    /// @notice Allows owner to add feeders.
    /// @param _feeders feeders to add
    function addFeeders(
        address[] calldata _feeders
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _addFeeders(_feeders);
    }

    /// @notice Allows owner to remove feeders.
    /// @param _feeders feeders to remove
    function removeFeeders(
        address[] calldata _feeders
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < _feeders.length; i++) {
            _removeFeeder(_feeders[i]);
        }
    }

    /// @notice Allows owner to update oracle configs
    function setConfig(
        uint128 expirationPeriod,
        uint128 maxPriceDeviation
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setConfig(expirationPeriod, maxPriceDeviation);
    }

    function setGasConfig(
        uint64 basGas,
        uint64 gasPerAsset,
        uint128 maxFeePerBridge
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CrossChainGasConfig memory currentConfig = gasConfig;
        currentConfig.basGas = basGas;
        currentConfig.gasPerAsset = gasPerAsset;
        currentConfig.maxFeePerBridge = maxFeePerBridge;
        gasConfig = currentConfig;
    }

    /// @notice Allows owner to pause asset
    function setPause(
        address _asset,
        bool _flag
    ) external onlyRole(DEFAULT_ADMIN_ROLE) onlyWhenAssetExisted(_asset) {
        assetFeederMap[_asset].paused = _flag;
        emit AssetPaused(_asset, _flag);
    }

    /// @notice Allows admin to set emergency price on PriceInformation and updates the
    /// internal Median cumulativePrice.
    function setEmergencyPrice(
        address[] calldata nfts,
        uint256[] calldata prices,
        MessageIdSignature calldata signature
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 nftLength = nfts.length;
        require(nftLength == prices.length, "invalid parameters");
        FinalizedPrice[] memory finalizedPrice = new FinalizedPrice[](
            nftLength
        );
        uint64 curTimeStamp = block.timestamp.toUint64();
        for (uint256 index = 0; index < nftLength; index++) {
            FinalizedPrice memory price = finalizedPrice[index];
            price.nft = nfts[index];
            price.price = prices[index];
            price.finalizedTimestamp = curTimeStamp;
            _finalizePrice(price.nft, price.price, curTimeStamp);
        }
        _updatePriceToBridge(finalizedPrice, signature);
    }

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    /// @notice Allows owner to set new price on PriceInformation and updates the
    /// internal Median cumulativePrice.
    /// @param _assets The nft contract to set a floor price for
    /// @param _twaps The nft floor twaps
    function setMultiplePrices(
        address[] calldata _assets,
        uint256[] calldata _twaps,
        MessageIdSignature calldata signature
    ) external onlyRole(UPDATER_ROLE) onlyWhenFeederExisted(msg.sender) {
        uint256 assetLength = _assets.length;
        require(
            assetLength == _twaps.length,
            "NFTOracle: Tokens and price length differ"
        );
        OracleConfig memory _config = config;
        FinalizedPrice[] memory finalized = new FinalizedPrice[](assetLength);
        uint256 finalizedCount = 0;
        for (uint256 i = 0; i < assetLength; i++) {
            (bool aggregate, uint256 price) = _setPrice(
                _config,
                _assets[i],
                _twaps[i]
            );
            if (aggregate) {
                finalized[finalizedCount] = FinalizedPrice({
                    nft: _assets[i],
                    price: price,
                    finalizedTimestamp: block.timestamp.toUint64()
                });
                finalizedCount++;
            }
        }
        assembly {
            mstore(finalized, finalizedCount)
        }
        _updatePriceToBridge(finalized, signature);
    }

    /// @param _asset The nft contract
    /// @return price The most recent price on chain
    function getPrice(
        address _asset
    ) external view override returns (uint256 price) {
        PriceInformation memory priceInfo = assetPriceMap[_asset];
        require(
            priceInfo.updatedTimestamp != 0,
            "NFTOracle: asset price not ready"
        );
        require(
            (block.timestamp - priceInfo.updatedTimestamp) <=
                config.expirationPeriod,
            "NFTOracle: asset price expired"
        );
        return priceInfo.twap;
    }

    /// @param _asset The nft contract
    /// @return timestamp The timestamp of the last update for an asset
    function getLastUpdateTime(
        address _asset
    ) external view override returns (uint256 timestamp) {
        return assetPriceMap[_asset].updatedTimestamp;
    }

    function getFeederSize() public view returns (uint256) {
        return feeders.length;
    }

    function getMessageIdHash(uint256 messageId) public pure returns (bytes32) {
        return keccak256(abi.encode(MESSAGE_ID_HASH, messageId));
    }

    function validateMessageIdSignature(
        uint256 messageId,
        MessageIdSignature memory signature
    ) public view returns (bool) {
        return
            SignatureChecker.verify(
                getMessageIdHash(messageId),
                messageIdSigner,
                signature.v,
                signature.r,
                signature.s,
                DOMAIN_SEPARATOR
            );
    }

    function _updatePriceToBridge(
        FinalizedPrice[] memory finalized,
        MessageIdSignature calldata signature
    ) internal {
        if (address(router) == address(0) || finalized.length == 0) {
            return;
        }

        // clear price data for finalized price
        address[] memory allFeeders = feeders;
        for (uint256 i = 0; i < finalized.length; i++) {
            FinalizedPrice memory price = finalized[i];
            FeederRegistrar storage feederData = assetFeederMap[price.nft];
            for (uint256 j = 0; j< allFeeders.length; j++) {
                feederData.feederPrice[allFeeders[j]].updatedTimestamp = 0;
            }
        }

        uint256 nextMessageId = ++sentMessageId;
        require(
            validateMessageIdSignature(nextMessageId, signature),
            "invalid message id signature"
        );

        CrossChainPriceMessage memory message;
        message.messageId = nextMessageId;
        message.prices = finalized;
        message.signature = signature;
        bytes memory data = abi.encode(message);

        CrossChainGasConfig memory currentConfig = gasConfig;
        uint256 gasLimit = currentConfig.basGas +
            currentConfig.gasPerAsset *
            finalized.length;
        Client.EVMTokenAmount[]
            memory tokenAmounts = new Client.EVMTokenAmount[](0);
        Client.EVM2AnyMessage memory evm2AnyMessage = Client.EVM2AnyMessage({
            receiver: abi.encode(destinationChainReceiver), // ABI-encoded receiver contract address
            data: data,
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: gasLimit, strict: false}) // Additional arguments, setting gas limit and non-strict sequency mode
            ),
            feeToken: address(linkToken) // Setting feeToken to LinkToken address, indicating LINK will be used for fees
        });

        // Get the fee required to send the message. Fee paid in LINK.
        uint256 fees = router.getFee(destinationChainSelector, evm2AnyMessage);
        require(fees > 0, "invalid message");
        if (currentConfig.maxFeePerBridge != 0) {
            require(fees < currentConfig.maxFeePerBridge, "fee exceed limit");
        }

        // Approve the Router to pay fees in LINK tokens on contract's behalf.
        linkToken.approve(address(router), fees);

        // Send the message through the router and store the returned message ID
        bytes32 messageId = router.ccipSend(
            destinationChainSelector,
            evm2AnyMessage
        );

        // Emit an event with message details
        emit PriceBridged(messageId, fees, finalized);
    }

    function _setPrice(
        OracleConfig memory _config,
        address _asset,
        uint256 _twap
    ) internal returns (bool, uint256) {
        PriceInformation memory _priceInfo = assetPriceMap[_asset];
        FeederRegistrar storage _feederRegistrar = assetFeederMap[_asset];
        require(_feederRegistrar.registered, "NFTOracle: asset not existed");
        require(!_feederRegistrar.paused, "NFTOracle: nft price feed paused");
        require(
            _checkValidity(_priceInfo, _config, _twap),
            "NFTOracle: invalid price data"
        );
        // set twap price only when median value is valid
        (bool aggregate, uint256 medianPrice) = _addValue(
            _config,
            _feederRegistrar,
            _priceInfo,
            _twap
        );
        if (aggregate) _finalizePrice(_asset, medianPrice, block.timestamp);

        return (aggregate, medianPrice);
    }

    function _addAsset(
        address _asset
    ) internal onlyWhenAssetNotExisted(_asset) {
        assetFeederMap[_asset].registered = true;
        assets.push(_asset);
        assetFeederMap[_asset].index = uint8(assets.length - 1);
        emit AssetAdded(_asset);
    }

    function _removeAsset(
        address _asset
    ) internal onlyWhenAssetExisted(_asset) {
        uint8 assetIndex = assetFeederMap[_asset].index;
        delete assets[assetIndex];
        delete assetPriceMap[_asset];
        delete assetFeederMap[_asset];
        emit AssetRemoved(_asset);
    }

    /// @notice add nft assets.
    /// @param _assets assets to add
    function _addAssets(address[] memory _assets) internal {
        for (uint256 i = 0; i < _assets.length; i++) {
            _addAsset(_assets[i]);
        }
    }

    function _addFeeder(
        address _feeder
    ) internal onlyWhenFeederNotExisted(_feeder) {
        feeders.push(_feeder);
        feederPositionMap[_feeder].index = uint8(feeders.length - 1);
        feederPositionMap[_feeder].registered = true;
        _setupRole(UPDATER_ROLE, _feeder);
        emit FeederAdded(_feeder);
    }

    function _removeFeeder(
        address _feeder
    ) internal onlyWhenFeederExisted(_feeder) {
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

    /// @notice set feeders.
    /// @param _feeders feeders to set
    function _addFeeders(address[] memory _feeders) internal {
        for (uint256 i = 0; i < _feeders.length; i++) {
            _addFeeder(_feeders[i]);
        }
    }

    /// @notice set oracle configs
    /// @param _expirationPeriod only prices not expired will be aggregated with
    /// @param _maxPriceDeviation use to reject when price increase/decrease rate more than this value
    function _setConfig(
        uint128 _expirationPeriod,
        uint128 _maxPriceDeviation
    ) internal {
        config.expirationPeriod = _expirationPeriod;
        config.maxPriceDeviation = _maxPriceDeviation;
        emit OracleConfigSet(_expirationPeriod, _maxPriceDeviation);
    }

    function _checkValidity(
        PriceInformation memory _priceInfo,
        OracleConfig memory _config,
        uint256 _twap
    ) internal pure returns (bool) {
        require(_twap > 0, "NFTOracle: price should be more than 0");

        uint256 _priorTwap = _priceInfo.twap;
        uint256 _updatedAt = _priceInfo.updatedTimestamp;
        uint256 priceDeviation;
        //first price is always valid
        if (_priorTwap == 0 || _updatedAt == 0) {
            return true;
        }
        priceDeviation = _twap > _priorTwap
            ? (_twap * 100) / _priorTwap
            : (_priorTwap * 100) / _twap;

        // config maxPriceDeviation as multiple directly(not percent) for simplicity
        if (priceDeviation >= _config.maxPriceDeviation) {
            return false;
        }
        return true;
    }

    function _finalizePrice(
        address _asset,
        uint256 _twap,
        uint256 _timestamp
    ) internal {
        PriceInformation storage priceInfo = assetPriceMap[_asset];
        priceInfo.twap = _twap.toUint128();
        priceInfo.updatedTimestamp = _timestamp.toUint128();
        emit AssetDataSet(_asset, _twap, _timestamp);
    }

    function _addValue(
        OracleConfig memory _config,
        FeederRegistrar storage _feederRegistrar,
        PriceInformation memory _priceInfo,
        uint256 _twap
    ) internal returns (bool, uint256) {
        uint256 currentTimestamp = block.timestamp;
        uint256 currentTwap = _priceInfo.twap;

        _feederRegistrar.feederPrice[msg.sender].twap = _twap.toUint128();
        _feederRegistrar
            .feederPrice[msg.sender]
            .updatedTimestamp = currentTimestamp.toUint128();

        //first time just use the feeding value
        if (currentTwap == 0) {
            return (true, _twap);
        }
        //use memory here so allocate with maximum length
        address[] memory _feeders = feeders;
        uint256[] memory validPriceList = new uint256[](_feeders.length);
        uint256 validNum = 0;
        //aggregate with price from all feeders
        for (uint256 i = 0; i < _feeders.length; i++) {
            PriceInformation memory priceInfo = _feederRegistrar.feederPrice[
                _feeders[i]
            ];
            uint256 diffTimeStamp = currentTimestamp -
                priceInfo.updatedTimestamp;
            if (
                priceInfo.updatedTimestamp > 0 &&
                diffTimeStamp <= _config.expirationPeriod
            ) {
                validPriceList[validNum] = priceInfo.twap;
                validNum++;
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

    modifier onlyWhenAssetExisted(address _asset) {
        require(
            assetFeederMap[_asset].registered,
            "NFTOracle: asset not existed"
        );
        _;
    }

    modifier onlyWhenAssetNotExisted(address _asset) {
        require(!assetFeederMap[_asset].registered, "NFTOracle: asset existed");
        _;
    }

    modifier onlyWhenFeederExisted(address _feeder) {
        require(
            feederPositionMap[_feeder].registered,
            "NFTOracle: feeder not existed"
        );
        _;
    }

    modifier onlyWhenFeederNotExisted(address _feeder) {
        require(
            !feederPositionMap[_feeder].registered,
            "NFTOracle: feeder existed"
        );
        _;
    }
}
