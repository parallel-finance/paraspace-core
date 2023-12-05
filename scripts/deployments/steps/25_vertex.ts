import {ZERO_ADDRESS} from "../../../helpers/constants";
import {
  deployVertexClearinghouseImplAndAssignItToProxy,
  deployVertexClearinghouseLiq,
  deployVertexClearinghouseProxy,
  deployVertexEndpointImplAndAssignItToProxy,
  deployVertexEndpointProxy,
  deployVertexFQuerier,
  deployVertexFeeCalculator,
  deployVertexMockSanctionsList,
  deployVertexOffchainBookWithoutInitializing,
  deployVertexPerpEngineProxy,
  deployVertexSpotEngineProxy,
} from "../../../helpers/contracts-deployments";
import {getAllTokens, getFirstSigner} from "../../../helpers/contracts-getters";
import {waitForTx} from "../../../helpers/misc-utils";
import {
  ERC20TokenContractId,
  EngineType,
  IVertexMarketConfig,
} from "../../../helpers/types";

export const step_25 = async (verify = false) => {
  try {
    const feeCalculator = await deployVertexFeeCalculator(verify);
    await waitForTx(await feeCalculator.initialize());

    const sanctions = await deployVertexMockSanctionsList(verify);
    const clearinghouseLiq = await deployVertexClearinghouseLiq(verify);
    const clearinghouse = await deployVertexClearinghouseProxy(verify);
    const endpoint = await deployVertexEndpointProxy(verify);
    const spotEngine = await deployVertexSpotEngineProxy(verify);
    const perpEngine = await deployVertexPerpEngineProxy(verify);

    const sequencer = await getFirstSigner();
    const allTokens = await getAllTokens();

    await deployVertexClearinghouseImplAndAssignItToProxy(
      [
        endpoint.address,
        allTokens[ERC20TokenContractId.USDC].address,
        feeCalculator.address,
        clearinghouseLiq.address,
      ],
      ZERO_ADDRESS,
      verify
    );
    await waitForTx(
      await clearinghouse.addEngine(spotEngine.address, EngineType.SPOT)
    );
    await waitForTx(
      await clearinghouse.addEngine(perpEngine.address, EngineType.PERP)
    );
    await waitForTx(await feeCalculator.migrate(clearinghouse.address));

    await deployVertexEndpointImplAndAssignItToProxy(
      [
        sanctions.address,
        await sequencer.getAddress(),
        clearinghouse.address,
        "72000",
        Math.floor(new Date().valueOf() / 1000).toString(),
        [],
      ],
      ZERO_ADDRESS,
      verify
    );

    const fquerier = await deployVertexFQuerier(verify);
    await waitForTx(await fquerier.initialize(clearinghouse.address));

    const maxHealthGroup = await clearinghouse.getMaxHealthGroup();
    const vertexConfigs: IVertexMarketConfig[] = [
      {
        healthGroup: maxHealthGroup.toString(),
        riskStore: {
          longWeightInitial: "900000000",
          shortWeightInitial: "1100000000",
          longWeightMaintenance: "950000000",
          shortWeightMaintenance: "1050000000",
          largePositionPenalty: "0",
        },
        interestRateConfig: undefined,
        book: (
          await deployVertexOffchainBookWithoutInitializing(
            await sequencer.getAddress(),
            verify
          )
        ).address,
        sizeIncrement: "1000000000000000",
        priceIncrementX18: "1000000000000000000",
        minSize: "0",
        lpSpreadX18: "3000000000000000",
      },
    ];

    for (const config of vertexConfigs) {
      if (config.interestRateConfig) {
        await waitForTx(
          await spotEngine.addProduct(
            config.healthGroup,
            config.book,
            config.sizeIncrement,
            config.priceIncrementX18,
            config.minSize,
            config.lpSpreadX18,
            config.interestRateConfig,
            config.riskStore
          )
        );
      } else {
        await waitForTx(
          await perpEngine.addProduct(
            config.healthGroup,
            config.book,
            config.sizeIncrement,
            config.priceIncrementX18,
            config.minSize,
            config.lpSpreadX18,
            config.riskStore
          )
        );
      }
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
