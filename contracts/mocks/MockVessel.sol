// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

import {MintableERC721} from "./tokens/MintableERC721.sol";

contract MockVessel is MintableERC721 {

    MintableERC721 immutable KODA;
    MintableERC721 immutable OTHRE;
    MintableERC721 immutable OTHR;

    constructor(MintableERC721 otherdeed, MintableERC721 kodaAddress, MintableERC721 otherdeedExpAddress) MintableERC721("VESSEL", "VSL", "") {
        OTHR = otherdeed;
        KODA = kodaAddress;
        OTHRE = otherdeedExpAddress;
    }

    function claimVesselsAndKodas(
        uint256[] calldata otherdeedIds,
        uint256[] calldata kodaIds,
        uint256[] calldata kodaOtherdeedIds,
        bytes32[][] calldata merkleProofs
    )
    external {
        
        for (uint256 index = 0; index < otherdeedIds.length; index++) {
            mintTokenId(msg.sender, otherdeedIds[index]);
            OTHRE.mintTokenId(msg.sender, otherdeedIds[index]);

            OTHR.transferFrom(msg.sender, 0x000000000000000000000000000000000000dEaD, otherdeedIds[index]);
        }

        for (uint256 index = 0; index < kodaIds.length; index++) {
            KODA.mintTokenId(msg.sender, kodaIds[index]);
        }
    }


    function claimVessels(uint256[] calldata otherdeedIds)
    external {
        for (uint256 index = 0; index < otherdeedIds.length; index++) {
            mintTokenId(msg.sender, otherdeedIds[index]);
            OTHRE.mintTokenId(msg.sender, otherdeedIds[index]);

            OTHR.transferFrom(msg.sender, 0x000000000000000000000000000000000000dEaD, otherdeedIds[index]);
        }
    }
}