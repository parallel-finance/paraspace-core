pragma solidity ^0.8.10;

import "forge-std/Test.sol";
import {ParaspaceConfig} from "./helpers/Common.sol";
import {ERC20Deployer} from "./deployers/01_ERC20Deployer.sol";
import {ERC721Deployer} from "./deployers/02_ERC721Deployer.sol";
import {FaucetDeployer} from "./deployers/03_FaucetDeployer.sol";
import {AddressesProviderDeployer} from "./deployers/04_AddressProviderDeployer.sol";
import {ACLManagerDeployer} from "./deployers/05_ACLManagerDeployer.sol";
import {PoolDeployer} from "./deployers/06_PoolDeployer.sol";
import {PoolConfiguratorDeployer} from "./deployers/07_PoolConfiguratorDeployer.sol";
import {ReservesSetupHelperDeployer} from "./deployers/08_ReservesSetupHelperDeployer.sol";
import {FallbackOracleDeployer} from "./deployers/09_FallbackOracleDeployer.sol";
import {UiIncentiveDataProviderDeployer} from "./deployers/12_UiIncentiveDataProviderDeployer.sol";
import {WETHGatewayDeployer} from "./deployers/13_WETHGatewayDeployer.sol";
import {PunkGatewayDeployer} from "./deployers/14_PunkGatewayDeployer.sol";

contract Setup is Test {
    function testSetUp() public {
        ParaspaceConfig config = new ParaspaceConfig();
        new ERC20Deployer(config).deploy();
        new ERC721Deployer(config).deploy();
        new FaucetDeployer(config).deploy();
        new AddressesProviderDeployer(config).deploy();
        new ACLManagerDeployer(config).deploy();
        new PoolDeployer(config).deploy();
        new PoolConfiguratorDeployer(config).deploy();
        new ReservesSetupHelperDeployer(config).deploy();
        new FallbackOracleDeployer(config).deploy();

        new UiIncentiveDataProviderDeployer(config).deploy();
        new WETHGatewayDeployer(config).deploy();
        new PunkGatewayDeployer(config).deploy();
    }
}
