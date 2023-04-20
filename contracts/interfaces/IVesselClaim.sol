// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

interface IVesselClaim {
    function claimVesselsAndKodas(
        uint256[] calldata otherdeedIds,
        uint256[] calldata kodaIds,
        uint256[] calldata kodaOtherdeedIds,
        bytes32[][] calldata merkleProofs
    ) external;

    function claimVessels(uint256[] calldata otherdeedIds) external;
}
