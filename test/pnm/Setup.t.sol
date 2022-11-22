pragma solidity ^0.8.10;

import "forge-std/Test.sol";
import {ParaspaceConfig, ERC20Deployer, ERC721Deployer} from "./helpers/Common.t.sol";

contract Setup is Test {
    function setup() public {
        ParaspaceConfig config = new ParaspaceConfig();
        new ERC20Deployer(config).deploy();
        new ERC721Deployer(config).deploy();
    }
}
