// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {CurveErrorCodes} from "../dependencies/sudoswap/CurveErrorCodes.sol";

interface ILSSVMPair {
    function nft() external pure returns (IERC721 _nft);

    function token() external pure returns (IERC20 _token);

    function getBuyNFTQuote(uint256 numNFTs)
        external
        view
        returns (
            CurveErrorCodes.Error error,
            uint256 newSpotPrice,
            uint256 newDelta,
            uint256 inputAmount,
            uint256 protocolFee
        );

    function getAssetRecipient() external view returns (address payable);
}
