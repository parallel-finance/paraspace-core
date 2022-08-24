// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ILTVStrategy} from "../../interfaces/ILTVStrategy.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {INonfungiblePositionManager} from "../../dependencies/uniswap/INonfungiblePositionManager.sol";
import {Errors} from "../libraries/helpers/Errors.sol";

contract UniswapV3LTVStrategy is ILTVStrategy {
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
        address token0,
        address token1,
        uint16 _ltv
    ) external onlyPoolAdmin {
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
        return ltv[token0][token1];
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
