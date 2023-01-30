import BigNumber from "bignumber.js";
import rawBRE from "hardhat";
import {WAD} from "../../helpers/constants";
import {deployERC721AtomicOracleWrapper} from "../../helpers/contracts-deployments";
import {
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getUiPoolDataProvider,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

const adHoc = async () => {
  console.time("ad-hoc");
  const oracle = await getParaSpaceOracle();
  const ui = await getUiPoolDataProvider();
  const provider = await getPoolAddressesProvider();

  const [reservesData] = await ui.getReservesData(provider.address);
  for (const x of reservesData.filter((r) => r.assetType == 1)) {
    const oldWrapper = await oracle.getSourceOfAsset(x.underlyingAsset);
    const newWrapper = await deployERC721AtomicOracleWrapper(
      provider.address,
      oldWrapper,
      x.underlyingAsset,
      x.symbol
    );
    if (
      x.underlyingAsset == "0xF40299b626ef6E197F5d9DE9315076CAB788B6Ef" ||
      x.symbol == "BAYC"
    ) {
      await newWrapper.setPriceMultiplier(
        46,
        new BigNumber(WAD).multipliedBy(6).toString()
      );
      await newWrapper.setPriceMultiplier(
        77,
        new BigNumber(WAD).multipliedBy(2.5).toString()
      );
      await newWrapper.setPriceMultiplier(
        49,
        new BigNumber(WAD).multipliedBy(2.7).toString()
      );
      await newWrapper.setPriceMultiplier(
        42,
        new BigNumber(WAD).multipliedBy(1.8).toString()
      );
      await newWrapper.setPriceMultiplier(
        69,
        new BigNumber(WAD).multipliedBy(1.2).toString()
      );
    } else if (
      x.underlyingAsset == "0x3f228cBceC3aD130c45D21664f2C7f5b23130d23" ||
      x.symbol == "MAYC"
    ) {
      await newWrapper.setPriceMultiplier(
        51,
        new BigNumber(WAD).multipliedBy(2.6).toString()
      );
      await newWrapper.setPriceMultiplier(
        59,
        new BigNumber(WAD).multipliedBy(1.8).toString()
      );
      await newWrapper.setPriceMultiplier(
        87,
        new BigNumber(WAD).multipliedBy(1.4).toString()
      );
      await newWrapper.setPriceMultiplier(
        78,
        new BigNumber(WAD).multipliedBy(1.2).toString()
      );
      await newWrapper.setPriceMultiplier(
        44,
        new BigNumber(WAD).multipliedBy(1.2).toString()
      );
    } else if (
      x.underlyingAsset == "0xd60d682764Ee04e54707Bee7B564DC65b31884D0" ||
      x.symbol == "BAKC"
    ) {
      await newWrapper.setPriceMultiplier(
        98,
        new BigNumber(WAD).multipliedBy(1.8).toString()
      );
      await newWrapper.setPriceMultiplier(
        110,
        new BigNumber(WAD).multipliedBy(1.2).toString()
      );
      await newWrapper.setPriceMultiplier(
        64,
        new BigNumber(WAD).multipliedBy(1.2).toString()
      );
    } else if (
      x.underlyingAsset == "0x88f53982a128711021d32cE67a2ae400f38A24d8" ||
      x.symbol == "OTHR"
    ) {
      await newWrapper.setPriceMultiplier(
        10000,
        new BigNumber(WAD).multipliedBy(6).toString()
      );
    } else if (
      x.underlyingAsset == "0x1711B51f92583da7f65b2f938b5832f98FD0C6C6" ||
      x.symbol == "AZUKI"
    ) {
      await newWrapper.setPriceMultiplier(
        97,
        new BigNumber(WAD).multipliedBy(6.5).toString()
      );
      await newWrapper.setPriceMultiplier(
        21,
        new BigNumber(WAD).multipliedBy(4).toString()
      );
      await newWrapper.setPriceMultiplier(
        22,
        new BigNumber(WAD).multipliedBy(4).toString()
      );
      await newWrapper.setPriceMultiplier(
        49,
        new BigNumber(WAD).multipliedBy(2.7).toString()
      );
      await newWrapper.setPriceMultiplier(
        48,
        new BigNumber(WAD).multipliedBy(2.5).toString()
      );
      await newWrapper.setPriceMultiplier(
        58,
        new BigNumber(WAD).multipliedBy(2.5).toString()
      );
      await newWrapper.setPriceMultiplier(
        53,
        new BigNumber(WAD).multipliedBy(2.3).toString()
      );
      await newWrapper.setPriceMultiplier(
        88,
        new BigNumber(WAD).multipliedBy(2).toString()
      );
    }
    if (DRY_RUN) {
      const encodedData = oracle.interface.encodeFunctionData(
        "setAssetSources",
        [[x.underlyingAsset], [newWrapper.address]]
      );
      await dryRunEncodedData(oracle.address, encodedData);
    } else {
      await waitForTx(
        await oracle.setAssetSources([x.underlyingAsset], [newWrapper.address])
      );
    }
  }
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
