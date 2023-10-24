// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../dependencies/openzeppelin/contracts/AccessControl.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/chainlink/ccip/interfaces/IRouterClient.sol";
import "../dependencies/chainlink/ccip/libraries/Client.sol";
import "../dependencies/chainlink/ccip/CCIPReceiver.sol";
import "./interfaces/INFTFloorOracle.sol";

//we do not accept price lags behind to much(10h=36000s))
uint128 constant EXPIRATION_PERIOD = 36000;

struct CrossChainPriceMessage {
    uint256 messageId;
    FinalizedPrice[] prices;
}

struct PriceInformation {
    // latest twap price
    uint128 twap;
    // last updated timestamp
    uint128 updatedTimestamp;
}

struct FinalizedPrice {
    address nft;
    uint256 price;
}

/// @title A simple on-chain price oracle
contract NFTFloorOracle is CCIPReceiver, AccessControl, INFTFloorOracle {
    using SafeCast for uint256;

    event AssetPriceUpdated(
        address indexed asset,
        uint256 twap,
        uint256 lastUpdatedTimestamp
    );

    uint64 private immutable sourceChainSelector;
    address private immutable sourceChainSender;

    uint256 public receivedMessageId;
    /// @dev Aggregated price with address
    // the NFT contract -> latest price information
    mapping(address => PriceInformation) public assetPriceMap;

    /**
     * @dev Constructor.
     */
    constructor(
        address _router,
        address _admin,
        uint64 _sourceChainSelector,
        address _sourceChainSender
    ) CCIPReceiver(_router) {
        require(_admin != address(0), "Address cannot be zero");
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        sourceChainSelector = _sourceChainSelector;
        sourceChainSender = _sourceChainSender;
    }

    /// handle a received message
    function _ccipReceive(
        Client.Any2EVMMessage memory any2EvmMessage
    ) internal override {
        require(
            any2EvmMessage.sourceChainSelector == sourceChainSelector,
            "invalid source chain selector"
        );

        address sender = abi.decode(any2EvmMessage.sender, (address));
        require(sourceChainSender == sender, "invalid source chain sender");

        CrossChainPriceMessage memory message = abi.decode(
            any2EvmMessage.data,
            (CrossChainPriceMessage)
        );
        require(message.messageId > receivedMessageId, "invalid message");
        receivedMessageId = message.messageId;
        uint256 priceLength = message.prices.length;
        for (uint256 index = 0; index < priceLength; index++) {
            FinalizedPrice memory priceInfo = message.prices[index];
            _updatePrice(priceInfo.nft, priceInfo.price);
        }
    }

    /// @notice Allows admin to set emergency price on PriceInformation and updates the
    /// internal Median cumulativePrice.
    /// @param _asset The nft contract to set a floor price for
    /// @param _twap The last floor twap
    function setEmergencyPrice(
        address _asset,
        uint256 _twap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updatePrice(_asset, _twap);
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
            (block.timestamp - priceInfo.updatedTimestamp) <= EXPIRATION_PERIOD,
            "NFTOracle: asset price expired"
        );
        return priceInfo.twap;
    }

    /// @notice Allows anyone to initial price to make estimate gas easy on provider chain
    function initialPrice(address[] calldata _asset) external {
        uint256 assetLength = _asset.length;
        for (uint256 index = 0; index < assetLength; index++) {
            _initialPrice(_asset[index]);
        }
    }

    function _initialPrice(address _asset) internal {
        PriceInformation memory priceInfo = assetPriceMap[_asset];
        require(
            priceInfo.updatedTimestamp == 0 && priceInfo.twap == 0,
            "NFTOracle: asset price is initialized"
        );
        priceInfo.twap == 1;
    }

    /// @param _asset The nft contract address
    /// @return timestamp The timestamp of the last update for an asset
    function getLastUpdateTime(
        address _asset
    ) external view override returns (uint256 timestamp) {
        return assetPriceMap[_asset].updatedTimestamp;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(CCIPReceiver, AccessControl) returns (bool) {
        return
            interfaceId == type(INFTFloorOracle).interfaceId ||
            interfaceId == type(IAccessControl).interfaceId ||
            interfaceId == type(IAny2EVMMessageReceiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function _updatePrice(address _asset, uint256 _twap) internal {
        uint256 currentTimestamp = block.timestamp;
        PriceInformation memory priceInfo = assetPriceMap[_asset];
        priceInfo.twap = _twap.toUint128();
        priceInfo.updatedTimestamp = currentTimestamp.toUint128();
        assetPriceMap[_asset] = priceInfo;
        emit AssetPriceUpdated(_asset, _twap, currentTimestamp);
    }
}
