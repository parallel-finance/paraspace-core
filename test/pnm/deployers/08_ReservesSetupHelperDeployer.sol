pragma solidity ^0.8.10;

import "../helpers/Common.sol";

import {ReservesSetupHelper} from "../../../contracts/deployments/ReservesSetupHelper.sol";

contract ReservesSetupHelperDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}
    function deploy() public override FromDeployer {
        ReservesSetupHelper helper = new ReservesSetupHelper();
        config.updateAddress(Contracts.ReservesSetupHelper, address(helper));
    }
}
