import rawBRE from "hardhat";
import {getFirstSigner} from "../../helpers/contracts-getters";
import {
  getEthersSigners,
  getParaSpaceAdmins,
} from "../../helpers/contracts-helpers";
import {DRE} from "../../helpers/misc-utils";
import * as envs from "../../helpers/hardhat-constants";
import {accounts} from "../../wallets";

const info = async () => {
  console.time("info");

  const signer = await getFirstSigner();
  const signerAddress = await signer.getAddress();

  console.log(await DRE.ethers.provider.getNetwork());
  console.log(await DRE.ethers.provider.getFeeData());
  console.log(envs);
  console.log(await getParaSpaceAdmins());
  console.log(accounts);
  console.log(signerAddress);
  console.log(await signer.getTransactionCount());
  console.log(
    await Promise.all((await getEthersSigners()).map((x) => x.getAddress()))
  );

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
