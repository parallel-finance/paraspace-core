// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../dependencies/openzeppelin/contracts/AccessControl.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../dependencies/openzeppelin/contracts/IERC20.sol";
import "../dependencies/chainlink/ccip/interfaces/IRouterClient.sol";
import "../dependencies/chainlink/ccip/libraries/Client.sol";
import "../dependencies/chainlink/ccip/CCIPReceiver.sol";
import "./interfaces/INFTFloorOracle.sol";
import "../dependencies/looksrare/contracts/libraries/SignatureChecker.sol";

//we do not accept price lags behind to much(26h=93600s))
uint128 constant EXPIRATION_PERIOD = 93600;

struct CrossChainPriceMessage {
    uint256 messageId;
    MessageIdSignature signature;
    FinalizedPrice[] prices;
}

struct PriceInformation {
    // latest twap price
    uint128 twap;
    // last updated timestamp
    uint128 updatedTimestamp;
}

struct FinalizedPrice {
    uint64 finalizedTimestamp;
    address nft;
    uint256 price;
}

struct MessageIdSignature {
    uint8 v;
    bytes32 r;
    bytes32 s;
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
    address private immutable messageIdSigner;
    bytes32 internal immutable DOMAIN_SEPARATOR;

    //keccak256("MessageId(uint256 id)");
    bytes32 internal constant MESSAGE_ID_HASH =
        0xf6f72a0dc8b4c22dd443bd4da15f9a873dbab2521e5b3a9a65f678248a96f0b2;

    //keccak256("MessageId(uint256 id)");
    bytes32 internal constant EIP712_DOMAIN =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

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
        address _sourceChainSender,
        uint256 _sourceChainId,
        address _messageIdSigner
    ) CCIPReceiver(_router) {
        require(_admin != address(0), "Address cannot be zero");
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        sourceChainSelector = _sourceChainSelector;
        sourceChainSender = _sourceChainSender;
        messageIdSigner = _messageIdSigner;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN,
                //keccak256("ParaSpace"),
                0x88d989289235fb06c18e3c2f7ea914f41f773e86fb0073d632539f566f4df353,
                //keccak256(bytes("1")),
                0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6,
                _sourceChainId,
                sourceChainSender
            )
        );
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
        require(
            validateMessageIdSignature(message.messageId, message.signature),
            "invalid message id signature"
        );
        receivedMessageId = message.messageId;
        uint256 priceLength = message.prices.length;
        for (uint256 index = 0; index < priceLength; index++) {
            FinalizedPrice memory priceInfo = message.prices[index];
            _updatePrice(
                priceInfo.nft,
                priceInfo.price,
                priceInfo.finalizedTimestamp
            );
        }
    }

    /// @notice Allows admin to set emergency price on PriceInformation and updates the
    /// internal Median cumulativePrice.
    /// @param _asset The nft contract to set a floor price for
    /// @param _twap The last floor twap
    function setEmergencyPrice(
        address[] calldata _asset,
        uint256[] calldata _twap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 length = _asset.length;
        require(_twap.length == length, "invalid parameter");
        for (uint256 index = 0; index < length; index++) {
            _updatePrice(_asset[index], _twap[index], block.timestamp);
        }
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
        priceInfo.twap = 1;
        assetPriceMap[_asset] = priceInfo;
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

    function _updatePrice(
        address _asset,
        uint256 _twap,
        uint256 _timestamp
    ) internal {
        PriceInformation memory priceInfo = assetPriceMap[_asset];
        priceInfo.twap = _twap.toUint128();
        priceInfo.updatedTimestamp = _timestamp.toUint128();
        assetPriceMap[_asset] = priceInfo;
        emit AssetPriceUpdated(_asset, _twap, _timestamp);
    }
}
