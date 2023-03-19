import {utils} from "ethers";
import rawBRE from "hardhat";
import {getFirstSigner} from "../../helpers/contracts-getters";
import {getParaSpaceAdmins} from "../../helpers/contracts-helpers";
import {HACK_RECOVERY} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

const sendETH = async () => {
  console.time("send-eth");
  const signer = await getFirstSigner();
  const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
  await waitForTx(
    await signer.sendTransaction({
      to: paraSpaceAdminAddress,
      value: utils.parseEther("10").toString(),
    })
  );
  await waitForTx(
    await signer.sendTransaction({
      to: "0x909e36B512Ed45250fdff513523119d825647695",
      value: utils.parseEther("10").toString(),
    })
  );
  await waitForTx(
    await signer.sendTransaction({
      to: "0xca8678d2d273b1913148402aed2e99b085ea3f02",
      value: utils.parseEther("10").toString(),
    })
  );
  await waitForTx(
    await signer.sendTransaction({
      to: HACK_RECOVERY,
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
