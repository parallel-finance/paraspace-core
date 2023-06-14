// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";
import {SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../dependencies/openzeppelin/contracts/IERC1155.sol";
import {Helpers} from "../protocol/libraries/helpers/Helpers.sol";
import {Errors} from "../protocol/libraries/helpers/Errors.sol";

contract Airdropper is Ownable {
    using SafeERC20 for IERC20;

    constructor(address owner) {
        transferOwnership(owner);
    }

    function airdropERC20(
        address[] calldata tokens,
        address[] calldata tos,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(
            tokens.length == tos.length && tos.length == amounts.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        for (uint256 i = 0; i < tos.length; i++) {
            IERC20(tokens[i]).safeTransfer(tos[i], amounts[i]);
        }
    }

    function airdropERC721(
        address[] calldata tokens,
        address[] calldata tos,
        uint256[][] calldata idss
    ) external onlyOwner {
        require(
            tokens.length == tos.length && tos.length == idss.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        for (uint256 i = 0; i < tos.length; i++) {
            for (uint256 j = 0; j < idss.length; j++) {
                IERC721(tokens[i]).safeTransferFrom(
                    address(this),
                    tos[i],
                    idss[i][j]
                );
            }
        }
    }

    function airdropERC1155(
        address[] calldata tokens,
        address[] calldata tos,
        uint256[][] calldata idss,
        uint256[][] calldata amountss,
        bytes[] calldata payloads
    ) external onlyOwner {
        require(
            tokens.length == tos.length &&
                tos.length == idss.length &&
                idss.length == amountss.length &&
                amountss.length == payloads.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );
        for (uint256 i = 0; i < tos.length; i++) {
            IERC1155(tokens[i]).safeBatchTransferFrom(
                address(this),
                tos[i],
                idss[i],
                amountss[i],
                payloads[i]
            );
        }
    }

    function airdropETH(address[] calldata tos, uint256[] calldata amounts)
        external
        onlyOwner
    {
        require(
            tos.length == amounts.length,
            Errors.INCONSISTENT_PARAMS_LENGTH
        );

        for (uint256 i = 0; i < tos.length; i++) {
            Helpers.safeTransferETH(tos[i], amounts[i]);
        }
    }
}
