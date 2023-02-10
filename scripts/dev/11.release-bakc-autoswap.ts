import rawBRE from "hardhat";
import {
  getPoolProxy,
  getUniswapV3SwapRouter,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

const releaseBAKCAutoSwap = async () => {
  console.time("release-bakc-autoswap");
  const pool = await getPoolProxy();
  const swapRouter = await getUniswapV3SwapRouter();

  if (DRY_RUN) {
    const encodedData = pool.interface.encodeFunctionData(
      "unlimitedApproveTo",
      ["0x4d224452801ACEd8B2F0aebE155379bb5D594381", swapRouter.address]
    );
    await dryRunEncodedData(pool.address, encodedData);
  } else {
    await waitForTx(
      await pool.unlimitedApproveTo(
        "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
        swapRouter.address
      )
    );
  }
  console.timeEnd("release-bakc-autoswap");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseBAKCAutoSwap();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
