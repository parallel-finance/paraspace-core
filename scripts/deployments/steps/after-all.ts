import {
  getPoolAddressesProvider,
  getUiPoolDataProvider,
} from "../../../helpers/contracts-getters";
import {insertContractAddressInDb} from "../../../helpers/contracts-helpers";
import {BLOCKSCOUT_DISABLE_INDEXER} from "../../../helpers/hardhat-constants";
import {DRE, isFork} from "../../../helpers/misc-utils";

const SYMBOL_MAP = {
  M20: "APE",
  ATK: "BAYC",
  BTK: "MAYC",
  GTK: "BAKC",
  "UNI-V3-POS": "UniswapV3",
};

export const afterAll = async () => {
  console.log("running after all hook");
  const ui = await getUiPoolDataProvider();
  const provider = await getPoolAddressesProvider();
  const [reservesData] = await ui.getReservesData(provider.address);

  for (const x of reservesData) {
    const xTokenPrefix = x.assetType == 0 ? "p" : "n";
    const symbol = SYMBOL_MAP[x.symbol] || x.symbol;
    await insertContractAddressInDb(
      `${xTokenPrefix}${symbol}`,
      x.xTokenAddress,
      false
    );
    await insertContractAddressInDb(
      `${symbol}VariableDebtToken`,
      x.variableDebtTokenAddress,
      false
    );
  }

  if (!isFork() && BLOCKSCOUT_DISABLE_INDEXER) {
    return;
  }
  await DRE.network.provider.send("evm_setAutomine", [false]);
  await DRE.network.provider.send("evm_setIntervalMining", [3000]);
};
