pragma solidity ^0.8.10;

import "../helpers/Common.sol";

import {MintableERC20} from "../../../contracts/mocks/tokens/MintableERC20.sol";
import {WETH9Mocked} from "../../../contracts/mocks/tokens/WETH9Mocked.sol";
import {stETH} from "../../../contracts/mocks/tokens/stETH.sol";
import {MockAToken} from "../../../contracts/mocks/tokens/MockAToken.sol";
import {CryptoPunksMarket} from "../../../contracts/mocks/tokens/CryptoPunksMarket.sol";
import {WPunk} from "../../../contracts/mocks/tokens/WrappedPunk/WPunk.sol";
import {BoredApeYachtClub} from "../../../contracts/mocks/tokens/BAYC.sol";
import {MutantApeYachtClub} from "../../../contracts/mocks/tokens/MAYC.sol";
import {MintableERC721} from "../../../contracts/mocks/tokens/MintableERC721.sol";
import {Doodles} from "../../../contracts/mocks/tokens/DOODLES.sol";
import {Azuki} from "../../../contracts/mocks/tokens/Azuki.sol";
import {CloneX} from "../../../contracts/mocks/tokens/CloneX.sol";
import {Meebits} from "../../../contracts/mocks/tokens/Meebits.sol";
import {Land} from "../../../contracts/mocks/tokens/Land.sol";
import {Moonbirds} from "../../../contracts/mocks/tokens/Moonbirds.sol";
import {IERC721} from "../../../contracts/mocks/tokens/dependencies/ERC721A.sol";
import {StringUtils} from "../helpers/StringUtils.sol";

contract ERC20Deployer is Deployer {
    using StringUtils for string;

    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override {
        uint256 t = config.erc20TokensLength();
        for (uint256 i = 0; i < t; i++) {
            bytes32 tokenSymbol = config.erc20Tokens(i);
            DataTypes.IReserveParams memory params = config.getTokenConfig(
                tokenSymbol
            );

            string memory symbol = string(abi.encodePacked(tokenSymbol));
            if (symbol.equal("WETH")) {
                WETH9Mocked token = new WETH9Mocked();
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("stETH")) {
                stETH token = new stETH(symbol, symbol, params.decimal);
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("aETH")) {
                MockAToken token = new MockAToken(
                    symbol,
                    symbol,
                    params.decimal
                );
                config.updateAddress(tokenSymbol, address(token));
            } else {
                MintableERC20 token = new MintableERC20(
                    symbol,
                    symbol,
                    params.decimal
                );
                config.updateAddress(tokenSymbol, address(token));
            }
        }
    }
}
