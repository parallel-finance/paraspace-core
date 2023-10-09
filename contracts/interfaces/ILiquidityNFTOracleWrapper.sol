// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";
import {ILiquidityNFTPositionInfoProvider} from "../interfaces/ILiquidityNFTPositionInfoProvider.sol";

interface ILiquidityNFTOracleWrapper is
    IAtomicPriceAggregator,
    ILiquidityNFTPositionInfoProvider
{}
