import {parseEther} from "ethers/lib/utils";
import {fromBn} from "evm-bn";
import rawBRE from "hardhat";
import {WAD, ZERO_ADDRESS} from "../../helpers/constants";
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
  impersonateAddress,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {
  DRY_RUN,
  GLOBAL_OVERRIDES,
  MULTI_SIG,
} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";
import {IParaProxy, PoolCore__factory} from "../../types";
import {upgradeAutoCompoundApe} from "../upgrade/autoCompoundApe";

const fixHack = async (verify = false) => {
  console.time("fix-hack");

  const ETH_FUND_ACCOUNT = await impersonateAddress(
    "0xd186540FbCc460f6a3A9e705DC6d2406cBcc1C47"
  );
  const ATTACK_BLOCK = 16845559;
  await ETH_FUND_ACCOUNT.signer.sendTransaction({
    to: MULTI_SIG,
    value: parseEther("2900"),
  });

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

  console.time("upgrade cAPE");
  await upgradeAutoCompoundApe(verify);
  console.timeEnd("upgrade cAPE");

  console.time("withdraw extra APE from ApeCoinStaking");
  const cAPE = await getAutoCompoundApe();
  if (DRY_RUN) {
    const encodedData = cAPE.interface.encodeFunctionData(
      "withdrawFromApeCoinStaking",
      [MULTI_SIG]
    );
    await dryRunEncodedData(cAPE.address, encodedData);
  }
  console.timeEnd("withdraw extra APE from ApeCoinStaking");

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
