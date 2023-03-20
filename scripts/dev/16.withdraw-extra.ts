import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {HACK_RECOVERY} from "../../helpers/hardhat-constants";

const withdrawExtra = async () => {
  console.time("withdraw-extra");

  const pool = await getPoolProxy();

  const encodedData1 = pool.interface.encodeFunctionData(
    "tmp_fix_transferHackerPosition",
    [
      [
        "0x288f8c1bee08edb4874a30ff46c890640dadf46a",
        "0x006d28f5caa4221b16b3f1b5fc09a606bb554362",
        "0x722ba61d2901692fc7f4d770effcfa56a95c501e",
        "0x2b520b553b362781096ab92617deaa0ed015ca5f",
        "0x1Fc550e98aD3021e32C47A84019F77a0792c60B7",
      ],
      HACK_RECOVERY,
    ]
  );
  await dryRunEncodedData(pool.address, encodedData1);

  console.timeEnd("withdraw-extra");
};

async function main() {
  await rawBRE.run("set-DRE");
  await withdrawExtra();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
