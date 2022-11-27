pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import {NFTFloorOracle} from "../../../contracts/misc/NFTFloorOracle.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";
import {MockAggregator} from "../../../contracts/mocks/oracle/CLAggregators/MockAggregator.sol";
import {ParaSpaceOracle} from "../../../contracts/misc/ParaSpaceOracle.sol";

contract AllAggregatorDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        NFTFloorOracle oracle = new NFTFloorOracle();
        address[] memory feeders = new address[](3);
        feeders[0] = address(1);
        feeders[1] = address(2);
        feeders[2] = address(3);

        uint256 t = config.erc721TokensLength();
        address[] memory projects = new address[](t - 1);
        uint256 idx = 0;
        for (uint256 i = 0; i < t; i++) {
            bytes32 token = config.erc721Tokens(i);
            if (token == "UniswapV3") {
                continue;
            }
            address addr = config.contractAddresses(token);
            projects[idx] = addr;
            idx++;
        }
        oracle.initialize(config.deployer(), feeders, projects);

        address providerAddr = config.contractAddresses(
            Contracts.PoolAddressesProvider
        );
        IPoolAddressesProvider provider = IPoolAddressesProvider(providerAddr);

        uint256 erc20s = config.erc20TokensLength();
        uint256 erc721s = config.erc721TokensLength();
        address[] memory tokenAddresses = new address[](erc20s + erc721s - 2);
        address[] memory aggregatorAddresses = new address[](
            erc20s + erc721s - 2
        );
        idx = 0;

        for (uint256 i = 0; i < erc20s; i++) {
            bytes32 token = config.erc20Tokens(i);
            if (token == "WETH") {
                continue;
            }
            int256 price = int256(config.getTokenConfig(token).mockPrice);
            MockAggregator aggregator = new MockAggregator(price);
            tokenAddresses[idx] = config.contractAddresses(token);
            aggregatorAddresses[idx] = address(aggregator);
            idx++;
        }

        for (uint256 i = 0; i < erc721s; i++) {
            bytes32 token = config.erc721Tokens(i);
            if (token == "UniswapV3") {
                //FIXME(alan): UniswapV3 factory
                continue;
            }
            int256 price = int256(config.getTokenConfig(token).mockPrice);
            MockAggregator aggregator = new MockAggregator(price);
            tokenAddresses[idx] = config.contractAddresses(token);
            aggregatorAddresses[idx] = address(aggregator);
            idx++;
        }

        address fallbackOracle = config.contractAddresses(
            Contracts.PriceOracle
        );
        address wethAddr = config.contractAddresses("WETH");
        ParaSpaceOracle paraSpaceOracle = new ParaSpaceOracle(
            provider,
            tokenAddresses,
            aggregatorAddresses,
            fallbackOracle,
            wethAddr,
            uint256(1e18)
        );
    }
}
