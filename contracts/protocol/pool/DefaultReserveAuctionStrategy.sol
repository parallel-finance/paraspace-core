// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {PercentageMath} from "../libraries/math/PercentageMath.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IReserveAuctionStrategy} from "../../interfaces/IReserveAuctionStrategy.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IToken} from "../../interfaces/IToken.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {PRBMathUD60x18} from "../../dependencies/math/PRBMathUD60x18.sol";
import {PRBMath} from "../../dependencies/math/PRBMath.sol";

/**
 * @title DefaultReserveAuctionStrategy contract
 *
 * @notice Implements the calculation of the current dutch auction price
 **/
contract DefaultReserveAuctionStrategy is IReserveAuctionStrategy {
    using PRBMathUD60x18 for uint256;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _maxPriceRatio;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _minExpPriceRatio;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _minPriceRatio;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _stepLinearRatio;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _stepExp;

    uint256 internal immutable _tickLength;

    constructor(
        uint256 maxPriceRatio,
        uint256 minExpPriceRatio,
        uint256 minPriceRatio,
        uint256 stepLinearRatio,
        uint256 stepExp,
        uint256 tickLength
    ) {
        _maxPriceRatio = maxPriceRatio;
        _minExpPriceRatio = minExpPriceRatio;
        _minPriceRatio = minPriceRatio;
        _stepLinearRatio = stepLinearRatio;
        _stepExp = stepExp;
        _tickLength = tickLength;
    }

    function getMaxPriceRatio() external view returns (uint256) {
        return _maxPriceRatio;
    }

    function getMinExpPriceRatio() external view returns (uint256) {
        return _minExpPriceRatio;
    }

    function getMinPriceRatio() external view returns (uint256) {
        return _minPriceRatio;
    }

    function getStepLinearRatio() external view returns (uint256) {
        return _stepLinearRatio;
    }

    function getStepExp() external view returns (uint256) {
        return _stepExp;
    }

    function getTickLength() external view returns (uint256) {
        return _stepExp;
    }

    function calculateAuctionPrice(
        uint256 auctionStartTimestamp,
        uint256 currentTimestamp
    ) public view override returns (uint256) {
        uint256 ticks = PRBMathUD60x18.div(
            currentTimestamp - auctionStartTimestamp,
            _tickLength
        );
        if (ticks < PRBMath.SCALE) {
            return _maxPriceRatio;
        }

        uint256 priceExpRatio = PRBMathUD60x18.div(
            _maxPriceRatio,
            PRBMathUD60x18.exp(_stepExp.mul(ticks))
        );

        if (priceExpRatio >= _minExpPriceRatio) {
            return priceExpRatio;
        }

        uint256 priceLastExpRatio = calculateAuctionPrice(
            auctionStartTimestamp,
            currentTimestamp - _tickLength
        );
        uint256 priceLinear = priceLastExpRatio - _stepLinearRatio;
        if (priceLinear > _minPriceRatio && priceLinear < _minExpPriceRatio) {
            return priceLinear;
        }

        return _minPriceRatio;
    }
}
