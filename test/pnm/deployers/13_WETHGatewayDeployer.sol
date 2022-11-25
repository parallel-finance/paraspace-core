pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";
import {WETHGateway} from "../../../contracts/ui/WETHGateway.sol";
import {InitializableImmutableAdminUpgradeabilityProxy} from "../../../contracts/protocol/libraries/paraspace-upgradeability/InitializableImmutableAdminUpgradeabilityProxy.sol";

contract WETHGatewayDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        IPoolAddressesProvider provider = IPoolAddressesProvider(
            config.contractAddresses(Contracts.PoolAddressesProvider)
        );
        address pool = provider.getPool();

        address weth = config.contractAddresses("WETH");
        WETHGateway gateway = new WETHGateway(weth, pool);
        InitializableImmutableAdminUpgradeabilityProxy proxy = new InitializableImmutableAdminUpgradeabilityProxy(
                address(0)
            );
        proxy.initialize(
            address(gateway),
            bytes.concat(gateway.initialize.selector)
        );
        config.updateAddress(Contracts.WETHGatewayProxy, address(proxy));
    }
}
