import rawBRE from "hardhat";
import {MAX_UINT_AMOUNT} from "../../helpers/constants";
import {
  getAutoCompoundApe,
  getERC20,
  getPoolProxy,
  getVariableDebtToken,
  getWETH,
  getWETHGatewayProxy,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, MULTI_SIG} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

const repay = async () => {
  console.time("repay");
  const pool = await getPoolProxy();
  const cape = await getAutoCompoundApe();
  const ape = await getERC20("0x4d224452801ACEd8B2F0aebE155379bb5D594381");
  const weth = await getWETH("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  const debtWeth = await getVariableDebtToken(
    "0x87F92191e14d970f919268045A57f7bE84559CEA"
  );
  const wethgateway = await getWETHGatewayProxy();
  const wstETH = await getERC20("0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0");
  const debtcape = await getVariableDebtToken(
    "0x0B51c7497C2875eAc76A68496FE5853DdbDA8091"
  );

  if (DRY_RUN) {
    const encodedData1 = pool.interface.encodeFunctionData("repayWithPTokens", [
      cape.address,
      MAX_UINT_AMOUNT,
    ]);
    await dryRunEncodedData(pool.address, encodedData1);

    const encodedData2 = pool.interface.encodeFunctionData("repayWithPTokens", [
      wstETH.address,
      MAX_UINT_AMOUNT,
    ]);
    await dryRunEncodedData(pool.address, encodedData2);

    const encodedData3 = cape.interface.encodeFunctionData("unpause");
    await dryRunEncodedData(cape.address, encodedData3);

    const encodedData4 = ape.interface.encodeFunctionData("approve", [
      cape.address,
      MAX_UINT_AMOUNT,
    ]);
    await dryRunEncodedData(ape.address, encodedData4);

    const encodedData5 = cape.interface.encodeFunctionData("approve", [
      pool.address,
      MAX_UINT_AMOUNT,
    ]);
    await dryRunEncodedData(cape.address, encodedData5);

    const encodedData6 = weth.interface.encodeFunctionData("approve", [
      pool.address,
      MAX_UINT_AMOUNT,
    ]);
    await dryRunEncodedData(weth.address, encodedData6);

    const encodedData7 = cape.interface.encodeFunctionData("deposit", [
      MULTI_SIG,
      (await debtcape.balanceOf(MULTI_SIG)).add(1),
    ]);
    await dryRunEncodedData(cape.address, encodedData7);
    const encodedData8 = pool.interface.encodeFunctionData("repay", [
      cape.address,
      MAX_UINT_AMOUNT,
      MULTI_SIG,
    ]);
    await dryRunEncodedData(pool.address, encodedData8);

    const encodedData9 = await wethgateway.interface.encodeFunctionData(
      "repayETH",
      [MAX_UINT_AMOUNT, MULTI_SIG]
    );
    await dryRunEncodedData(
      weth.address,
      encodedData9,
      (await debtWeth.balanceOf(MULTI_SIG)).toString()
    );

    const encodedData10 = cape.interface.encodeFunctionData("pause");
    await dryRunEncodedData(cape.address, encodedData10);
  } else {
    await waitForTx(await pool.repayWithPTokens(cape.address, MAX_UINT_AMOUNT));
    await waitForTx(
      await pool.repayWithPTokens(wstETH.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(await cape.unpause());
    await waitForTx(await ape.approve(cape.address, MAX_UINT_AMOUNT));
    await waitForTx(await cape.approve(pool.address, MAX_UINT_AMOUNT));
    await waitForTx(await weth.approve(pool.address, MAX_UINT_AMOUNT));
    await waitForTx(
      await cape.deposit(
        MULTI_SIG,
        (await debtcape.balanceOf(MULTI_SIG)).add(1)
      )
    );

    await waitForTx(await pool.repay(cape.address, MAX_UINT_AMOUNT, MULTI_SIG));
    await waitForTx(
      await wethgateway.repayETH(MAX_UINT_AMOUNT, MULTI_SIG, {
        value: await debtWeth.balanceOf(MULTI_SIG),
      })
    );
    await waitForTx(await cape.pause());
  }

  await console.timeEnd("repay");
};

async function main() {
  await rawBRE.run("set-DRE");
  await repay();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
