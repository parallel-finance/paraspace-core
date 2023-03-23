import rawBRE from "hardhat";
import {
  getNToken,
  getPoolProxy,
  getTimeLockProxy,
} from "../../helpers/contracts-getters";
import {getProxyImplementation} from "../../helpers/contracts-helpers";
import {waitForTx} from "../../helpers/misc-utils";

const adHoc = async () => {
  console.time("ad-hoc");
  const pool = await getPoolProxy();
  const timeLock = await getTimeLockProxy();
  console.log(await getProxyImplementation(timeLock.address));
  console.log(
    await (
      await getNToken(
        (
          await pool.getReserveData(
            "0xF40299b626ef6E197F5d9DE9315076CAB788B6Ef"
          )
        ).xTokenAddress
      )
    ).DELEGATE_REGISTRY()
  );
  await waitForTx(
    await pool.withdrawERC721(
      "0xF40299b626ef6E197F5d9DE9315076CAB788B6Ef",
      [1683],
      "0x018281853eCC543Aa251732e8FDaa7323247eBeB"
    )
  );
  console.log(await pool.TIME_LOCK());
  // await deployUiPoolDataProvider(
  //   "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
  //   "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e"
  // );
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
