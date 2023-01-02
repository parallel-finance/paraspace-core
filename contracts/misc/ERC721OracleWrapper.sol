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
        address _asset
    ) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_provider);
        oracleAddress = INFTFloorOracle(_oracleAddress);
        asset = _asset;
    }

    function setOracle(address _oracleAddress)
        external
        onlyAssetListingOrPoolAdmins
    {
        oracleAddress = INFTFloorOracle(_oracleAddress);
    }

    function decimals() external pure override returns (uint8) {
        return 18;
    }

    function version() external view returns (uint256) {
        return 0;
    }

    function description() external view returns (string memory) {
        return "";
    }

    function getRoundData(uint80)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        answer = int256(oracleAddress.getPrice(asset));
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        answer = int256(oracleAddress.getPrice(asset));
    }
}
