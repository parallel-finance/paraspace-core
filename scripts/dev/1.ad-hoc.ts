import rawBRE from "hardhat";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {waitForTx} from "../../helpers/misc-utils";
import {getPToken} from "../../helpers/contracts-getters";
import {upgradePToken} from "../upgrade/ptoken";
import {parseEther} from "ethers/lib/utils";

const rescuePToken = async (to, amount) => {
  const pWETH = await getPToken("0x503b2ADcD72efE21221E711387A737fD0C4F945E");
  if (DRY_RUN) {
    const encodedData = pWETH.interface.encodeFunctionData("rescuePToken", [
      to,
      amount,
    ]);
    await dryRunEncodedData(pWETH.address, encodedData);
  } else {
    await waitForTx(await pWETH.rescuePToken(to, amount, GLOBAL_OVERRIDES));
  }
};

const adHoc = async () => {
  console.time("ad-hoc");

  //there are only 3 asset, we can simply update all
  await upgradePToken(false);

  await rescuePToken(
    "0x3B9904001c88Bf667636933fF237CCe04aDf4593",
    parseEther("3.4")
  );

  await rescuePToken(
    "0x03c52955A66f9b886Ee2d9de5DE7Ea5250Cd3165",
    parseEther("0.19")
  );

  await rescuePToken(
    "0xF931edA165261b235f47541A81B9b1A5B792F8D1",
    parseEther("0.25")
  );

  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
