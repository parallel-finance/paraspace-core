import rawBRE from "hardhat";
import {
  deployP2PPairStaking,
  deployParaSpaceAidrop,
} from "../../helpers/contracts-deployments";
import {
  getInitializableAdminUpgradeabilityProxy,
  getNToken,
  getP2PPairStaking,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";

const releaseV142 = async (verify = false) => {
  console.time("release-v1.4.2");
  console.log("deploy airdrop");
  const airDrop = await deployParaSpaceAidrop(
    "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
    "2675468152",
    verify
  );
  await waitForTx(
    await airDrop.transferOwnership(
      "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714"
    )
  );

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
