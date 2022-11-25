pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import "forge-std/Test.sol";

import {ACLManager} from "../../../contracts/protocol/configuration/ACLManager.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";

contract ACLManagerDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}
    
    function deploy() public override FromDeployer {
        address providerAddr = config.contractAddresses("PoolAddressesProvider");
        IPoolAddressesProvider provider = IPoolAddressesProvider(providerAddr);

        ACLManager manager = new ACLManager(provider); 
        provider.setACLManager(address(manager));

        address owner = config.deployer();
        manager.addPoolAdmin(owner);
        manager.addAssetListingAdmin(owner);
        manager.addEmergencyAdmin(owner);
        manager.addRiskAdmin(owner);
    }
}
