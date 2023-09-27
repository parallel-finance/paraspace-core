import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {upgradePoolParameters} from "../upgrade/pool";
import {parseEther, parseUnits} from "ethers/lib/utils";

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
    [
      "0xbc737139dd8c8d192f4b9aa713ad99036f004007",
      "0xa5683dda11c1f1f0143471e0741b5be6d4cb9323",
      "0x650915fcd9f4d7c186affba606ca5bae1d05f4a5",
      "0x70a93e4d958bf023bf1e2cb7efcfc935e5b2c29d",
      "0xe541529b40f00a081fcea9be3e3dc00919e6ce1a",
      "0x7f08a7924d7f09d603cdefa061c3e8914147ead7",
      "0x9caa3c46a0635a1eb79033a22aaa72c82fba9cfe",
      "0x82bbcac5a8b81368a4a96f0265cb40e46020a1e1",
      "0xa38232df0d62f6a36d7761680c9e2106d049bd3d",
      "0xb9a292ca3856b64d1b69503e7a8f78bb03cdc4e5",
      "0x5f27e1a81965c8a91f7ec287f0a62067c173045d",
      "0xefbd0604d91919dda0a3d64a50e0659de93d417c",
      "0x10cda82ea4cd56d32c5a5e6dfcaa7af51d2ba350",
      "0x0981f0e2b61575ff55074c76a539108bdc354148",
    ],
    [
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    ],
    [
      parseEther("17"),
      parseEther("12"),
      parseEther("11.6"),
      parseEther("11.3"),
      parseEther("10.6"),
      parseEther("8.76"),
      parseEther("7.4"),
      parseEther("2.54"),
      parseEther("2.43"),
      parseEther("1.45"),
      parseUnits("18693", 6),
      parseUnits("303", 6),
      parseUnits("0.82", 8),
      parseUnits("0.6", 8),
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
