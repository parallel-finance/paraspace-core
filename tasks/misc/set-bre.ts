import {task} from "hardhat/config";
import {DRE, setDRE} from "../../helpers/misc-utils";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {
  FORK,
  TENDERLY,
  TENDERLY_FORK_ID,
  TENDERLY_HEAD_ID,
} from "../../helpers/hardhat-constants";

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
  console.log("  - Network :", _DRE.network.name);

  setDRE(_DRE);
  return _DRE;
});
