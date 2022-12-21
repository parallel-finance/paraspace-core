// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

interface ICryptoPunk {

    struct Offer {
        bool isForSale;
        uint256 punkIndex;
        address seller;
        uint256 minValue;
        address onlySellTo;
    }

    function punkIndexToAddress(uint256 punkIndex) external view returns (address);

    function punksOfferedForSale(uint256 punkIndex)
        external
        view
        returns (Offer memory);

    function buyPunk(uint256 punkIndex) external payable;

    function transferPunk(address to, uint256 punkIndex) external;
}
