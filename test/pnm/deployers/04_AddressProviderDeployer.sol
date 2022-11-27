pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import "forge-std/Test.sol";

import {PoolAddressesProviderRegistry} from "../../../contracts/protocol/configuration/PoolAddressesProviderRegistry.sol";
import {PoolAddressesProvider} from "../../../contracts/protocol/configuration/PoolAddressesProvider.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";

contract AddressesProviderDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        address owner = address(config.deployer());
        PoolAddressesProviderRegistry registry = new PoolAddressesProviderRegistry(
                owner
            );

        PoolAddressesProvider provider = new PoolAddressesProvider(
            string(abi.encodePacked(config.marketId())),
            owner
        );

        registry.registerAddressesProvider(address(provider), 1);
        provider.setACLAdmin(owner);
        config.updateAddress(
            Contracts.PoolAddressesProvider,
            address(provider)
        );
    }
}
