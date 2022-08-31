// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ILTVStrategy} from "../../interfaces/ILTVStrategy.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {INonfungiblePositionManager} from "../../dependencies/uniswap/INonfungiblePositionManager.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {ReserveConfiguration} from "../libraries/configuration/ReserveConfiguration.sol";

contract UniswapV3LTVStrategy is ILTVStrategy {
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

    mapping(address => mapping(address => uint16)) ltv;

    IPoolAddressesProvider internal immutable _addressesProvider;
    IPool internal immutable _pool;
    INonfungiblePositionManager immutable UNISWAP_V3_POSITION_MANAGER;

    /**
     * @dev Only pool admin can call functions marked by this modifier.
     **/
    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    constructor(address _manager, IPoolAddressesProvider provider) {
        _addressesProvider = provider;
        _pool = IPool(_addressesProvider.getPool());
        UNISWAP_V3_POSITION_MANAGER = INonfungiblePositionManager(_manager);
    }

    function setLTV(
        address tokenA,
        address tokenB,
        uint16 _ltv
    ) external onlyPoolAdmin {
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        ltv[token0][token1] = _ltv;
    }

    function getLTV(uint256 tokenId) external view returns (uint256) {
        (
            ,
            ,
            address token0,
            address token1,
            ,
            ,
            ,
            ,
            ,
            ,
            ,

        ) = UNISWAP_V3_POSITION_MANAGER.positions(tokenId);

        uint256 retLtv = ltv[token0][token1];
        if (retLtv == 0) {
            DataTypes.ReserveConfigurationMap memory configuration0 = _pool
                .getConfiguration(token0);
            (uint256 ltv0, , , , , ) = configuration0.getParams();

            DataTypes.ReserveConfigurationMap memory configuration1 = _pool
                .getConfiguration(token1);
            (uint256 ltv1, , , , , ) = configuration1.getParams();
            retLtv = ltv0 > ltv1 ? ltv1 : ltv0;
        }
        return retLtv;
    }

    function _onlyPoolAdmin() internal view {
        IACLManager aclManager = IACLManager(
            _addressesProvider.getACLManager()
        );
        require(
            aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }
}
