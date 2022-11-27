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
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
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
        //TODO
    }
}
