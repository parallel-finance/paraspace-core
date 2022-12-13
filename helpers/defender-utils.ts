import {
  DefenderRelaySigner,
  DefenderRelayProvider,
} from "defender-relay-client/lib/ethers";
import {Signer, utils} from "ethers";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {impersonateAddress} from "./contracts-helpers";
import {
  DEFENDER,
  DEFENDER_API_KEY,
  DEFENDER_SECRET_KEY,
  FORK,
} from "./hardhat-constants";
import {DRE} from "./misc-utils";
import {usingTenderly} from "./tenderly-utils";
import {eEthereumNetwork} from "./types";

export const usingDefender = () => DEFENDER;

export const getDefenderRelaySigner = async () => {
  let defenderSigner: Signer;

  if (!DEFENDER_API_KEY || !DEFENDER_SECRET_KEY) {
    throw new Error("Defender secrets required");
  }

  const credentials = {
    apiKey: DEFENDER_API_KEY,
    apiSecret: DEFENDER_SECRET_KEY,
  };

  defenderSigner = new DefenderRelaySigner(
    credentials,
    new DefenderRelayProvider(credentials),
    {
      speed: "fast",
    }
  );

  const defenderAddress = await defenderSigner.getAddress();
  console.log("  - Using Defender Relay: ", defenderAddress);

  // Replace signer if FORK=main is active
  if (FORK === eEthereumNetwork.mainnet) {
    console.log("  - Impersonating Defender Relay");
    defenderSigner = (await impersonateAddress(defenderAddress)).signer;
  }
  // Replace signer if Tenderly network is active
  if (usingTenderly()) {
    console.log("  - Impersonating Defender Relay via Tenderly");
    defenderSigner = await (DRE as HardhatRuntimeEnvironment).ethers.getSigner(
      defenderAddress
    );
  }
  console.log(
    "  - Balance: ",
    utils.formatEther(await defenderSigner.getBalance())
  );

  return defenderSigner;
};
