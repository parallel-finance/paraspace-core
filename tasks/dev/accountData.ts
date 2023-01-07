import {fromBn} from "evm-bn";
import {task} from "hardhat/config";

task("account-data", "Print account data")
  .addPositionalParam("user", "user address")
  .setAction(async ({user}, DRE) => {
    await DRE.run("set-DRE");
    const {getPoolProxy} = await import("../../helpers/contracts-getters");
    const pool = await getPoolProxy();
    const accountData = await pool.getUserAccountData(user);
    console.log();
    console.log(user);
    console.log(" HF:", fromBn(accountData.healthFactor));
    console.log(
      " ERC721 HF:",
      fromBn(accountData.erc721HealthFactor).toString()
    );
    console.log(
      " availableBorrowsBase:",
      fromBn(accountData.availableBorrowsBase).toString()
    );
    console.log(
      " totalCollateralBase:",
      fromBn(accountData.totalCollateralBase).toString()
    );
    console.log(
      " totalDebtBase:",
      fromBn(accountData.totalDebtBase).toString()
    );
  });
