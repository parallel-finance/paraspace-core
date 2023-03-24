import rawBRE from "hardhat";
import {deployTimeLockImplAndAssignItToProxy} from "../../helpers/contracts-deployments";
import {
  getNTokenOtherdeed,
  getPoolAddressesProvider,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getCurrentTime,
} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";

const releaseTimeLockOthr = async (verify = false) => {
  console.time("release-timelock-othr");
  const addressesProvider = await getPoolAddressesProvider();
  await deployTimeLockImplAndAssignItToProxy(addressesProvider.address, verify);

  const nOTHR = await getNTokenOtherdeed(
    "0xFE89c46c1A9aaC5f09DF9c4A570Af017F06A48DB"
  );
  const paraSpaceConfig = getParaSpaceConfig();
  const currentTime = await getCurrentTime();
  if (DRY_RUN) {
    const encodedData = nOTHR.interface.encodeFunctionData("setHotWallet", [
      paraSpaceConfig.HotWallet!,
      currentTime.add(2592000),
      true,
    ]);
    await dryRunEncodedData(nOTHR.address, encodedData);
  } else {
    await waitForTx(
      await nOTHR.setHotWallet(
        paraSpaceConfig.HotWallet!,
        currentTime.add(2592000),
        true
      )
    );
  }
  console.timeEnd("release-timelock-othr");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseTimeLockOthr();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
