import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployP2PPairStaking,
  // deployParaSpaceAidrop,
} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getInitializableAdminUpgradeabilityProxy,
  getNToken,
  getP2PPairStaking,
  getPoolAddressesProvider,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getFunctionSignatures,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";
import {IParaProxy, PoolApeStaking__factory} from "../../types";

const releaseV142 = async (verify = false) => {
  console.time("release-v1.4.2");
  const pool = await getPoolProxy();
  const provider = await getPoolAddressesProvider();
  // console.log("deploy airdrop");
  // const airDrop = await deployParaSpaceAidrop(
  //   "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
  //   "2675468152",
  //   verify
  // );
  // await waitForTx(
  //   await airDrop.transferOwnership(
  //     "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714"
  //   )
  // );
  const apeStakingLibraries = {
    "contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic":
      "0xeC2C5d6B97Bf930ea687E7B29D487cb7562660Be",
    "contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic":
      "0xf3Cc33c6133410Ebc08f832D85688dd1F834Dd75",
  };
  const newSelectors = getFunctionSignatures(PoolApeStaking__factory.abi);
  const poolApeStaking = await withSaveAndVerify(
    new PoolApeStaking__factory(apeStakingLibraries, await getFirstSigner()),
    eContractid.PoolApeStakingImpl,
    [
      provider.address,
      "0xC5c9fB6223A989208Df27dCEE33fC59ff5c26fFF",
      "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
    ],
    verify,
    false,
    apeStakingLibraries,
    newSelectors
  );
  const oldSelectors = await pool.facetFunctionSelectors(
    "0xf1809240EF10F1aca92fC619ACa2c36eB1e9f226"
  );
  // const toAdd = newSelectors.filter((s) => !oldSelectors.includes(s.signature));
  const toReplace = newSelectors.filter((s) =>
    oldSelectors.includes(s.signature)
  );
  // const toRemove = oldSelectors.filter(
  //   (s) => !newSelectors.map((x) => x.signature).includes(s)
  // );
  const proxyImplementationChange: IParaProxy.ProxyImplementationStruct[] = [];
  // if (toRemove.length)
  //   proxyImplementationChange.push({
  //     implAddress: ZERO_ADDRESS,
  //     action: 2,
  //     functionSelectors: toRemove,
  //   });
  if (toReplace.length)
    proxyImplementationChange.push({
      implAddress: poolApeStaking.address,
      action: 1,
      functionSelectors: toReplace.map((s) => s.signature),
    });
  // if (toAdd.length)
  //   proxyImplementationChange.push({
  //     implAddress: poolApeStaking.address,
  //     action: 0,
  //     functionSelectors: toAdd.map((s) => s.signature),
  //   });
  console.log(proxyImplementationChange);

  console.time("upgrade PoolApeStaking");
  if (DRY_RUN) {
    const encodedData = provider.interface.encodeFunctionData(
      "updatePoolImpl",
      [proxyImplementationChange, ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(provider.address, encodedData);
  }
  console.timeEnd("upgrade PoolApeStaking");

  console.log("deploy p2p pair staking");
  const p2pPairStaking = await getP2PPairStaking(
    (
      await deployP2PPairStaking(verify)
    ).address
  );
  const p2pPairStakingProxy = await getInitializableAdminUpgradeabilityProxy(
    p2pPairStaking.address
  );
  await waitForTx(
    await p2pPairStakingProxy.changeAdmin(
      "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
      GLOBAL_OVERRIDES
    )
  );
  await waitForTx(
    await p2pPairStaking.transferOwnership(
      "0xca8678d2d273b1913148402aed2E99b085ea3F02",
      GLOBAL_OVERRIDES
    )
  );

  const nBAYC = await getNToken("0xdb5485C85Bd95f38f9def0cA85499eF67dC581c0");
  const nMAYC = await getNToken("0xFA51cdc70c512c13eF1e4A3dbf1e99082b242896");
  const nBAKC = await getNToken("0xC3d0922aF19D56DEbf426706D27bD5d7Ea48D23C");

  if (DRY_RUN) {
    const encodedData1 = await nBAYC.interface.encodeFunctionData(
      "setApprovalForAllTo",
      [await nBAYC.UNDERLYING_ASSET_ADDRESS(), p2pPairStaking.address]
    );
    await dryRunEncodedData(nBAYC.address, encodedData1);

    const encodedData2 = await nMAYC.interface.encodeFunctionData(
      "setApprovalForAllTo",
      [await nMAYC.UNDERLYING_ASSET_ADDRESS(), p2pPairStaking.address]
    );
    await dryRunEncodedData(nMAYC.address, encodedData2);

    const encodedData3 = await nBAKC.interface.encodeFunctionData(
      "setApprovalForAllTo",
      [await nBAKC.UNDERLYING_ASSET_ADDRESS(), p2pPairStaking.address]
    );
    await dryRunEncodedData(nBAKC.address, encodedData3);
  } else {
    await waitForTx(
      await nBAYC.setApprovalForAllTo(
        await nBAYC.UNDERLYING_ASSET_ADDRESS(),
        p2pPairStaking.address
      )
    );
    await waitForTx(
      await nMAYC.setApprovalForAllTo(
        await nMAYC.UNDERLYING_ASSET_ADDRESS(),
        p2pPairStaking.address
      )
    );
    await waitForTx(
      await nBAKC.setApprovalForAllTo(
        await nBAKC.UNDERLYING_ASSET_ADDRESS(),
        p2pPairStaking.address
      )
    );
  }

  console.timeEnd("release-v1.4.2");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseV142();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
