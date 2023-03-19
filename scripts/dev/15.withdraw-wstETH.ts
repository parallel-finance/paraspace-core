import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, HACK_RECOVERY} from "../../helpers/hardhat-constants";

const withdrawWstETH = async () => {
  console.time("fix-hack");
  const pool = await getPoolProxy();

  console.time("withdraw wstETH");
  if (DRY_RUN) {
    const encodedData = pool.interface.encodeFunctionData(
      "tmp_fix_withdrawUserPosition",
      [HACK_RECOVERY, "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0"]
    );
    await dryRunEncodedData(pool.address, encodedData);
  }

  console.time("withdraw wstETH");
  console.timeEnd("fix-hack");
};

async function main() {
  await rawBRE.run("set-DRE");
  await withdrawWstETH();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
