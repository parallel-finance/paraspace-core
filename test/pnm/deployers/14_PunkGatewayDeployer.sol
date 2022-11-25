pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";
import {WPunkGateway} from "../../../contracts/ui/WPunkGateway.sol";
import {InitializableImmutableAdminUpgradeabilityProxy} from "../../../contracts/protocol/libraries/paraspace-upgradeability/InitializableImmutableAdminUpgradeabilityProxy.sol";

contract PunkGatewayDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        address punksAddr = config.contractAddresses("PUNKS");
        address wPunksAddr = config.contractAddresses("WPUNKS");
        address providerAddr = config.contractAddresses(
            Contracts.PoolAddressesProvider
        );

        IPoolAddressesProvider provider = IPoolAddressesProvider(providerAddr);
        address pool = provider.getPool();

        WPunkGateway gateway = new WPunkGateway(punksAddr, wPunksAddr, pool);
        InitializableImmutableAdminUpgradeabilityProxy proxy = new InitializableImmutableAdminUpgradeabilityProxy(
                address(0)
            );

        proxy.initialize(
            address(gateway),
            bytes.concat(gateway.initialize.selector)
        );
    }
}
