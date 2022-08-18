// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IEACAggregatorProxy} from "../interfaces/IEACAggregatorProxy.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";

interface NFTOracle {
    function getTwap(address token) external view returns (uint128 price);

    function getLastUpdateTime(address token)
        external
        view
        returns (uint128 timestamp);
}

contract ERC721OracleWrapper is IEACAggregatorProxy {
    NFTOracle private oracleAddress;
    address private immutable asset;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

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
        IPoolAddressesProvider provider,
        address _oracleAddress,
        address _asset
    ) {
        ADDRESSES_PROVIDER = provider;
        oracleAddress = NFTOracle(_oracleAddress);
        asset = _asset;
    }

    function setOracle(address _oracleAddress)
        external
        onlyAssetListingOrPoolAdmins
    {
        oracleAddress = NFTOracle(_oracleAddress);
    }

    function decimals() external view override returns (uint8) {
        return 18;
    }

    function latestAnswer() external view override returns (int256) {
        return int256(uint256(oracleAddress.getTwap(asset)));
    }

    function latestTimestamp() external view override returns (uint256) {
        return uint256(oracleAddress.getLastUpdateTime(asset));
    }

    function latestRound() external view override returns (uint256) {
        return 0;
    }

    function getAnswer(uint256 roundId)
        external
        view
        override
        returns (int256)
    {
        return int256(uint256(oracleAddress.getTwap(asset)));
    }

    function getTimestamp(uint256 roundId)
        external
        view
        override
        returns (uint256)
    {
        return uint256(oracleAddress.getLastUpdateTime(asset));
    }
}
