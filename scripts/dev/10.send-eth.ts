import {utils} from "ethers";
import rawBRE from "hardhat";
import {getFirstSigner} from "../../helpers/contracts-getters";
import {getParaSpaceAdmins} from "../../helpers/contracts-helpers";
import {AIRDROP_CONTRACT} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

const sendETH = async () => {
  console.time("send-eth");
  const signer = await getFirstSigner();
  const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
  await waitForTx(
    await signer.sendTransaction({
      to: AIRDROP_CONTRACT,
      value: utils.parseEther("10").toString(),
    })
  );
  console.timeEnd("send-eth");
};

async function main() {
  await rawBRE.run("set-DRE");
  await sendETH();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
