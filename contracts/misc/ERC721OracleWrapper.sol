// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IEACAggregatorProxy} from "../interfaces/IEACAggregatorProxy.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {INFTFloorOracle} from "./interfaces/INFTFloorOracle.sol";

contract ERC721OracleWrapper is IEACAggregatorProxy {
    INFTFloorOracle private oracleAddress;
    address private immutable asset;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    uint256 expirationPeriod;

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
        address _oracleAddress,
        address _asset,
        uint256 _expirationPeriod
    ) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_provider);
        oracleAddress = INFTFloorOracle(_oracleAddress);
        asset = _asset;
        expirationPeriod = _expirationPeriod;
    }

    function setOracle(address _oracleAddress)
        external
        onlyAssetListingOrPoolAdmins
    {
        oracleAddress = INFTFloorOracle(_oracleAddress);
    }

    function setExpirationPeriod(uint256 _expirationPeriod)
        external
        onlyAssetListingOrPoolAdmins
    {
        expirationPeriod = _expirationPeriod;
    }

    function decimals() external pure override returns (uint8) {
        return 18;
    }

    function latestAnswer() external view override returns (int256) {
        uint256 lastUpdatedTime = oracleAddress.getLastUpdateTime(asset);
        int256 lastUpdateTwap = int256(oracleAddress.getTwap(asset));
        if ((block.number - lastUpdatedTime) > expirationPeriod) {
            revert(Errors.ORACLE_PRICE_EXPIRED);
        }
        return lastUpdateTwap;
    }

    function latestTimestamp() external view override returns (uint256) {
        return uint256(oracleAddress.getLastUpdateTime(asset));
    }

    function latestRound() external pure override returns (uint256) {
        return 0;
    }

    function getAnswer(uint256) external view override returns (int256) {
        return int256(oracleAddress.getTwap(asset));
    }

    function getTimestamp(uint256) external view override returns (uint256) {
        return uint256(oracleAddress.getLastUpdateTime(asset));
    }
}
