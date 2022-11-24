pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import "forge-std/Test.sol";

import {PoolCore} from "../../../contracts/protocol/pool/PoolCore.sol";
import {PoolParameters} from "../../../contracts/protocol/pool/PoolParameters.sol";
import {PoolMarketplace} from "../../../contracts/protocol/pool/PoolMarketplace.sol";
import {PoolApeStaking} from "../../../contracts/protocol/pool/PoolApeStaking.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";
import {IParaProxy} from "../../../contracts/interfaces/IParaProxy.sol";

contract PoolDeployer is Deployer {
    constructor (ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        IPoolAddressesProvider provider = IPoolAddressesProvider(config.contractAddresses("PoolAddressesProvider"));
        PoolCore poolCore = new PoolCore(provider); 
        PoolParameters poolParameters = new PoolParameters(provider);
        PoolMarketplace poolMarketplace = new PoolMarketplace(provider);
        PoolApeStaking poolApeStaking = new PoolApeStaking(provider);

        string[] memory inputs = new string[](2);
        inputs[0] = "test/pnm/helpers/sig-list.js";

        inputs[1] = "out/PoolCore.sol/PoolCore.json";
        bytes4[] memory poolCoreSignatures = abi.decode(vm.ffi(inputs), (bytes4[]));

        inputs[1] = "out/PoolParameters.sol/PoolParameters.json";
        bytes4[] memory poolParametersSignatures = abi.decode(vm.ffi(inputs), (bytes4[]));

        inputs[1] = "out/PoolMarketplace.sol/PoolMarketplace.json";
        bytes4[] memory poolMarketplaceSignatures = abi.decode(vm.ffi(inputs), (bytes4[]));

        inputs[1] = "out/PoolApeStaking.sol/PoolApeStaking.json";
        bytes4[] memory poolApeStakingSignatures = abi.decode(vm.ffi(inputs), (bytes4[]));


        IParaProxy.ProxyImplementation[]
            memory implementationParams0 = new IParaProxy.ProxyImplementation[](
                1
            );

        // update poolParameters impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolParameters),
            IParaProxy.ProxyImplementationAction.Add,
            poolParametersSignatures
        );
        provider.updatePoolImpl(implementationParams0, address(0), bytes(""));

        // update poolMarketplace impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolMarketplace),
            IParaProxy.ProxyImplementationAction.Add,
            poolMarketplaceSignatures
        );
        provider.updatePoolImpl(implementationParams0, address(0), bytes(""));

        // update poolApeStaking impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolApeStaking),
            IParaProxy.ProxyImplementationAction.Add,
            poolApeStakingSignatures
        );
        provider.updatePoolImpl(implementationParams0, address(0), bytes(""));

        // update poolCore impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolCore),
            IParaProxy.ProxyImplementationAction.Add,
            poolCoreSignatures
        );
        bytes memory _calldata = abi.encodeWithSelector(
            poolCore.initialize.selector,
            address(provider)
        );
        address poolAddress = provider.getPool();
        provider.updatePoolImpl(
            implementationParams0,
            poolAddress,
            _calldata
        );
    }
}
