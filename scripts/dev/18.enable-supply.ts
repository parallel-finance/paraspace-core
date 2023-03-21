import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployBorrowLogic,
  deploySupplyLogic,
  getPoolSignatures,
} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getPoolAddressesProvider,
  getPoolProxy,
  getUniswapV3SwapRouter,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getContractAddressInDb,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";
import {
  IParaProxy,
  PoolApeStaking__factory,
  PoolCore__factory,
} from "../../types";

const enableSupply = async (verify = false) => {
  console.time("enable-supply");
  const addressesProvider = await getPoolAddressesProvider();
  const pool = await getPoolProxy();

  console.time("upgrade PoolCore & PoolApeStaking");
  const oldPoolCoreSelectors = await pool.facetFunctionSelectors(
    "0x06e55bEBebB37c4f6fCa99d78d1d6f2827E3AA16"
  );
  const oldPoolApeStakingSelectors = await pool.facetFunctionSelectors(
    "0x952b0D0a16ced05baB1bd43562a32425b250e86F"
  );
  const implementation = [
    {
      implAddress: ZERO_ADDRESS,
      action: 2,
      functionSelectors: oldPoolCoreSelectors,
    },
    {
      implAddress: ZERO_ADDRESS,
      action: 2,
      functionSelectors: oldPoolApeStakingSelectors,
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
  const {poolCoreSelectors, poolApeStakingSelectors} = getPoolSignatures();
  const poolCore = await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [addressesProvider.address],
    verify,
    false,
    coreLibraries,
    poolCoreSelectors
  );
  const apeStakingLibraries = {
    "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic":
      borrowLogic.address,
    "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic":
      supplyLogic.address,
  };
  const poolApeStaking = await withSaveAndVerify(
    new PoolApeStaking__factory(apeStakingLibraries, await getFirstSigner()),
    eContractid.PoolApeStakingImpl,
    [
      addressesProvider.address,
      await getContractAddressInDb(eContractid.cAPE),
      "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      (await getUniswapV3SwapRouter()).address,
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      3000,
      500,
    ],
    verify,
    false,
    apeStakingLibraries,
    poolApeStakingSelectors
  );
  const implementations = [
    [poolCore.address, poolCoreSelectors.map((s) => s.signature)],
    [poolApeStaking.address, poolApeStakingSelectors.map((s) => s.signature)],
  ] as [string, string[]][];
  const [coreProxyImplementation, apeStakingProxyImplementation] =
    implementations.map(([implAddress, newSelectors]) => {
      const proxyImplementation: IParaProxy.ProxyImplementationStruct[] = [];
      if (newSelectors.length)
        proxyImplementation.push({
          implAddress,
          action: 0,
          functionSelectors: newSelectors,
        });
      return proxyImplementation;
    });
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
  console.log("apeStakingProxyImplementation:", apeStakingProxyImplementation);
  if (apeStakingProxyImplementation) {
    if (DRY_RUN) {
      const encodedData = addressesProvider.interface.encodeFunctionData(
        "updatePoolImpl",
        [apeStakingProxyImplementation, ZERO_ADDRESS, "0x"]
      );
      await dryRunEncodedData(addressesProvider.address, encodedData);
    } else {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          apeStakingProxyImplementation,
          ZERO_ADDRESS,
          "0x",
          GLOBAL_OVERRIDES
        )
      );
    }
  }
  console.timeEnd("upgrade PoolCore & PoolApeStaking");

  console.timeEnd("enable-supply");
};

async function main() {
  await rawBRE.run("set-DRE");
  await enableSupply();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
