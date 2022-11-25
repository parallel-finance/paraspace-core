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
import {DefaultReserveInterestRateStrategy} from "../../../contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol";
import {DefaultReserveAuctionStrategy} from "../../../contracts/protocol/pool/DefaultReserveAuctionStrategy.sol";
import {ConfiguratorInputTypes} from "../../../contracts/protocol/libraries/types/ConfiguratorInputTypes.sol";
import {DataTypes as ParaSpaceDataTypes} from "../../../contracts/protocol/libraries/types/DataTypes.sol";
import {PoolConfigurator} from "../../../contracts/protocol/pool/PoolConfigurator.sol";

contract ReservesDeployer is Deployer {
    constructor(ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        IPoolAddressesProvider provider = IPoolAddressesProvider(
            config.contractAddresses(Contracts.PoolAddressesProvider)
        );
        IPool pool = IPool(provider.getPool());
        PoolConfigurator configurator = PoolConfigurator(
            provider.getPoolConfigurator()
        );
        VariableDebtToken debtTokenImpl = new VariableDebtToken(pool);
        PToken pTokenImpl = new PToken(pool);
        NToken nTokenImpl = new NToken(pool, false);
        ReservesSetupHelper reserversSetupHelperImpl = new ReservesSetupHelper();
        IACLManager aclManager = IACLManager(provider.getACLManager());
        aclManager.addPoolAdmin(address(reserversSetupHelperImpl));

        //TODO(ron): use dai only for demonstrate and need refactor to load from token dict
        DefaultReserveInterestRateStrategy daiInterestRateStrategy = new DefaultReserveInterestRateStrategy(
            provider,
            8e26, //optimalUsageRatio
            0, //baseVariableRate
            4e25, //variableRateSlope1
            75e25 //variableRateSlope2
        );
        DefaultReserveAuctionStrategy daiAuctionStrategy = new DefaultReserveAuctionStrategy(
            3e18, //max
            1e18, //minExp
            5e17, //min
            5e16, //stepLinear
            1e17, //stepExp
            60 //tickLength
        );

        ConfiguratorInputTypes.InitReserveInput memory initInput = ConfiguratorInputTypes
            .InitReserveInput(
                address(pTokenImpl),
                address(debtTokenImpl),
                18,
                address(daiInterestRateStrategy),
                address(daiAuctionStrategy),
                config.contractAddresses("DAI"),
                ParaSpaceDataTypes.AssetType.ERC20,
                address(0), //treasury
                address(0), //incentivesController
                "ParaSpace Derivative Token DAI",
                "pDAI",
                "ParaSpace Variable Debt Token DAI",
                "vDebtDAI",
                "0x10"
            );

        ConfiguratorInputTypes.InitReserveInput[]
            memory initInputs = new ConfiguratorInputTypes.InitReserveInput[](
                1
            );
        initInputs[0] = initInput;
        //initReserves
        configurator.initReserves(initInputs);

        ReservesSetupHelper.ConfigureReserveInput memory configInput = ReservesSetupHelper
            .ConfigureReserveInput(
                config.contractAddresses("DAI"),
                7700, //ltv
                0, //protocolFee
                9000, //lt
                10400, //liqBonus
                1000, //RF
                0, //borrowCap
                0, //supplyCap
                true //borrowEnable
            );
        ReservesSetupHelper.ConfigureReserveInput[]
            memory reserveInputs = new ReservesSetupHelper.ConfigureReserveInput[](
                1
            );
        reserveInputs[0] = configInput;
        //configureReserves
        reserversSetupHelperImpl.configureReserves(configurator, reserveInputs);

        aclManager.removePoolAdmin(address(reserversSetupHelperImpl));
    }
}
