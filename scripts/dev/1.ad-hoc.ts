import rawBRE from "hardhat";
import {
  getAccount,
  getERC20, getFirstSigner,
  getNToken, getParaSpaceOracle, getPoolAddressesProvider, getPoolConfiguratorProxy,
  getPoolProxy, getPToken, getUiPoolDataProvider, getWETH,
} from "../../helpers/contracts-getters";
import {deployReserveInterestRateStrategy} from "../../helpers/contracts-deployments";
import {zeroAddress} from "ethereumjs-util";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {DefaultReserveInterestRateStrategy__factory} from "../../types";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {MAX_UINT_AMOUNT} from "../../helpers/constants";

const setInterestRateStrategy = async () => {
  const poolConfigure = await getPoolConfiguratorProxy();
  if (DRY_RUN) {
    const encodedData = poolConfigure.interface.encodeFunctionData(
        "setReserveInterestRateStrategyAddress",
        ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x26ff62a59e3f6627bb9f89c9733ce34e7cf1fbb5"]
    );
    await dryRunEncodedData(poolConfigure.address, encodedData);
  } else {
    await waitForTx(
        await poolConfigure.setReserveInterestRateStrategyAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x26ff62a59e3f6627bb9f89c9733ce34e7cf1fbb5", GLOBAL_OVERRIDES)
    );
  }
}

const adHoc = async () => {
  console.time("ad-hoc");


  const rate = await DefaultReserveInterestRateStrategy__factory.connect("0x621b903f9F145721303f311eD308367b3DeC3048", await getFirstSigner());
  console.log("rate:", await rate.calculateMaxYearAPY());

  console.timeEnd("ad-hoc");
};

const checkTreasure = async () => {
  const addressProvider = await getPoolAddressesProvider();
  const uipooldataProvider = await getUiPoolDataProvider();
  const reserveData = await uipooldataProvider.getReservesData(addressProvider.address);
  for (let i=0; i<reserveData[0].length; i++) {
    const data = reserveData[0][i];
    const symbol = data.symbol;
    const accruedToTreasury = data.accruedToTreasury;
    console.log("symbol:", symbol, " accruedToTreasury:", accruedToTreasury);
  }
};

const mintToTreasury = async () => {
  const pool = await getPoolProxy();
  await pool.mintToTreasury(["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"]);
};

const withdrawpETH = async () => {
  const pool = await getPoolProxy();
  const weth = await getWETH("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  // const pToken = await getPToken("0x00287aB9ACA50040cD09BB86C0A0C7A593328309");
  await waitForTx(await pool.withdraw("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", MAX_UINT_AMOUNT, "0xf2B18c20Ed5E5a6ABB15377D619C1879639339AD"));
  const balance = await weth.balanceOf("0xf2B18c20Ed5E5a6ABB15377D619C1879639339AD");
  await waitForTx(await weth.withdraw(balance));

}

const checkNTokenHolder = async (xTokenAddress: string) => {
  console.time("ad-hoc");
  const nPPG = await getNToken(xTokenAddress);
  const owners: Array<string> = [];
  const total = await nPPG.totalSupply();
  for (let i = 0; i < total.toNumber(); i++) {
    const tokenId = await nPPG.tokenByIndex(i);
    const owner = await nPPG.ownerOf(tokenId);
    if (!owners.includes(owner)) {
      owners.push(owner);
    }
  }
  console.log("owners:", JSON.stringify(owners));
  for (let i = 0; i < owners.length; i++) {
    const balance = await nPPG.balanceOf(owners[i]);
    console.log("owner:", owners[i], " balance:", balance.toNumber());
    const account = await getAccount(owners[i]);
    const eoa = await account.owner();
    console.log("eoa:", eoa);
  }

  console.timeEnd("ad-hoc");
};

const checkUserPosition = async () => {
  const pool = await getPoolProxy();
   const data0 = await pool.getUserAccountData("0x2580bEe6d68b3515068ecA185E19209864F517e8", {
     blockTag:19392090
   });
  //  console.log("erc721HealthFactor:", data.erc721HealthFactor);
  // console.log("availableBorrowsBase:", data.availableBorrowsBase);
  console.log("healthFactor:", data0.healthFactor);

  const data1 = await pool.getUserAccountData("0x2580bEe6d68b3515068ecA185E19209864F517e8");
  //  console.log("erc721HealthFactor:", data.erc721HealthFactor);
  // console.log("availableBorrowsBase:", data.availableBorrowsBase);
  console.log("healthFactor:", data1.healthFactor);

}

const testInterestRate = async () => {
  // const poolProvider = await getPoolAddressesProvider();
  const strategy = await deployReserveInterestRateStrategy("TestRating2", [
    zeroAddress(),
    "850000000000000000000000000",
    "40000000000000000000000000",
    "60000000000000000000000000",
    "350000000000000000000000000",
  ],false);

  const maxRate = await strategy.calculateMaxYearAPY();
  console.log("maxRate:", maxRate);
};

const dropReserve = async () => {
  const poolConfigure = await getPoolConfiguratorProxy();
  if (DRY_RUN) {
    const encodedData = poolConfigure.interface.encodeFunctionData(
        "dropReserve",
        ["0x3af2a97414d1101e2107a70e7f33955da1346305"]
    );
    await dryRunEncodedData(poolConfigure.address, encodedData);
  } else {
    await waitForTx(
        await poolConfigure.dropReserve("0x3af2a97414d1101e2107a70e7f33955da1346305", GLOBAL_OVERRIDES)
    );
  }
}

const repalceOracle = async () => {
  const oracle = await getParaSpaceOracle();
  if (DRY_RUN) {
    const encodedData = oracle.interface.encodeFunctionData(
        "setAssetSources",
        [
          [],
          []
        ]
    );
    await dryRunEncodedData(oracle.address, encodedData);
  } else {
    await waitForTx(
        await oracle.setAssetSources(
            [],
            [],
            GLOBAL_OVERRIDES)
    );
  }
}

async function main() {
  await rawBRE.run("set-DRE");

  await dropReserve();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
