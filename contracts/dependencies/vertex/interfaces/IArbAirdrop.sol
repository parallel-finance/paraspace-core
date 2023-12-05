// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

interface IArbAirdrop {
    event ClaimArb(address indexed account, uint32 week, uint256 amount);

    struct ClaimProof {
        uint32 week;
        uint256 totalAmount;
        bytes32[] proof;
    }

    function claim(ClaimProof[] calldata claimProofs) external;

    function getClaimed(address account)
        external
        view
        returns (uint256[] memory);
}
