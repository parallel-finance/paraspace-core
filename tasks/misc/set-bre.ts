import {task} from "hardhat/config";
import {
  DRE,
  isMainnet,
  isPolygon,
  isPublicTestnet,
  setDRE,
} from "../../helpers/misc-utils";
import {HardhatRuntimeEnvironment, HttpNetworkConfig} from "hardhat/types";
import {
  FORK,
  GLOBAL_OVERRIDES,
  TENDERLY,
  TENDERLY_FORK_ID,
  TENDERLY_HEAD_ID,
} from "../../helpers/hardhat-constants";
import {utils} from "ethers";
import {Provider} from "zksync-web3";

task(
  `set-DRE`,
  `Inits the DRE, to have access to all the plugins' objects`
).setAction(async (_, _DRE) => {
  if (DRE) {
    return;
  }
  if (
    (_DRE as HardhatRuntimeEnvironment).network.name.includes("tenderly") ||
    TENDERLY
  ) {
    console.log("- Setting up Tenderly provider");
    const net = _DRE.tenderly.network();

    if (TENDERLY_FORK_ID && TENDERLY_HEAD_ID) {
      console.log("- Connecting to a Tenderly Fork");
      await net.setFork(TENDERLY_FORK_ID);
      await net.setHead(TENDERLY_HEAD_ID);
    } else {
      console.log("- Creating a new Tenderly Fork");
      await net.initializeFork();
    }
    const provider = new _DRE.ethers.providers.Web3Provider(net);
    _DRE.ethers.provider = provider;
    console.log("- Initialized Tenderly fork:");
    console.log("  - Fork: ", net.getFork());
    console.log("  - Head: ", net.getHead());
  } else if (_DRE.network.config.zksync) {
    _DRE.ethers.provider = new Provider(
      (_DRE.network.config as HttpNetworkConfig).url
    );
  }

  console.log("- Environment");
  if (FORK) {
    console.log("  - Fork Mode activated at network: ", FORK);
    _DRE.network.name = FORK;
    if (_DRE?.config?.networks?.hardhat?.forking?.url) {
      console.log(
        "  - Provider URL:",
        _DRE.config.networks.hardhat.forking?.url?.split("/")[2]
      );
    } else {
      console.error(
        `[FORK][Error], missing Provider URL for "${_DRE.network.name}" network. Fill the URL at './helper-hardhat-config.ts' file`
      );
    }
  }
  console.log("  - Network:", _DRE.network.name);

  setDRE(_DRE);

  if (isPublicTestnet() || isMainnet()) {
    const feeData = await _DRE.ethers.provider.getFeeData();
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      GLOBAL_OVERRIDES.type = 2;
      GLOBAL_OVERRIDES.maxFeePerGas = isPolygon()
        ? feeData.maxFeePerGas.mul(2)
        : feeData.maxFeePerGas;
      GLOBAL_OVERRIDES.maxPriorityFeePerGas = isPolygon()
        ? feeData.maxFeePerGas.mul(2)
        : feeData.maxPriorityFeePerGas;
      console.log("  - Type:", GLOBAL_OVERRIDES.type);
      console.log(
        "  - MaxPriorityFeePerGas:",
        utils.formatUnits(GLOBAL_OVERRIDES.maxPriorityFeePerGas, "gwei")
      );
      console.log(
        "  - MaxFeePerGas:",
        utils.formatUnits(GLOBAL_OVERRIDES.maxFeePerGas, "gwei")
      );
    } else if (feeData.gasPrice) {
      GLOBAL_OVERRIDES.gasPrice = feeData.gasPrice;
      GLOBAL_OVERRIDES.type = 0;
      console.log("  - Type:", GLOBAL_OVERRIDES.type);
      console.log(
        "  - GasPrice:",
        utils.formatUnits(GLOBAL_OVERRIDES.gasPrice, "gwei")
      );
    }
  }

  return _DRE;
});
