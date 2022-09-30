// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IDynamicConfigsStrategy} from "../../interfaces/IDynamicConfigsStrategy.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {INonfungiblePositionManager} from "../../dependencies/uniswap/INonfungiblePositionManager.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";

contract UniswapV3DynamicConfigsStrategy is IDynamicConfigsStrategy {
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

    struct DynamicConfigsParams {
        address token0;
        address token1;
        uint256 token0Ltv;
        uint256 token0LiquidationThreshold;
        uint256 token1Ltv;
        uint256 token1LiquidationThreshold;
        uint256 ltv;
        uint256 liquidationThreshold;
    }

    IPoolAddressesProvider internal immutable _addressesProvider;
    IPool internal immutable _pool;
    INonfungiblePositionManager immutable UNISWAP_V3_POSITION_MANAGER;

    constructor(address _manager, IPoolAddressesProvider provider) {
        _addressesProvider = provider;
        _pool = IPool(_addressesProvider.getPool());
        UNISWAP_V3_POSITION_MANAGER = INonfungiblePositionManager(_manager);
    }

    function getConfigParams(uint256 tokenId)
        external
        view
        override
        returns (uint256 ltv, uint256 liquidationThreshold)
    {
        DynamicConfigsParams memory vars;
        (
            ,
            ,
            vars.token0,
            vars.token1,
            ,
            ,
            ,
            ,
            ,
            ,
            ,

        ) = UNISWAP_V3_POSITION_MANAGER.positions(tokenId);

        DataTypes.ReserveConfigurationMap memory token0Configs = _pool
            .getConfiguration(vars.token0);
        DataTypes.ReserveConfigurationMap memory token1Configs = _pool
            .getConfiguration(vars.token1);

        (
            vars.token0Ltv,
            vars.token0LiquidationThreshold,
            ,
            ,
            ,

        ) = token0Configs.getParams();
        (
            vars.token1Ltv,
            vars.token1LiquidationThreshold,
            ,
            ,
            ,

        ) = token1Configs.getParams();

        vars.ltv = vars.token0Ltv < vars.token1Ltv
            ? vars.token0Ltv
            : vars.token1Ltv;
        vars.liquidationThreshold = vars.token0LiquidationThreshold <
            vars.token1LiquidationThreshold
            ? vars.token0LiquidationThreshold
            : vars.token1LiquidationThreshold;

        return (vars.ltv, vars.liquidationThreshold);
    }
}
