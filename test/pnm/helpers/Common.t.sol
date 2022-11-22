pragma solidity ^0.8.10;

import {MintableERC20} from "../../../contracts/mocks/tokens/MintableERC20.sol";
import {WETH9Mocked} from "../../../contracts/mocks/tokens/WETH9Mocked.sol";
import {stETH} from "../../../contracts/mocks/tokens/stETH.sol";
import {MockAToken} from "../../../contracts/mocks/tokens/MockAToken.sol";
import {CryptoPunksMarket} from "../../../contracts/mocks/tokens/CryptoPunksMarket.sol";
import {WPunk} from "../../../contracts/mocks/tokens/WrappedPunk/WPunk.sol";
import {BoredApeYachtClub} from "../../../contracts/mocks/tokens/BAYC.sol";
import {MutantApeYachtClub} from "../../../contracts/mocks/tokens/MAYC.sol";
import {MintableERC721} from "../../../contracts/mocks/tokens/MintableERC721.sol";
import {StringUtils} from "./StringUtils.sol";

library DataTypes {
    struct IInterestRateStrategyParams {
        bytes32 name;
        uint32 baseVariableBorrowRate;
        uint32 variableRateSlope1;
        uint32 variableRateSlope2;
    }

    struct IAuctionStrategyParams {
        bytes32 name;
        uint32 maxPriceMultiplier;
        uint32 minExpPriceMultiplier;
    }
    struct IReserveParams {
        // IInterestRateStrategyParams strategy;
        uint8 decimal;
    }
}

contract ParaspaceConfig {
    bytes32[] public erc20Tokens;
    bytes32[] public erc721Tokens;
    mapping(bytes32 => DataTypes.IReserveParams) public erc20TokensConfig;
    mapping(bytes32 => address) public erc20Contracts;
    mapping(bytes32 => DataTypes.IReserveParams) public erc721TokensConfig;
    mapping(bytes32 => address) public erc721Contracts;

    constructor() {
        //TODO(alan): update full table
        erc20Tokens.push("DAI");
        erc20TokensConfig["DAI"] = DataTypes.IReserveParams(uint8(18));
    }

    function erc20TokensLength() external view returns (uint256) {
        return erc20Tokens.length;
    }

    function updateErc20TokenAddress(bytes32 tokenSymbol, address addr)
        external
    {
        erc20Contracts[tokenSymbol] = addr;
    }

    function erc721TokensLength() external view returns (uint256) {
        return erc721Tokens.length;
    }

    function updateErc721TokenAddress(bytes32 tokenSymbol, address addr)
        external
    {
        erc721Contracts[tokenSymbol] = addr;
    }
}

abstract contract Deployer {
    ParaspaceConfig config;

    constructor(ParaspaceConfig _config) {
        config = _config;
    }

    function deploy() public virtual;
}

contract ERC20Deployer is Deployer {
    using StringUtils for string;

    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override {
        uint256 t = config.erc20TokensLength();
        for (uint256 i = 0; i < t; i++) {
            bytes32 tokenSymbol = config.erc20Tokens(i);
            DataTypes.IReserveParams memory params = DataTypes.IReserveParams(
                config.erc20TokensConfig(tokenSymbol)
            );

            string memory symbol = string(abi.encodePacked(tokenSymbol));
            if (symbol.equal("WETH")) {
                WETH9Mocked token = new WETH9Mocked();
                config.updateErc20TokenAddress(tokenSymbol, address(token));
            } else if (symbol.equal("stETH")) {
                stETH token = new stETH(symbol, symbol, params.decimal);
                config.updateErc20TokenAddress(tokenSymbol, address(token));
            } else if (symbol.equal("aETH")) {
                MockAToken token = new MockAToken(
                    symbol,
                    symbol,
                    params.decimal
                );
                config.updateErc20TokenAddress(tokenSymbol, address(token));
            } else {
                MintableERC20 token = new MintableERC20(
                    symbol,
                    symbol,
                    params.decimal
                );
                config.updateErc20TokenAddress(tokenSymbol, address(token));
            }
        }
    }
}

contract ERC721Deployer is Deployer {
    using StringUtils for string;

    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override {
        uint256 t = config.erc721TokensLength();
        for (uint256 i = 0; i < t; i++) {
            bytes32 tokenSymbol = config.erc721Tokens(i);
            DataTypes.IReserveParams memory params = DataTypes.IReserveParams(
                config.erc721TokensConfig(tokenSymbol)
            );
            string memory symbol = string(abi.encodePacked(tokenSymbol));
            if (symbol.equal("WPUNKS")) {
                CryptoPunksMarket punks = new CryptoPunksMarket();
                bytes32 punksSymbol = "PUNKS";
                config.updateErc721TokenAddress(punksSymbol, address(punks));
                WPunk wpunks = new WPunk(address(punks));
                config.updateErc721TokenAddress(tokenSymbol, address(wpunks));
            } else if (symbol.equal("BAYC")) {
                BoredApeYachtClub bayc = new BoredApeYachtClub(
                    symbol,
                    symbol,
                    8000,
                    0
                );
                config.updateErc721TokenAddress(tokenSymbol, address(bayc));
            } else if (symbol.equal("MAYC")) {
                MutantApeYachtClub mayc = new MutantApeYachtClub(
                    symbol,
                    symbol,
                    address(0),
                    address(0)
                );
                config.updateErc721TokenAddress(tokenSymbol, address(mayc));
                //FIXME(alan): Why deploy mayc && apeCoin?
            }
        }
    }
}
