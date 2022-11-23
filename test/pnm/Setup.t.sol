pragma solidity ^0.8.10;

import "forge-std/Test.sol";
import {ParaspaceConfig} from "./helpers/Common.sol";
import {ERC20Deployer} from "./deployers/01_ERC20Deployer.sol";
import {ERC721Deployer} from "./deployers/02_ERC721Deployer.sol";
import {FaucetDeployer} from "./deployers/03_FaucetDeployer.sol";

contract Setup is Test {
    function setUp() public {
        ParaspaceConfig config = new ParaspaceConfig();
        new ERC20Deployer(config).deploy();
        new ERC721Deployer(config).deploy();
        new FaucetDeployer(config).deploy();
    }

    function testTruthy() public {
        assertEq(true, true);
    }
}
