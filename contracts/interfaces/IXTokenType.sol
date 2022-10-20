// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

/**
 * @title IXTokenType
 * @author ParallelFi
 * @notice Defines the basic interface for an IXTokenType.
 **/
enum XTokenType {
    NoneType, // unused
    NTokenType,
    NTokenMoonBirdsType,
    NTokenUniswapV3Type,
    PTokenType,
    DelegationAwarePTokenType,
    RebasingPTokenType,
    PTokenATokenType,
    PTokenStETHType
}

interface IXTokenType {
    /**
     * @notice return token type`of xToken
     **/
    function getXTokenType() external pure returns (XTokenType);
}
