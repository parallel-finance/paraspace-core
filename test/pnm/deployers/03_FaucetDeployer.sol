pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import {MockTokenFaucet} from "../../../contracts/mocks/tokens/MockTokenFaucet.sol";
import {StringUtils} from "../helpers/StringUtils.sol";

contract FaucetDeployer is Deployer {
    using StringUtils for string;

    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        uint256 t = config.erc20TokensLength();
        MockTokenFaucet.Token[] memory erc20 = new MockTokenFaucet.Token[](t);
        for (uint256 i = 0; i < t; i++) {
            bytes32 token = config.erc20Tokens(i);
            string memory name = string(abi.encodePacked(token));
            address addr = config.contractAddresses(token);
            uint256 mintValue = config.getTokenConfig(token).faucetMintValue;
            erc20[i] = (MockTokenFaucet.Token(name, addr, mintValue));
        }

        t = config.erc721TokensLength();
        MockTokenFaucet.Token[] memory erc721 = new MockTokenFaucet.Token[](t);
        for (uint256 i = 0; i < t; i++) {
            bytes32 token = config.erc721Tokens(i);
            string memory name = string(abi.encodePacked(token));
            address addr = config.contractAddresses(token);
            uint256 mintValue = config.getTokenConfig(token).faucetMintValue;
            erc721[i] = (MockTokenFaucet.Token(name, addr, mintValue));
        }

        address addr = config.contractAddresses("PUNKS");
        uint256 mintValue = config.getTokenConfig("PUNKS").faucetMintValue;
        MockTokenFaucet.Token memory punks = (
            MockTokenFaucet.Token("PUNKS", addr, mintValue)
        );

        MockTokenFaucet faucet = new MockTokenFaucet(erc20, erc721, punks);
        config.updateAddress(Contracts.MockTokenFaucet, address(faucet));
    }
}
