// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IPriceOracleGetter} from "../interfaces/IPriceOracleGetter.sol";
import {ICLSynchronicityPriceAdapter} from "../dependencies/chainlink/ICLSynchronicityPriceAdapter.sol";
import {IUniswapV2Pair} from "../dependencies/uniswapv2/interfaces/IUniswapV2Pair.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {SqrtLib} from "../dependencies/math/SqrtLib.sol";
import "../dependencies/openzeppelin/contracts/SafeCast.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";

contract UniswapV2OracleWrapper is ICLSynchronicityPriceAdapter {
    using SafeCast for uint256;

    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    address immutable underlyingAsset;
    address immutable token0;
    address immutable token1;
    uint8 immutable token0Decimal;
    uint8 immutable token1Decimal;
    uint256 immutable KLIMIT;

    constructor(address _underlyingAsset, address _addressProvider) {
        underlyingAsset = _underlyingAsset;
        token0 = IUniswapV2Pair(_underlyingAsset).token0();
        token1 = IUniswapV2Pair(_underlyingAsset).token1();
        token0Decimal = IERC20Detailed(token0).decimals();
        token1Decimal = IERC20Detailed(token1).decimals();
        KLIMIT = (10 ** token0Decimal) * (10 ** token1Decimal);

        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
    }

    /// @inheritdoc ICLSynchronicityPriceAdapter
    function latestAnswer() public view virtual override returns (int256) {
        (uint256 _reserve0, uint256 _reserve1, ) = IUniswapV2Pair(
            underlyingAsset
        ).getReserves();
        uint256 K = _reserve0 * _reserve1;
        require(K > KLIMIT, Errors.INVALID_LIQUIDITY);

        IPriceOracleGetter oracle = IPriceOracleGetter(
            ADDRESSES_PROVIDER.getPriceOracle()
        );
        uint256 token0Price = oracle.getAssetPrice(token0);
        uint256 token1Price = oracle.getAssetPrice(token1);
        uint256 poolValue = SqrtLib.sqrt(
            (K * token0Price * token1Price) /
                10 ** token0Decimal /
                10 ** token1Decimal
        ) * 2;

        uint256 totalSupply = IERC20(underlyingAsset).totalSupply();
        uint256 _kLast = IUniswapV2Pair(underlyingAsset).kLast();
        if (_kLast > 0) {
            uint rootK = SqrtLib.sqrt(K);
            uint rootKLast = SqrtLib.sqrt(_kLast);
            if (rootK > rootKLast) {
                uint numerator = totalSupply * (rootK - rootKLast);
                uint denominator = rootK * 5 + rootKLast;
                uint liquidity = numerator / denominator;
                totalSupply += liquidity;
            }
        }
        uint256 price = (poolValue * 1e18) / totalSupply;

        return price.toInt256();
    }
}
