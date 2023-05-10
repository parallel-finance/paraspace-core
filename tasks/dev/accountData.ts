import {fromBn} from "evm-bn";
import {task} from "hardhat/config";

task("account-data", "Print account data")
  .addPositionalParam("user", "user address")
  .addPositionalParam("blockHash", "block hash", undefined, undefined, true)
  .setAction(async ({user, blockHash}, DRE) => {
    await DRE.run("set-DRE");
    const {getPoolProxy, getUiPoolDataProvider, getPoolAddressesProvider} =
      await import("../../helpers/contracts-getters");
    const {getParaSpaceConfig} = await import("../../helpers/misc-utils");
    const pool = await getPoolProxy();
    const ui = await getUiPoolDataProvider();
    const provider = await getPoolAddressesProvider();
    const reservesData = await ui.getUserReservesData(provider.address, user);
    const paraSpaceConfig = await getParaSpaceConfig();
    const baseDecimals = paraSpaceConfig.Oracle.BaseCurrencyDecimals;

    const accountData = await pool.getUserAccountData(user, {
      blockTag: blockHash,
    });
    console.log();
    console.log(user);
    console.log(" HF:", fromBn(accountData.healthFactor));
    console.log(
      " ERC721 HF:",
      fromBn(accountData.erc721HealthFactor).toString()
    );
    console.log(
      " availableBorrowsBase:",
      fromBn(accountData.availableBorrowsBase, baseDecimals).toString()
    );
    console.log(
      " totalCollateralBase:",
      fromBn(accountData.totalCollateralBase, baseDecimals).toString()
    );
    console.log(
      " totalDebtBase:",
      fromBn(accountData.totalDebtBase, baseDecimals).toString()
    );
    console.log();

    for (const x of reservesData.filter(
      (x) => x.currentXTokenBalance.gt(0) || x.scaledVariableDebt.gt(0)
    )) {
      console.log("", x.underlyingAsset);
      console.log("  currentXTokenBalance:", x.currentXTokenBalance.toString());
      console.log("  scaledXTokenBalance:", x.scaledXTokenBalance.toString());
      console.log(
        "  collateralizedBalance:",
        x.collateralizedBalance.toString()
      );
      console.log(
        "  usageAsCollateralEnabledOnUser:",
        x.usageAsCollateralEnabledOnUser
      );
      console.log("  scaledVariableDebt:", x.scaledVariableDebt.toString());
      console.log();
    }
  });
