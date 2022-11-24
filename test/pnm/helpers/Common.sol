pragma solidity ^0.8.10;

import "forge-std/Test.sol";

import {MintableERC20} from "../../../contracts/mocks/tokens/MintableERC20.sol";
import {WETH9Mocked} from "../../../contracts/mocks/tokens/WETH9Mocked.sol";
import {stETH} from "../../../contracts/mocks/tokens/stETH.sol";
import {MockAToken} from "../../../contracts/mocks/tokens/MockAToken.sol";
import {StringUtils} from "./StringUtils.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";

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
        uint32 minPriceMultiplier;
        uint32 stepLinear;
    }

    struct IReserveParams {
        uint8 decimal;
        uint256 faucetMintValue;
    }

    //todo: merge to IReserveParams
    struct IReserveParamsFull {
        IInterestRateStrategyParams interestStrategy;
        IAuctionStrategyParams auctionStrategy;
        uint32 baseLTVAsCollateral;
        uint32 liquidationThreshold;
        uint32 liquidationProtocolFeePercentage;
        uint32 liquidationBonus;
        bool borrowingEnabled;
        uint8 reserveDecimals;
        uint32 reserveFactor;
        uint256 borrowCap;
        uint256 supplyCap;
        string xTokenImpl;
        uint8 reserveDecimal;
    }
}

contract ParaspaceConfig {
    bytes32[] public erc20Tokens;
    bytes32[] public erc721Tokens;

    mapping(bytes32 => DataTypes.IReserveParams) internal tokenConfigs;

    address payable public deployer;
    bytes32 public constant marketId = "ParaSpaceMM";

    IPoolAddressesProvider public addressProvider;

    mapping(bytes32 => address) public contractAddresses;

    constructor() {
        deployer = payable(msg.sender);
        //TODO(alan): update full table
        erc20Tokens.push("DAI");
        tokenConfigs["DAI"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("WETH");
        tokenConfigs["WETH"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("USDC");
        tokenConfigs["USDC"] = DataTypes.IReserveParams({
            decimal: uint8(6),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("USDT");
        tokenConfigs["USDT"] = DataTypes.IReserveParams({
            decimal: uint8(6),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("APE");
        tokenConfigs["APE"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("WBTC");
        tokenConfigs["WBTC"] = DataTypes.IReserveParams({
            decimal: uint8(8),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("stETH");
        tokenConfigs["stETH"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("aWETH");
        tokenConfigs["aWETH"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("cETH");
        tokenConfigs["cETH"] = DataTypes.IReserveParams({
            decimal: uint8(8),
            faucetMintValue: uint256(10000)
        });
        erc20Tokens.push("PUNK");
        tokenConfigs["PUNK"] = DataTypes.IReserveParams({
            decimal: uint8(18),
            faucetMintValue: uint256(10000)
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

    function setAddressProvider(IPoolAddressesProvider _addressProvider)
        public
    {
        addressProvider = _addressProvider;
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
