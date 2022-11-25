pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import {UiIncentiveDataProvider} from "../../../contracts/ui/UiIncentiveDataProvider.sol";

contract UiIncentiveDataProviderDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        UiIncentiveDataProvider provider = new UiIncentiveDataProvider();
    }
}
