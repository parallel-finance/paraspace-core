// import {parseEther} from "ethers/lib/utils";
import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployBorrowLogic,
  deploySupplyLogic,
  getPoolSignatures,
} from "../../helpers/contracts-deployments";
import {
  getAutoCompoundApe,
  getFirstSigner,
  getPoolAddressesProvider,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  // impersonateAddress,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {
  DRY_RUN,
  GLOBAL_OVERRIDES,
  HACK_RECOVERY,
} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";
import {IParaProxy, PoolCore__factory} from "../../types";

const fixHack = async (verify = false) => {
  console.time("fix-hack");

  // if (isFork()) {
  //   const ETH_FUND_ACCOUNT = await impersonateAddress(
  //     "0x909e36B512Ed45250fdff513523119d825647695"
  //   );
  //   // const ATTACK_BLOCK = 16845559;
  //   await waitForTx(
  //     await ETH_FUND_ACCOUNT.signer.sendTransaction({
  //       to: HACK_RECOVERY,
  //       value: parseEther("2900"),
  //     })
  //   );
  // }

  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();

  console.time("upgrade PoolCore");
  const oldPoolCoreSelectors = await pool.facetFunctionSelectors(
    "0xd9fFe514E96014Fa79bc0C33874Dd2eF20678f6f"
  );
  const implementation = [
    {
      implAddress: ZERO_ADDRESS,
      action: 2,
      functionSelectors: oldPoolCoreSelectors,
    },
  ];
  if (DRY_RUN) {
    const encodedData = addressesProvider.interface.encodeFunctionData(
      "updatePoolImpl",
      [implementation, ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(addressesProvider.address, encodedData);
  } else {
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        implementation,
        ZERO_ADDRESS,
        "0x",
        GLOBAL_OVERRIDES
      )
    );
  }
  const supplyLogic = await deploySupplyLogic(verify);
  const borrowLogic = await deployBorrowLogic(verify);
  const auctionLogic = "0x462FCbD3A16A9a09fE686CDf40d0c0b3E493a3aB";
  const liquidationLogic = "0xB52b7C8Ad64d6aF115d730c5E016c0Ea0fDf5125";
  const flashClaimLogic = "0x6280760c550b5424F4F25d627D4E52982d0C7905";
  const coreLibraries = {
    ["contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic"]:
      auctionLogic,
    ["contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic"]:
      liquidationLogic,
    ["contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic"]:
      supplyLogic.address,
    ["contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic"]:
      borrowLogic.address,
    ["contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic"]:
      flashClaimLogic,
  };
  const {poolCoreSelectors} = getPoolSignatures();
  const poolCore = await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [addressesProvider.address],
    verify,
    false,
    coreLibraries,
    poolCoreSelectors
  );
  const implementations = [
    [poolCore.address, poolCoreSelectors.map((s) => s.signature)],
  ] as [string, string[]][];
  const [coreProxyImplementation] = implementations.map(
    ([implAddress, newSelectors]) => {
      const proxyImplementation: IParaProxy.ProxyImplementationStruct[] = [];
      if (newSelectors.length)
        proxyImplementation.push({
          implAddress,
          action: 0,
          functionSelectors: newSelectors,
        });
      return proxyImplementation;
    }
  );
  console.log("coreProxyImplementation:", coreProxyImplementation);
  if (coreProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [coreProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await dryRunEncodedData(addressesProvider.address, encodedData);
    } else {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          coreProxyImplementation,
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("upgrade PoolCore");

  console.time("withdraw extra APE from ApeCoinStaking");
  const cAPE = await getAutoCompoundApe();
  if (DRY_RUN) {
    const encodedData = cAPE.interface.encodeFunctionData(
      "tmp_fix_withdrawFromApeCoinStaking",
      [HACK_RECOVERY]
    );
    await dryRunEncodedData(cAPE.address, encodedData);
  }
  console.timeEnd("withdraw extra APE from ApeCoinStaking");

  console.time("fix sub accounts");
  if (DRY_RUN) {
    const encodedData = pool.interface.encodeFunctionData(
      "tmp_fix_pauseInterest"
    );
    await dryRunEncodedData(pool.address, encodedData);
  }
  console.timeEnd("fix sub accounts");

  console.time("transfer hacker position");
  if (DRY_RUN) {
    const encodedData = pool.interface.encodeFunctionData(
      "tmp_fix_transferHackerPosition",
      [
        [
          "0xc0064dea80567e7abd0294e55db32426535001cc",
          "0x0DAb8bbc6B23234CB95c2063199daF9FAaFd0288",
          "0x335441A28B16Ae8A89541307fe398A4bdA35fb76",
          "0x5eF895a4320312127Ba01678Aa5Aa87C3A404C16",
          "0xBC1f4b38EC14396B7482496aE5711774D44ABC94",
          "0xfcE3d3D46Ddd52e6CBe353A5664263298bFd2BeF",
          "0x19Ec952365151a53a5B1b5BE04dF16Df9b0Bb15c",
          "0xD81EbCF3748C0EeA59C141e6233cFcEE4D3Dcc06",
          "0xB5ae840838f6f9497aDfCC8747E6A232F62b76fd",
        ],
        HACK_RECOVERY,
      ]
    );
    await dryRunEncodedData(pool.address, encodedData);
  }
  console.timeEnd("transfer hacker position");

  console.time("transfer cAPE ownership");
  if (DRY_RUN) {
    const encodedData = await cAPE.interface.encodeFunctionData(
      "transferOwnership",
      [HACK_RECOVERY]
    );
    await dryRunEncodedData(cAPE.address, encodedData);
  }
  console.timeEnd("transfer cAPE ownership");

  console.time("fix user position");
  console.timeEnd("fix-hack");
};

async function main() {
  await rawBRE.run("set-DRE");
  await fixHack();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
