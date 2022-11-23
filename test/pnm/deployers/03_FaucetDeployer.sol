pragma solidity ^0.8.10;

import "../helpers/Common.sol";

contract FaucetDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override {}
}
