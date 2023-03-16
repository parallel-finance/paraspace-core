import {parseUnits} from "ethers/lib/utils";
import {task} from "hardhat/config";

task("rescue-erc20-from-ntoken", "Rescue ERC20 from NToken")
  .addPositionalParam("ntoken", "ntoken")
  .addPositionalParam("token", "token")
  .addPositionalParam("to", "to")
  .addPositionalParam("amount", "amount")
  .setAction(async ({ntoken, token, to, amount}, DRE) => {
    await DRE.run("set-DRE");

    const {getPoolProxy, getAllTokens, getNToken} = await import(
      "../../helpers/contracts-getters"
    );
    const {dryRunEncodedData} = await import("../../helpers/contracts-helpers");
    const allTokens = await getAllTokens();
    const pool = await getPoolProxy();

    const nTokenAddress = (await pool.getReserveData(allTokens[ntoken].address))
      .xTokenAddress;
    const tokenAddress = allTokens[token].address;
    const decimals = await allTokens[token].decimals();

    const encodedData = (
      await getNToken(nTokenAddress)
    ).interface.encodeFunctionData("rescueERC20", [
      tokenAddress,
      to,
      parseUnits(amount, decimals),
    ]);

    await dryRunEncodedData(nTokenAddress, encodedData);
  });
