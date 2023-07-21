// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract ParaAccount is ERC721 {

    constructor() ERC721("ParaAccount", "PACT") {

    }

}