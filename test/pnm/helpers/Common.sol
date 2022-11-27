pragma solidity ^0.8.10;

import "forge-std/Test.sol";

import {MintableERC20} from "../../../contracts/mocks/tokens/MintableERC20.sol";
import {WETH9Mocked} from "../../../contracts/mocks/tokens/WETH9Mocked.sol";
import {stETH} from "../../../contracts/mocks/tokens/stETH.sol";
import {MockAToken} from "../../../contracts/mocks/tokens/MockAToken.sol";
import {StringUtils} from "./StringUtils.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";

library Contracts {
    bytes32 public constant PoolAddressesProvider =
        keccak256(abi.encodePacked("PoolAddressesProvider"));

    bytes32 public constant MockTokenFaucet =
        keccak256(abi.encodePacked("MockTokenFaucet"));

    bytes32 public constant WETHGatewayProxy =
        keccak256(abi.encodePacked("WETHGatewayProxy"));

    bytes32 public constant ReservesSetupHelper =
        keccak256(abi.encodePacked("ReservesSetupHelper"));

    bytes32 public constant NonfungibleTokenPositionDescriptor =
        keccak256(abi.encodePacked("NonfungibleTokenPositionDescriptor"));

    bytes32 public constant UniswapV3Factory =
        keccak256(abi.encodePacked("UniswapV3Factory"));

    bytes32 public constant PriceOracle =
        keccak256(abi.encodePacked("PriceOracle"));

    bytes32 public constant PTokenImpl =
        keccak256(abi.encodePacked("PTokenImpl"));

    bytes32 public constant NTokenImpl =
        keccak256(abi.encodePacked("NTokenImpl"));

    bytes32 public constant NTokenMoonBirdsImpl =
        keccak256(abi.encodePacked("NTokenMoonBirdsImpl"));

    bytes32 public constant NTokenUniswapV3Impl =
        keccak256(abi.encodePacked("NTokenUniswapV3Impl"));

}

library DataTypes {
    struct IInterestRateStrategyParams {
        bytes32 name;
        uint256 optimalUsageRatio;
        uint256 baseVariableBorrowRate;
        uint256 variableRateSlope1;
        uint256 variableRateSlope2;
    }

    struct IAuctionStrategyParams {
        bytes32 name;
        uint256 maxPriceMultiplier;
        uint256 minExpPriceMultiplier;
        uint256 minPriceMultiplier;
        uint256 stepLinear;
        uint256 stepExp;
        uint64 tickLength;
    }

    struct IReserveParams {
        uint8 decimal;
        uint256 faucetMintValue;
        uint256 mockPrice;
        uint256 baseLTVAsCollateral;
        uint256 liquidationThreshold;
        uint256 liquidationProtocolFeePercentage;
        uint256 liquidationBonus;
        bool borrowingEnabled;
        uint256 reserveFactor;
        uint256 borrowCap;
        uint256 supplyCap;
        bytes32 xTokenImpl;
        IInterestRateStrategyParams strategy;
        IAuctionStrategyParams auctionStrategy;
    }
}

