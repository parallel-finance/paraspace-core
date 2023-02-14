import {utils} from "ethers";
import rawBRE from "hardhat";
import {getFirstSigner} from "../../helpers/contracts-getters";
import {waitForTx} from "../../helpers/misc-utils";

const sendETH = async () => {
  console.time("send-eth");
  const signer = await getFirstSigner();
  await waitForTx(
    await signer.sendTransaction({
      to: "0x2f2d07d60ea7330DD2314f4413CCbB2dC25276EF",
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
