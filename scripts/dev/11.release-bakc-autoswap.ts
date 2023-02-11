import rawBRE from "hardhat";
import {pick} from "lodash";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployBorrowLogic,
  deploySupplyLogic,
} from "../../helpers/contracts-deployments";
import {
  getAllTokens,
  getFirstSigner,
  getPoolAddressesProvider,
  getPoolProxy,
  getUniswapV3SwapRouter,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getFunctionSignatures,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid, ERC20TokenContractId} from "../../helpers/types";
import {
  IParaProxy,
  PoolApeStaking__factory,
  PoolCore__factory,
} from "../../types";

const releaseBAKCAutoSwap = async (verify = false) => {
  console.time("release-bakc-autoswap");
  const pool = await getPoolProxy();
  const provider = await getPoolAddressesProvider();
  const swapRouter = await getUniswapV3SwapRouter();
  const allTokens = await getAllTokens();

  const supplyLogic = await deploySupplyLogic(verify);
  const borrowLogic = await deployBorrowLogic(verify);

  const coreLibraries = {
    ["contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic"]:
      "0x94e3e8bbf8d2b7ef609ad937979307489ad4e38e",
    ["contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic"]:
      "0x042becf5f4e68255ac00074742bd669fceb0b23f",
    ["contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic"]:
      supplyLogic.address,
    ["contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic"]:
      borrowLogic.address,
    ["contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic"]:
      "0x1c96aa82dcde07fad8b2a279de5008687cc9ad0e",
  };
  const apeStakingLibraries = pick(coreLibraries, [
    "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic",
    "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic",
  ]);

  const newApeStakingSelectors = getFunctionSignatures(
    PoolApeStaking__factory.abi
  );
  const newCoreSelectors = getFunctionSignatures(PoolCore__factory.abi);

  const poolApeStaking = await withSaveAndVerify(
    new PoolApeStaking__factory(apeStakingLibraries, await getFirstSigner()),
    eContractid.PoolApeStakingImpl,
    [
      provider.address,
      "0xC5c9fB6223A989208Df27dCEE33fC59ff5c26fFF",
      "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
      allTokens[ERC20TokenContractId.USDC].address,
      swapRouter.address,
    ],
    verify,
    false,
    apeStakingLibraries,
    newApeStakingSelectors
  );
  const poolCore = await withSaveAndVerify(
    new PoolCore__factory(coreLibraries, await getFirstSigner()),
    eContractid.PoolCoreImpl,
    [provider.address],
    verify,
    false,
    coreLibraries,
    newCoreSelectors
  );

  const oldApeStakingSelectors = await pool.facetFunctionSelectors(
    "0x8636946E1bC715a0Fea68e1c3A61DCa1e9D32610"
  );
  const oldCoreSelectors = await pool.facetFunctionSelectors(
    "0x2E2315F401948367ab8D5E7abe2a783a0b3695b8"
  );
  const apeStakingToAdd = newApeStakingSelectors.filter(
    (s) => !oldApeStakingSelectors.includes(s.signature)
  );
  const apeStakingToReplace = newApeStakingSelectors.filter((s) =>
    oldApeStakingSelectors.includes(s.signature)
  );
  const apeStakingToRemove = oldApeStakingSelectors.filter(
    (s) => !newApeStakingSelectors.map((x) => x.signature).includes(s)
  );
  const coreToAdd = newCoreSelectors.filter(
    (s) => !oldCoreSelectors.includes(s.signature)
  );
  const coreToReplace = newCoreSelectors.filter((s) =>
    oldCoreSelectors.includes(s.signature)
  );
  const coreToRemove = oldCoreSelectors.filter(
    (s) => !newCoreSelectors.map((x) => x.signature).includes(s)
  );
  const apeStakingImplChange: IParaProxy.ProxyImplementationStruct[] = [];
  const coreImplChange: IParaProxy.ProxyImplementationStruct[] = [];
  if (apeStakingToRemove.length)
    apeStakingImplChange.push({
      implAddress: ZERO_ADDRESS,
      action: 2,
      functionSelectors: apeStakingToRemove,
    });
  if (apeStakingToReplace.length)
    apeStakingImplChange.push({
      implAddress: poolApeStaking.address,
      action: 1,
      functionSelectors: apeStakingToReplace.map((s) => s.signature),
    });
  if (apeStakingToAdd.length)
    apeStakingImplChange.push({
      implAddress: poolApeStaking.address,
      action: 0,
      functionSelectors: apeStakingToAdd.map((s) => s.signature),
    });
  if (coreToRemove.length)
    coreImplChange.push({
      implAddress: ZERO_ADDRESS,
      action: 2,
      functionSelectors: coreToRemove,
    });
  if (coreToReplace.length)
    coreImplChange.push({
      implAddress: poolCore.address,
      action: 1,
      functionSelectors: coreToReplace.map((s) => s.signature),
    });
  if (coreToAdd.length)
    coreImplChange.push({
      implAddress: poolCore.address,
      action: 0,
      functionSelectors: coreToAdd.map((s) => s.signature),
    });
  console.log(apeStakingImplChange);
  console.log(coreImplChange);

  console.time("upgrade PoolApeStaking");
  if (DRY_RUN) {
    const encodedData = provider.interface.encodeFunctionData(
      "updatePoolImpl",
      [apeStakingImplChange, ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(provider.address, encodedData);
  }
  console.timeEnd("upgrade PoolApeStaking");

  console.time("upgrade PoolCore");
  if (DRY_RUN) {
    const encodedData = provider.interface.encodeFunctionData(
      "updatePoolImpl",
      [coreImplChange, ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(provider.address, encodedData);
  }
  console.timeEnd("upgrade PoolCore");

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
