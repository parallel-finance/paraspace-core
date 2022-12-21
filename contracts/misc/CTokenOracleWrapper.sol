// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IEACAggregatorProxy} from "../interfaces/IEACAggregatorProxy.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {ICToken} from "../interfaces/ICToken.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";

contract CTokenOracleWrapper is IEACAggregatorProxy {
    IEACAggregatorProxy private oracleAddress;
    address private immutable asset;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    int256 constant EXP_SCALE = 1e18;
    int256 constant CTOKEN_UNIT = 1e8;

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
        oracleAddress = IEACAggregatorProxy(_oracleAddress);
        asset = _asset;
    }

    function setOracle(address _oracleAddress)
        external
        onlyAssetListingOrPoolAdmins
    {
        oracleAddress = IEACAggregatorProxy(_oracleAddress);
    }

    function decimals() external view override returns (uint8) {
        return oracleAddress.decimals();
    }

    function latestAnswer() external view override returns (int256) {
        return _calculateScaledPrice(oracleAddress.latestAnswer());
    }

    function latestTimestamp() external view override returns (uint256) {
        return oracleAddress.latestTimestamp();
    }

    function latestRound() external view override returns (uint256) {
        return oracleAddress.latestRound();
    }

    function getAnswer(uint256) external view override returns (int256) {
        return _calculateScaledPrice(oracleAddress.latestAnswer());
    }

    function getTimestamp(uint256 roundId)
        external
        view
        override
        returns (uint256)
    {
        return oracleAddress.getTimestamp(roundId);
    }

    function _calculateScaledPrice(int256 answer)
        internal
        view
        returns (int256)
    {
        int256 underlyingUnit = 1e18;
        try ICToken(asset).underlying() returns (address underlyingAsset) {
            underlyingUnit = int256(
                10**IERC20Detailed(underlyingAsset).decimals()
            );
        } catch {}

        // TODO: validate exchangeRate to prevent exchangeRate manipulation
        // cToken price = underlyingAssetPrice * exchangeRate / (underlyingUnit * expScale / cTokenUnit)
        int256 exchangeRate = int256(ICToken(asset).exchangeRateStored());

        return
            (answer * exchangeRate * CTOKEN_UNIT) /
            (underlyingUnit * EXP_SCALE);
    }
}
