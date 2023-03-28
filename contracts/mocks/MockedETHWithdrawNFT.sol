// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import "./tokens/MintableERC1155.sol";
import "../misc/interfaces/IInstantWithdrawNFT.sol";

contract MockedETHWithdrawNFT is MintableERC1155, IInstantWithdrawNFT {
    uint256 internal startTime;
    uint256 internal endTime;
    constructor() {
        startTime = block.timestamp;
        endTime = block.timestamp + 86400;
    }

    function getPresentValueAndDiscountRate(uint256, uint256, uint256)
    external
    view
    returns (uint256, uint256) {
        return (_getPresentValue(), 9000);
    }

    function getPresentValueByDiscountRate(
        uint256,
        uint256,
        uint256
    ) external view returns (uint256) {
        return _getPresentValue();
    }

    function burn(uint256 tokenId, address, uint256 amount) external {
        _burn(msg.sender, tokenId, amount);
    }

    function _getPresentValue() internal view returns(uint256) {
        return (block.timestamp - startTime) * 1e12 + 1e18;
    }

    function getTokenInfo(uint256 tokenId)
        external
        view
        returns (TokenInfo memory) {

        }

    function setProviderStrategyAddress(
        StakingProvider provider,
        address strategy
    ) external {}

    function mint(
        StakingProvider provider,
        uint64 exitEpoch,
        uint64 withdrawableEpoch,
        uint256 balance,
        address recipient,
        uint256 withdrawableTime
    ) external returns (uint256) {}
}
