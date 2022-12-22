// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface ISudo {
    struct PairSwapSpecific {
        address pair;
        uint256[] nftIds;
    }

    function swapETHForSpecificNFTs(
        PairSwapSpecific[] calldata swapList,
        address payable ethRecipient,
        address nftRecipient,
        uint256 deadline
    ) external payable returns (uint256 remainingValue);

    function swapERC20ForSpecificNFTs(
        PairSwapSpecific[] calldata swapList,
        uint256 inputAmount,
        address nftRecipient,
        uint256 deadline
    ) external payable returns (uint256 remainingValue);
}
