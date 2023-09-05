import rawBRE from "hardhat";
import {getFirstSigner} from "../../helpers/contracts-getters";
import {
  getEthersSigners,
  getParaSpaceAdmins,
} from "../../helpers/contracts-helpers";
import {DRE} from "../../helpers/misc-utils";
import * as envs from "../../helpers/hardhat-constants";
import {HttpNetworkConfig} from "hardhat/types";
import * as zk from "zksync-web3";
import {fromBn} from "evm-bn";

const info = async () => {
  console.time("info");

  const signer = await getFirstSigner();
  const signerAddress = await signer.getAddress();

  console.log(DRE.network.name);
  console.log(await DRE.ethers.provider.getNetwork());
  console.log(await DRE.ethers.provider.getFeeData());
  console.log(fromBn(await DRE.ethers.provider.getBalance(signerAddress)));
  console.log(envs);
  console.log(await getParaSpaceAdmins());
  console.log(signerAddress);
  console.log(await signer.getTransactionCount());
  console.log((DRE.network.config as HttpNetworkConfig).url);
  console.log(fromBn(await DRE.ethers.provider.getBalance(signerAddress)));
  console.log(
    await Promise.all((await getEthersSigners()).map((x) => x.getAddress()))
  );

  if (DRE.network.config.zksync) {
    console.log(
      "MainContract",
      (await (signer as zk.Wallet).getMainContract()).address
    );
    console.log(
      "L1ERC20 BridgeContracts",
      (await (signer as zk.Wallet).getL1BridgeContracts()).erc20.address
    );
    console.log(
      "L2ERC20 BridgeContracts",
      (await (signer as zk.Wallet).getL2BridgeContracts()).erc20.address
    );
  }

  console.timeEnd("info");
};

async function main() {
  await rawBRE.run("set-DRE");
  await info();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
