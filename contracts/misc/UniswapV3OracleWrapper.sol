// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";
import {IParaSpaceOracle} from "../interfaces/IParaSpaceOracle.sol";
import {IUniswapV3Factory} from "../dependencies/uniswap/IUniswapV3Factory.sol";
import {INonfungiblePositionManager} from "../dependencies/uniswap/INonfungiblePositionManager.sol";
import {LiquidityAmounts} from "../dependencies/uniswap/LiquidityAmounts.sol";
import {TickMath} from "../dependencies/uniswap/libraries/TickMath.sol";
import {SqrtLib} from "../dependencies/math/SqrtLib.sol";
import {IERC20Detailed} from "../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

contract UniswapV3OracleWrapper is IAtomicPriceAggregator {
    IUniswapV3Factory immutable UNISWAP_V3_FACTORY;
    INonfungiblePositionManager immutable UNISWAP_V3_POSITION_MANAGER;
    IParaSpaceOracle immutable PARASPACE_ORACLE;

    constructor(
        address _factory,
        address _manager,
        address _oracle
    ) {
        UNISWAP_V3_FACTORY = IUniswapV3Factory(_factory);
        UNISWAP_V3_POSITION_MANAGER = INonfungiblePositionManager(_manager);
        PARASPACE_ORACLE = IParaSpaceOracle(_oracle);
    }

    // get token price
    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        DataTypes.UinswapV3PositionData memory positionData;

        (
            ,
            ,
            positionData.tokenA,
            positionData.tokenB,
            positionData.fee,
            positionData.tickLower,
            positionData.tickUpper,
            positionData.liquidity,
            ,
            ,
            ,

        ) = UNISWAP_V3_POSITION_MANAGER.positions(tokenId);

        positionData.priceA = PARASPACE_ORACLE.getAssetPrice(
            positionData.tokenA
        );
        positionData.priceB = PARASPACE_ORACLE.getAssetPrice(
            positionData.tokenB
        );

        positionData.tokenADecimal = IERC20Detailed(positionData.tokenA)
            .decimals();
        positionData.tokenBDecimal = IERC20Detailed(positionData.tokenB)
            .decimals();

        // TODO using bit shifting for the 2^96
        uint160 sqrtPriceX96;

        if (positionData.tokenBDecimal == positionData.tokenADecimal) {
            // multiply by 10^18 then divide by 10^9 to preserve price in wei
            sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    ((positionData.priceA * (10**18)) / (positionData.priceB))
                ) * 2**96) / 10**9
            );
        } else if (positionData.tokenBDecimal > positionData.tokenADecimal) {
            // multiple by 10^(decimalB - decimalA) to preserve price in wei
            sqrtPriceX96 = uint160(
                SqrtLib.sqrt(
                    (positionData.priceA *
                        (10 **
                            (positionData.tokenBDecimal -
                                positionData.tokenADecimal))) /
                        (positionData.priceB)
                ) * 2**96
            );
        } else {
            // multiple by 10^(decimalA - decimalB) to preserve price in wei then divid by the same number
            sqrtPriceX96 = uint160(
                (SqrtLib.sqrt(
                    (positionData.priceA *
                        (10 **
                            (positionData.tokenADecimal -
                                positionData.tokenBDecimal))) /
                        (positionData.priceB)
                ) * 2**96) /
                    10 **
                        (positionData.tokenADecimal -
                            positionData.tokenBDecimal)
            );
        }

        (positionData.amountA, positionData.amountB) = LiquidityAmounts
            .getAmountsForLiquidity(
                sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(positionData.tickLower),
                TickMath.getSqrtRatioAtTick(positionData.tickUpper),
                positionData.liquidity
            );

        return
            ((positionData.amountA * positionData.priceA) /
                10**positionData.tokenADecimal) +
            ((positionData.amountB * positionData.priceB) /
                10**positionData.tokenBDecimal);
    }

    // get list of tokens prices
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

    function latestAnswer() external view returns (int256) {
        return 0;
    }
}
