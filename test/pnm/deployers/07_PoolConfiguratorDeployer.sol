pragma solidity ^0.8.10;

import "forge-std/Test.sol";
import "../helpers/Common.sol";

import {PoolConfigurator} from "../../../contracts/protocol/pool/PoolConfigurator.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";

contract PoolConfiguratorDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        address proivderAddr = config.contractAddresses(
            Contracts.PoolAddressesProvider
        );
        IPoolAddressesProvider provider = IPoolAddressesProvider(proivderAddr);

        PoolConfigurator configurator = new PoolConfigurator();
        provider.setPoolConfiguratorImpl(address(configurator));

        PoolConfigurator configuratorProxy = PoolConfigurator(
            provider.getPoolConfigurator()
        );
        configuratorProxy.setAuctionRecoveryHealthFactor(
            config.auctionRecoveryHealthFactor()
        );
    }
}
