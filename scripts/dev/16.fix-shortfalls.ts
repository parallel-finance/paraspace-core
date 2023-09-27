import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {upgradePoolParameters} from "../upgrade/pool";

const fixShortfalls = async () => {
  console.time("fix-shortfalls");
  await upgradePoolParameters(
    "0x64d0680889A1f6cFF8De6632e2C4B93957169E28",
    false
  );
  const pool = await getPoolProxy();
  const encodedData = pool.interface.encodeFunctionData("fixShortfalls", [
    [
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
      "0xC5c9fB6223A989208Df27dCEE33fC59ff5c26fFF",
      "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      "0x5283D291DBCF85356A21bA090E6db59121208b44",
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    ],
  ]);
  await dryRunEncodedData(pool.address, encodedData);
  console.timeEnd("fix-shortfalls");
};

async function main() {
  await rawBRE.run("set-DRE");
  await fixShortfalls();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
