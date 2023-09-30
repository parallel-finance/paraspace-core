import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {upgradePoolParameters} from "../upgrade/pool";

const adHoc = async () => {
  console.time("ad-hoc");
  const pool = await getPoolProxy();
  await upgradePoolParameters(
    "0x9082ea82915fC507312d3daDeA4c921Edc4d4BAA",
    false
  );
  const encodedData = pool.interface.encodeFunctionData("repayForV1", [
    [
      "0x10cda82ea4cd56d32c5a5e6dfcaa7af51d2ba350",
      "0x0981f0e2b61575ff55074c76a539108bdc354148",
    ],
    [
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    ],
    ["82000000", "60000000"],
  ]);
  await dryRunEncodedData(pool.address, encodedData);
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
