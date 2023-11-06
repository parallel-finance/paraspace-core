import rawBRE from "hardhat";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {waitForTx} from "../../helpers/misc-utils";
import {getPToken} from "../../helpers/contracts-getters";
import {upgradePToken} from "../upgrade/ptoken";
import {parseEther} from "ethers/lib/utils";

const rescuePToken = async (from, to, amount) => {
  const pWETH = await getPToken("0x503b2ADcD72efE21221E711387A737fD0C4F945E");
  if (DRY_RUN) {
    const encodedData = pWETH.interface.encodeFunctionData("rescuePToken", [
      from,
      to,
      amount,
    ]);
    await dryRunEncodedData(pWETH.address, encodedData);
  } else {
    await waitForTx(await pWETH.rescuePToken(from, to, amount, GLOBAL_OVERRIDES));
  }
};

const adHoc = async () => {
  console.time("ad-hoc");

  console.log("-------------start");

  await upgradePToken(false);

  await rescuePToken(
      "0xb36fdA6e0dCC7770B1eA024586e9487D952d8648",
    "0x44A46b1f4675c250CAA05463800471EDD77F5Cb2",
    parseEther("1.034")
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
