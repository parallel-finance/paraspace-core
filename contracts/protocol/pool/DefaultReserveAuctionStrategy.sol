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
    uint256 internal immutable _maxPriceMultiplier;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _minExpPriceMultiplier;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _minPriceMultiplier;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _stepLinearMultiplier;

    /**
     * Expressed in PRBMath.SCALE
     **/
    uint256 internal immutable _stepExp;

    uint256 internal immutable _tickLength;

    constructor(
        uint256 maxPriceMultiplier,
        uint256 minExpPriceMultiplier,
        uint256 minPriceMultiplier,
        uint256 stepLinearMultiplier,
        uint256 stepExp,
        uint256 tickLength
    ) {
        _maxPriceMultiplier = maxPriceMultiplier;
        _minExpPriceMultiplier = minExpPriceMultiplier;
        _minPriceMultiplier = minPriceMultiplier;
        _stepLinearMultiplier = stepLinearMultiplier;
        _stepExp = stepExp;
        _tickLength = tickLength;
    }

    function getMaxPriceMultiplier() external view returns (uint256) {
        return _maxPriceMultiplier;
    }

    function getMinExpPriceMultiplier() external view returns (uint256) {
        return _minExpPriceMultiplier;
    }

    function getMinPriceMultiplier() external view returns (uint256) {
        return _minPriceMultiplier;
    }

    function getStepLinearMultiplier() external view returns (uint256) {
        return _stepLinearMultiplier;
    }

    function getStepExp() external view returns (uint256) {
        return _stepExp;
    }

    function getTickLength() external view returns (uint256) {
        return _stepExp;
    }

    function calculateAuctionPriceMultiplier(
        uint256 auctionStartTimestamp,
        uint256 currentTimestamp
    ) public view override returns (uint256) {
        uint256 ticks = PRBMathUD60x18.div(
            currentTimestamp - auctionStartTimestamp,
            _tickLength
        );
        return _calculateAuctionPriceMultiplierByTicks(ticks);
    }

    function _calculateAuctionPriceMultiplierByTicks(uint256 ticks)
        internal
        view
        returns (uint256)
    {
        if (ticks < PRBMath.SCALE) {
            return _maxPriceMultiplier;
        }

        uint256 priceExpMultiplier = PRBMathUD60x18.div(
            _maxPriceMultiplier,
            PRBMathUD60x18.exp(_stepExp.mul(ticks))
        );

        if (priceExpMultiplier >= _minExpPriceMultiplier) {
            return priceExpMultiplier;
        }

        uint256 priceLastExpMultiplier = _calculateAuctionPriceMultiplierByTicks(
                ticks - PRBMath.SCALE
            );
        uint256 priceLinear = priceLastExpMultiplier - _stepLinearMultiplier;
        if (
            priceLinear > _minPriceMultiplier &&
            priceLinear < _minExpPriceMultiplier
        ) {
            return priceLinear;
        }

        return _minPriceMultiplier;
    }
}
