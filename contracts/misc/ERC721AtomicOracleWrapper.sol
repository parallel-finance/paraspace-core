// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IEACAggregatorProxy} from "../interfaces/IEACAggregatorProxy.sol";
import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";

contract ERC721AtomicOracleWrapper is IAtomicPriceAggregator {
    using WadRayMath for uint256;

    IEACAggregatorProxy private aggregator;
    address private immutable asset;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    /**
     * @dev This constant represents the maximum price multiplier that a single tokenId can have
     * A value of 10e18 results in 10x of price
     */
    uint256 internal constant MAX_PRICE_MULTIPLIER = 10e18;
    /**
     * @dev This constant represents the minimum price multiplier that a single tokenId can have
     * A value of 1e18 results in no price multiplier
     */
    uint256 internal constant MIN_PRICE_MULTIPLIER = 1e18;

    /**
     * @notice Multipliers based on traits
     * tokenId <-> priceMultiplier
     */
    mapping(uint256 => uint256) public traitMultipliers;

    /**
     * @dev Only asset listing or pool admin can call functions marked by this modifier.
     **/
    modifier onlyAssetListingOrPoolAdmins() {
        _onlyAssetListingOrPoolAdmins();
        _;
    }

    function _onlyAssetListingOrPoolAdmins() internal view {
        IACLManager aclManager = IACLManager(
            ADDRESSES_PROVIDER.getACLManager()
        );
        require(
            aclManager.isAssetListingAdmin(msg.sender) ||
                aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN
        );
    }

    constructor(
        address _provider,
        address _aggregator,
        address _asset
    ) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_provider);
        aggregator = IEACAggregatorProxy(_aggregator);
        asset = _asset;
    }

    function setOracle(address _aggregator)
        external
        onlyAssetListingOrPoolAdmins
    {
        aggregator = IEACAggregatorProxy(_aggregator);
    }

    function _validatePriceMultiplier(uint256 _priceMultiplier) internal pure {
        require(
            _priceMultiplier >= MIN_PRICE_MULTIPLIER &&
                _priceMultiplier <= MAX_PRICE_MULTIPLIER,
            "invalid price multiplier"
        );
    }

    /**
     * @notice Set price multiplier for the specified tokenId;
     */
    function setPriceMultipliers(
        uint256[] calldata tokenIds,
        uint256[] calldata priceMultipliers
    ) external onlyAssetListingOrPoolAdmins {
        require(
            tokenIds.length == priceMultipliers.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _validatePriceMultiplier(priceMultipliers[i]);
            traitMultipliers[tokenIds[i]] = priceMultipliers[i];
        }
    }

    /**
     * @notice Returns the multiplied price for the specified tokenId.
     */
    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        uint256 multiplier = traitMultipliers[tokenId];
        uint256 price = uint256(aggregator.latestAnswer());
        if (multiplier > 0) {
            price = price.wadMul(multiplier);
        }

        require(price > 0, "price not ready");
        return price;
    }

    /**
     * @notice Returns the price for the specified tokenId array.
     */
    function getTokensPrices(uint256[] calldata tokenIds)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory prices = new uint256[](tokenIds.length);

        for (uint256 index = 0; index < tokenIds.length; index++) {
            prices[index] = getTokenPrice(tokenIds[index]);
        }

        return prices;
    }

    /**
     * @notice Returns the total price for the specified tokenId array.
     */
    function getTokensPricesSum(uint256[] calldata tokenIds)
        external
        view
        returns (uint256)
    {
        uint256 sum = 0;

        for (uint256 index = 0; index < tokenIds.length; index++) {
            sum += getTokenPrice(tokenIds[index]);
        }

        return sum;
    }
}
