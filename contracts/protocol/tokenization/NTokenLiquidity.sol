// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IERC721Metadata} from "../../dependencies/openzeppelin/contracts/IERC721Metadata.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {NToken} from "./NToken.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IWETH} from "../../misc/interfaces/IWETH.sol";
import {INTokenLiquidity} from "../../interfaces/INTokenLiquidity.sol";
import {Helpers} from "../../protocol/libraries/helpers/Helpers.sol";

/**
 * @title NTokenLiquidity
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
abstract contract NTokenLiquidity is NToken, INTokenLiquidity {
    using SafeERC20 for IERC20;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address delegateRegistry)
        NToken(pool, true, delegateRegistry)
    {
        _ERC721Data.balanceLimit = 30;
    }

    function _decreaseLiquidity(
        address,
        uint256,
        uint128,
        uint256,
        uint256,
        bool
    ) internal virtual {}

    /// @inheritdoc INTokenLiquidity
    function decreaseLiquidity(
        address user,
        uint256 tokenId,
        uint128 liquidityDecrease,
        uint256 amount0Min,
        uint256 amount1Min,
        bool receiveEthAsWeth
    ) external onlyPool nonReentrant {
        require(user == ownerOf(tokenId), Errors.NOT_THE_OWNER);

        _decreaseLiquidity(
            user,
            tokenId,
            liquidityDecrease,
            amount0Min,
            amount1Min,
            receiveEthAsWeth
        );
    }

    function transferTokenOut(
        address user,
        address token,
        uint256 amount,
        address weth
    ) internal {
        if (token == weth) {
            IWETH(weth).withdraw(amount);
            Helpers.safeTransferETH(user, amount);
        } else {
            IERC20(token).safeTransfer(user, amount);
        }
    }

    function setTraitsMultipliers(uint256[] calldata, uint256[] calldata)
        external
        override
        onlyPoolAdmin
        nonReentrant
    {
        revert();
    }

    receive() external payable {}
}
