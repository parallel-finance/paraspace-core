// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

interface IInstantWithdrawNFT {
    function getPresentValueAndDiscountRate(
        uint256 tokenId,
        uint256 amount,
        uint256 borrowRate
    ) external view returns (uint256, uint256);

    function getPresentValueByDiscountRate(
        uint256 tokenId,
        uint256 amount,
        uint256 discountRate
    ) external view returns (uint256);

    function burn(
        uint256 tokenId,
        address recipient,
        uint256 amount
    ) external;
}
