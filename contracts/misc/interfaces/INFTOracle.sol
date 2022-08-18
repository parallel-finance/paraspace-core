// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

/************
@title INFTOracle interface
@notice Interface for NFT price oracle.*/
interface INFTOracle {
    /* CAUTION: Price uint is ETH based (WEI, 18 decimals) */
    // get asset price
    function getAssetPrice(address _nftContract)
        external
        view
        returns (uint256);
}
