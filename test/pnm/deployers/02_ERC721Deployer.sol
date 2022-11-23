pragma solidity ^0.8.10;

import "../helpers/Common.sol";

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

contract ERC721Deployer is Deployer {
    using StringUtils for string;

    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override {
        uint256 t = config.erc721TokensLength();
        for (uint256 i = 0; i < t; i++) {
            bytes32 tokenSymbol = config.erc721Tokens(i);
            DataTypes.IReserveParams memory params = config.getTokenConfig(
                tokenSymbol
            );
            string memory symbol = string(abi.encodePacked(tokenSymbol));
            if (symbol.equal("WPUNKS")) {
                CryptoPunksMarket punks = new CryptoPunksMarket();
                bytes32 punksSymbol = "PUNKS";
                config.updateAddress(punksSymbol, address(punks));

                WPunk token = new WPunk(address(punks));
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("BAYC")) {
                BoredApeYachtClub token = new BoredApeYachtClub(
                    symbol,
                    symbol,
                    8000,
                    0
                );
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("MAYC")) {
                MutantApeYachtClub token = new MutantApeYachtClub(
                    symbol,
                    symbol,
                    address(0),
                    address(0)
                );
                config.updateAddress(tokenSymbol, address(token));
                //FIXME(alan): Why deploy mayc && apeCoin?
            } else if (symbol.equal("DOODLE")) {
                Doodles token = new Doodles();
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("AZUKI")) {
                Azuki token = new Azuki(5, 10000, 8900, 200);
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("CLONEX")) {
                CloneX token = new CloneX();
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("MEEBITS")) {
                address punks = config.contractAddresses("PUNKS");
                Meebits token = new Meebits(punks, address(0), config.root());
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("OTHR")) {
                Land.ContributorAmount[]
                    memory amount = new Land.ContributorAmount[](1);
                amount[0] = Land.ContributorAmount(config.root(), 100);
                Land token = new Land(
                    symbol,
                    symbol,
                    Land.ContractAddresses(address(0), address(0), address(0)),
                    Land.LandAmount(10, 100, 1000, 10000),
                    amount,
                    config.root(),
                    config.root(),
                    bytes32(
                        0x63616e6469646174653100000000000000000000000000000000000000000000
                    ),
                    5,
                    config.root()
                );
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("MOONBIRD")) {
                Moonbirds token = new Moonbirds(
                    "MOON",
                    "MOON",
                    IERC721(address(0)),
                    config.root(),
                    config.root()
                );
                config.updateAddress(tokenSymbol, address(token));
            } else if (symbol.equal("UniswapV3")) {
                //TODO(alan)
            } else {
                MintableERC721 token = new MintableERC721(symbol, symbol, "");
                config.updateAddress(tokenSymbol, address(token));
            }
        }
    }
}
