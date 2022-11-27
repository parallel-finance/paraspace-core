pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import {PriceOracle} from "../../../contracts/mocks/oracle/PriceOracle.sol"; 

contract FallbackOracleDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        uint256 USDPriceInWEI = 5848466240000000;
        PriceOracle oracle = new PriceOracle();
        config.updateAddress(Contracts.PriceOracle, address(oracle));
        oracle.setEthUsdPrice(USDPriceInWEI);

        uint256 t = config.erc20TokensLength();
        for(uint256 i = 0; i < t; i++) {
            bytes32 token = config.erc20Tokens(i);
            uint256 price = config.getTokenConfig(token).mockPrice;
            address addr = config.contractAddresses(token);
            oracle.setAssetPrice(addr, price);
        }

        t = config.erc721TokensLength();
        for(uint256 i = 0; i < t; i++) {
            bytes32 token = config.erc721Tokens(i);
            uint256 price = config.getTokenConfig(token).mockPrice;
            address addr = config.contractAddresses(token);
            oracle.setAssetPrice(addr, price);
        }
    }
}
