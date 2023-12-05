import {
  deployVertexClearinghouseImplAndAssignItToProxy,
  deployVertexClearinghouseLiq,
  deployVertexClearinghouseProxy,
  deployVertexEndpointGated,
  deployVertexEndpointImplAndAssignItToProxy,
  deployVertexEndpointProxy,
  deployVertexFQuerier,
  deployVertexFeeCalculator,
  deployVertexMockSanctionsList,
  deployVertexPerpEngineProxy,
  deployVertexSpotEngineProxy,
} from "../../../helpers/contracts-deployments";
import {getAllTokens, getFirstSigner} from "../../../helpers/contracts-getters";
import {waitForTx} from "../../../helpers/misc-utils";
import {ERC20TokenContractId, EngineType} from "../../../helpers/types";

export const step_25 = async (verify = false) => {
  try {
    const feeCalculator = await deployVertexFeeCalculator(verify);
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
      verify
    );
    await waitForTx(
      await clearinghouse.addEngine(spotEngine.address, EngineType.SPOT)
    );
    await waitForTx(
      await clearinghouse.addEngine(perpEngine.address, EngineType.PERP)
    );

    await deployVertexEndpointImplAndAssignItToProxy(
      [
        sanctions.address,
        await sequencer.getAddress(),
        clearinghouse.address,
        "72000",
        Math.floor(new Date().valueOf() / 1000).toString(),
        [],
      ],
      verify
    );

    await deployVertexFQuerier(clearinghouse.address, verify);
    // uint32 healthGroup,
    // IClearinghouseState.RiskStore memory riskStore,
    // address book,
    // int128 sizeIncrement,
    // int128 priceIncrementX18,
    // int128 minSize,
    // int128 lpSpreadX18
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