contract ParaspaceConfig {
    bytes32[] public erc20Tokens;
    bytes32[] public erc721Tokens;

    mapping(bytes32 => DataTypes.IReserveParams) internal tokenConfigs;

    address payable public deployer;
    bytes32 public constant marketId = "ParaSpaceMM";
    uint64 public constant auctionRecoveryHealthFactor = 1500000000000000000;

    mapping(bytes32 => address) public contractAddresses;

    constructor() {
        deployer = payable(msg.sender);
        erc20Tokens.push("DAI");
        tokenConfigs["DAI"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000),
            mockPrice: uint256(0.000908578801039414 ether),
            baseLTVAsCollateral: 7700,
            liquidationThreshold: 9000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10400,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyDAI",
                optimalUsageRatio: 8e26,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 4e25,
                variableRateSlope2: 75e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("WETH");
        tokenConfigs["WETH"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000),
            mockPrice: uint256(1 ether),
            baseLTVAsCollateral: 8250, 
            liquidationThreshold: 8600,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10450,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyWETH",
                optimalUsageRatio: 7e26,
                baseVariableBorrowRate: 25e24,
                variableRateSlope1: 8e25,
                variableRateSlope2: 90e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("USDC");
        tokenConfigs["USDC"] = DataTypes.IReserveParams({
            decimal: uint8(6),
            faucetMintValue: uint256(10000),
            mockPrice: uint256(0.000915952223931999 ether),
            baseLTVAsCollateral: 8700,
            liquidationThreshold: 8900,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10450,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyUSDC",
                optimalUsageRatio: 9e26,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 4e25,
                variableRateSlope2: 60e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("USDT");
        tokenConfigs["USDT"] = DataTypes.IReserveParams({
            decimal: uint8(6),
            faucetMintValue: uint256(10000),
            mockPrice: uint256(0.000915952223931999 ether),
            baseLTVAsCollateral: 7500,
            liquidationThreshold: 8000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyUSDT",
                optimalUsageRatio: 9e26,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 4e25,
                variableRateSlope2: 75e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("APE");
        tokenConfigs["APE"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000),
            mockPrice: uint256(0.0036906841286 ether),
            baseLTVAsCollateral: 2000,
            liquidationThreshold: 7000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 2500,
            borrowCap: 0,
            supplyCap: 6200000,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyAPE",
                optimalUsageRatio: 85e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 30e25,
                variableRateSlope2: 200e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("sAPE");
        tokenConfigs["sAPE"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000),
            mockPrice: uint256(0.0036906841286 ether),
            baseLTVAsCollateral: 7000,
            liquidationThreshold: 7000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 2000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyAPE",
                optimalUsageRatio: 85e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 30e25,
                variableRateSlope2: 200e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("WBTC");
        tokenConfigs["WBTC"] = DataTypes.IReserveParams({
            decimal: uint8(8),
            faucetMintValue: uint256(10),
            mockPrice: uint256(18.356369399062118 ether),
            baseLTVAsCollateral: 7200,
            liquidationThreshold: 8200,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 2000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyWBTC",
                optimalUsageRatio: 65e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 100e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("stETH");
        tokenConfigs["stETH"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10),
            mockPrice: uint256(1 ether),
            baseLTVAsCollateral: 6900,
            liquidationThreshold: 8100,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10750,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyXETH",
                optimalUsageRatio: 65e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 8e25,
                variableRateSlope2: 100e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("aWETH");
        tokenConfigs["aWETH"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10),
            mockPrice: uint256(1 ether),
            baseLTVAsCollateral: 6900,
            liquidationThreshold: 8100,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10750,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyXETH",
                optimalUsageRatio: 65e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 8e25,
                variableRateSlope2: 100e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("cETH");
        tokenConfigs["cETH"] = DataTypes.IReserveParams({
            decimal: uint8(8),
            faucetMintValue: uint256(10),
            mockPrice: uint256(1 ether),
            baseLTVAsCollateral: 6900,
            liquidationThreshold: 8100,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10750,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyXETH",
                optimalUsageRatio: 65e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 8e25,
                variableRateSlope2: 100e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });
        erc20Tokens.push("PUNK");
        tokenConfigs["PUNK"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(1000),
            mockPrice: uint256(140 ether),
            baseLTVAsCollateral: 6900,
            liquidationThreshold: 8100,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10750,
            borrowingEnabled: true,
            xTokenImpl: Contracts.PTokenImpl,
            reserveFactor: 1000,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyXETH",
                optimalUsageRatio: 65e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 8e25,
                variableRateSlope2: 100e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyZero",
                maxPriceMultiplier: 3e18,
                minExpPriceMultiplier: 1e18,
                minPriceMultiplier: 5e17,
                stepLinear: 5e16,
                stepExp: 1e17, 
                tickLength: 60
            })
        });

        erc721Tokens.push("DOODLE");
        tokenConfigs["DOODLE"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(75 ether),
            baseLTVAsCollateral: 3000,
            liquidationThreshold: 6500,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 100,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyDoodles",
                maxPriceMultiplier: 3.5 ether,
                minExpPriceMultiplier: 1.2 ether,
                minPriceMultiplier: 0.7 ether,
                stepLinear: 0.02106053073 ether,
                stepExp: 0.04508812849 ether, 
                tickLength: 60
            })
        });
        erc721Tokens.push("WPUNKS");
        tokenConfigs["WPUNKS"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(140 ether),
            baseLTVAsCollateral: 3500,
            liquidationThreshold: 7000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 100,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyWPunks",
                maxPriceMultiplier: 5 ether,
                minExpPriceMultiplier: 1.2 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.01149268155 ether, 
                stepExp: 0.04100348452 ether, 
                tickLength: 900
            })
        });
        erc721Tokens.push("BAYC");
        tokenConfigs["BAYC"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(101 ether),
            baseLTVAsCollateral: 3500,
            liquidationThreshold: 7000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 200,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyBAYC",
                maxPriceMultiplier: 2.5 ether,
                minExpPriceMultiplier: 1.2 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.01102276665 ether,
                stepExp: 0.02022592736 ether, 
                tickLength: 900
            })
        });
        erc721Tokens.push("MAYC");
        tokenConfigs["MAYC"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(51 ether),
            baseLTVAsCollateral: 3250,
            liquidationThreshold: 7000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 200,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyMAYC",
                maxPriceMultiplier: 2 ether,
                minExpPriceMultiplier: 1.2 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.01830333903 ether,
                stepExp: 0.02337453645 ether,
                tickLength: 900
            })
        });
        erc721Tokens.push("AZUKI");
        tokenConfigs["AZUKI"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(21 ether),
            baseLTVAsCollateral: 3500,
            liquidationThreshold: 6500,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyAzuki",
                maxPriceMultiplier: 3 ether,
                minExpPriceMultiplier: 1.2 ether,
                minPriceMultiplier: 0.7 ether,
                stepLinear: 0.02957356117 ether,
                stepExp: 0.05419596001 ether,
                tickLength: 900
            })
        });
        erc721Tokens.push("CLONEX");
        tokenConfigs["CLONEX"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(27 ether),
            baseLTVAsCollateral: 3500,
            liquidationThreshold: 6500,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 100,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyCloneX",
                maxPriceMultiplier: 3 ether,
                minExpPriceMultiplier: 1.5 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.02584044038 ether,
                stepExp: 0.02558746914 ether,
                tickLength: 900
            })
        });
        erc721Tokens.push("MOONBIRD");
        tokenConfigs["MOONBIRD"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(0.02 ether),
            baseLTVAsCollateral: 3000,
            liquidationThreshold: 6500,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenMoonBirdsImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 100,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyMoonbird",
                maxPriceMultiplier: 2 ether,
                minExpPriceMultiplier: 1.1 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.01136311018 ether,
                stepExp: 0.02264429236 ether,
                tickLength: 900
            })
        });
        erc721Tokens.push("MEEBITS");
        tokenConfigs["MEEBITS"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(22 ether),
            baseLTVAsCollateral: 3000,
            liquidationThreshold: 6500,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 100,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyMeebits",
                maxPriceMultiplier: 5 ether,
                minExpPriceMultiplier: 1.2 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.0114491225 ether,
                stepExp: 0.04084807493 ether,
                tickLength: 900
            })
        });
        erc721Tokens.push("OTHR");
        tokenConfigs["OTHR"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(25 ether),
            baseLTVAsCollateral: 3000,
            liquidationThreshold: 6500,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 1000,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyOthr",
                maxPriceMultiplier: 11 ether,
                minExpPriceMultiplier: 1.9 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.1375 ether,
                stepExp: 0.2195051733 ether,
                tickLength: 900
            })
        });
        erc721Tokens.push("UniswapV3");
        tokenConfigs["UniswapV3"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(25 ether),
            baseLTVAsCollateral: 3000,
            liquidationThreshold: 7000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenUniswapV3Impl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 0,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyUniswapV3",
                maxPriceMultiplier: 1 ether,
                minExpPriceMultiplier: 0.9 ether,
                minPriceMultiplier: 0.9 ether,
                stepLinear: 0.01 ether,
                stepExp: 0.01 ether,
                tickLength: 900
            })
        });
        erc721Tokens.push("BAKC");
        tokenConfigs["BAKC"] = DataTypes.IReserveParams({
            decimal: uint8(0),
            faucetMintValue: uint256(1),
            mockPrice: uint256(25 ether),
            baseLTVAsCollateral: 3500,
            liquidationThreshold: 7000,
            liquidationProtocolFeePercentage: 0,
            liquidationBonus: 10500,
            borrowingEnabled: false,
            xTokenImpl: Contracts.NTokenImpl,
            reserveFactor: 0,
            borrowCap: 0,
            supplyCap: 100,
            strategy: DataTypes.IInterestRateStrategyParams({
                name: "rateStrategyNFT",
                optimalUsageRatio: 45e25,
                baseVariableBorrowRate: 0,
                variableRateSlope1: 7e25,
                variableRateSlope2: 300e25
            }),
            auctionStrategy: DataTypes.IAuctionStrategyParams({
                name: "auctionStrategyBAKC",
                maxPriceMultiplier: 5 ether,
                minExpPriceMultiplier: 1.2 ether,
                minPriceMultiplier: 0.8 ether,
                stepLinear: 0.0114491225 ether,
                stepExp: 0.04084807493 ether,
                tickLength: 900
            })
        });
    }

    function erc20TokensLength() external view returns (uint256) {
        return erc20Tokens.length;
    }

    function erc721TokensLength() external view returns (uint256) {
        return erc721Tokens.length;
    }

    function getTokenConfig(bytes32 token)
        external
        view
        returns (DataTypes.IReserveParams memory)
    {
        return tokenConfigs[token];
    }

    function updateAddress(bytes32 key, address addr) external {
        contractAddresses[key] = addr;
    }
}

abstract contract Deployer is Test {
    ParaspaceConfig config;

    constructor(ParaspaceConfig _config) {
        config = _config;
    }

    modifier FromDeployer() {
        vm.startPrank(config.deployer());
        _;
        vm.stopPrank();
    }

    function deploy() public virtual;
}
