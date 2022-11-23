pragma solidity ^0.8.10;

import {MintableERC20} from "../../../contracts/mocks/tokens/MintableERC20.sol";
import {WETH9Mocked} from "../../../contracts/mocks/tokens/WETH9Mocked.sol";
import {stETH} from "../../../contracts/mocks/tokens/stETH.sol";
import {MockAToken} from "../../../contracts/mocks/tokens/MockAToken.sol";
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
        uint256 faucetMintValue;
    }
}

contract ParaspaceConfig {
    bytes32[] public erc20Tokens;
    bytes32[] public erc721Tokens;

    mapping(bytes32 => DataTypes.IReserveParams) public tokenConfigs;
    address payable public constant root = payable(address(31415926));

    mapping(bytes32 => address) public contractAddresses;

    constructor() {
        //TODO(alan): update full table
        erc20Tokens.push("DAI");
        tokenConfigs["DAI"] = DataTypes.IReserveParams({
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
}

abstract contract Deployer {
    ParaspaceConfig config;

    constructor(ParaspaceConfig _config) {
        config = _config;
    }

    function deploy() public virtual;
}
