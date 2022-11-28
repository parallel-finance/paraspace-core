pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import "forge-std/Test.sol";

import {IParaProxy} from "../../../contracts/interfaces/IParaProxy.sol";
import {IPool} from "../../../contracts/interfaces/IPool.sol";
import {IPoolConfigurator} from "../../../contracts/interfaces/IPoolConfigurator.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";
import {IACLManager} from "../../../contracts/interfaces/IACLManager.sol";
import {ReservesSetupHelper} from "../../../contracts/deployments/ReservesSetupHelper.sol";
import {VariableDebtToken} from "../../../contracts/protocol/tokenization/VariableDebtToken.sol";
import {PToken} from "../../../contracts/protocol/tokenization/PToken.sol";
import {PTokenStETH} from "../../../contracts/protocol/tokenization/PTokenStETH.sol";
import {StETHDebtToken} from "../../../contracts/protocol/tokenization/StETHDebtToken.sol";
import {PTokenAToken} from "../../../contracts/protocol/tokenization/PTokenAToken.sol";
import {ATokenDebtToken} from "../../../contracts/protocol/tokenization/ATokenDebtToken.sol";
import {PTokenSApe} from "../../../contracts/protocol/tokenization/PTokenSApe.sol";
import {NToken} from "../../../contracts/protocol/tokenization/NToken.sol";
import {NTokenMoonBirds} from "../../../contracts/protocol/tokenization/NTokenMoonBirds.sol";

import {DefaultReserveInterestRateStrategy} from "../../../contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol";
import {DefaultReserveAuctionStrategy} from "../../../contracts/protocol/pool/DefaultReserveAuctionStrategy.sol";
import {ConfiguratorInputTypes} from "../../../contracts/protocol/libraries/types/ConfiguratorInputTypes.sol";
import {DataTypes as ParaSpaceDataTypes} from "../../../contracts/protocol/libraries/types/DataTypes.sol";
import {PoolConfigurator} from "../../../contracts/protocol/pool/PoolConfigurator.sol";

import {MockIncentivesController} from "../../../contracts/mocks/helpers/MockIncentivesController.sol";
import {MockReserveAuctionStrategy} from "../../../contracts/mocks/tests/MockReserveAuctionStrategy.sol";

contract AllReservesDeployer is Deployer {
    ConfiguratorInputTypes.InitReserveInput[] inputs;

    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        uint256 idx = 0;
        MockIncentivesController incentivesController = new MockIncentivesController();
        MockReserveAuctionStrategy reserveAuctionStrategy = new MockReserveAuctionStrategy(
                3 ether,
                1 ether,
                0.5 ether,
                0.05 ether,
                0.1 ether,
                uint256(60)
            );

        address providerAddr = config.contractAddresses(
            Contracts.PoolAddressesProvider
        );
        IPoolAddressesProvider provider = IPoolAddressesProvider(providerAddr);
        IPool pool = IPool(provider.getPool());

        VariableDebtToken variableDebtToken = new VariableDebtToken(pool);
        PToken pToken = new PToken(pool);
        NToken nToken = new NToken(pool, false);
        NTokenMoonBirds nTokenMoonBirds = new NTokenMoonBirds(pool);

        uint256 t0 = config.erc20TokensLength();
        uint256 t1 = config.erc721TokensLength();
        for (uint256 i = 0; i < t0 + t1; i++) {
            bytes32 token;
            if (i < t0) {
                token = config.erc20Tokens(i);
            } else {
                token = config.erc721Tokens(i - t0);
            }
            if (token == "UniswapV3") {
                continue;
            }

            DataTypes.IReserveParams memory params = config.getTokenConfig(
                token
            );

            if (config.contractAddresses(params.strategy.name) == address(0)) {
                DefaultReserveInterestRateStrategy rateStrategy = new DefaultReserveInterestRateStrategy(
                        provider,
                        params.strategy.optimalUsageRatio,
                        params.strategy.baseVariableBorrowRate,
                        params.strategy.variableRateSlope1,
                        params.strategy.variableRateSlope2
                    );
                config.updateAddress(
                    params.strategy.name,
                    address(rateStrategy)
                );
            }

            if (
                config.contractAddresses(params.auctionStrategy.name) == address(0) &&
                params.auctionStrategy.name != "auctionStrategyZero"
            ) {
                DefaultReserveAuctionStrategy auctionStrategy = new DefaultReserveAuctionStrategy(
                    params.auctionStrategy.maxPriceMultiplier,
                    params.auctionStrategy.minExpPriceMultiplier,
                    params.auctionStrategy.minPriceMultiplier,
                    params.auctionStrategy.stepLinear,
                    params.auctionStrategy.stepExp,
                    params.auctionStrategy.tickLength
                );
                config.updateAddress(params.auctionStrategy.name, address(auctionStrategy));
            }
        }

        for(uint256 i = 0; i < t0; i ++) {
            bytes32 token = config.erc20Tokens(i);
            if(token == "stETH") {
                PTokenStETH pTokenStETH = new PTokenStETH(pool);
                StETHDebtToken stETHDebtTOken = new StETHDebtToken(pool);
            } else if(token == "aWETH") {
                PTokenAToken pTokenAToken = new PTokenAToken(pool);
                ATokenDebtToken aTokenDebtToken = new ATokenDebtToken(pool);
            } else if(token == "sAPE") {
                PTokenSApe pTokenSApe = new PTokenSApe(pool);
            } else {
            }
        }

        for(uint256 i = 0; i < t1; i++) {
            bytes32 token = config.erc721Tokens(i);
            if(token == "MOONBIRD") {
                NTokenMoonBirds nTokenMoonBirds = new NTokenMoonBirds(pool); 
            } else if(token == "UniSwapV3") {
                continue;
            } else if(token == "BAYC") {
                // NTokenMAYC nTokenMAYC = new NTokenMAYC();
            }
        }
        //TODO
        // IPoolConfigurator configurator = IPoolConfigurator(provider.getPoolConfigurator());
        // for(uint256 i = 0; i < reserved; i++) {
        //     configurator.initReserves();
        // }
    }
}
