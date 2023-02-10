import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployP2PPairStaking} from "../../helpers/contracts-deployments";
import {
  getInitializableAdminUpgradeabilityProxy,
  getNTokenBAKC,
  getNTokenBAYC,
  getNTokenMAYC,
  getP2PPairStaking,
  getParaSpaceOracle,
  getProtocolDataProvider,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getParaSpaceAdmins,
} from "../../helpers/contracts-helpers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../helpers/init-helpers";
import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {tEthereumAddress} from "../../helpers/types";

const releaseP2PWstETH = async (verify = false) => {
  console.time("release-p2p-wstETH");
  console.log("deploy p2p pair staking");
  const paraSpaceOracle = await getParaSpaceOracle();
  const paraSpaceConfig = await getParaSpaceConfig();
  const protocolDataProvider = await getProtocolDataProvider();
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
  const nBAYC = await getNTokenBAYC(
    "0xdb5485C85Bd95f38f9def0cA85499eF67dC581c0"
  );
  const nMAYC = await getNTokenMAYC(
    "0xFA51cdc70c512c13eF1e4A3dbf1e99082b242896"
  );
  const nBAKC = await getNTokenBAKC(
    "0xC3d0922aF19D56DEbf426706D27bD5d7Ea48D23C"
  );

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

  console.log("register wstETH aggregator");
  const projects = [
    {
      symbol: "wstETH",
      address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      aggregator: "0x1d05d899c3AC6CfA35D50c063325ccA39727c7c8",
    },
  ];
  const assets = [...projects];
  if (DRY_RUN) {
    const encodedData = paraSpaceOracle.interface.encodeFunctionData(
      "setAssetSources",
      [assets.map((x) => x.address), assets.map((x) => x.aggregator)]
    );
    await dryRunEncodedData(paraSpaceOracle.address, encodedData);
  } else {
    await waitForTx(
      await paraSpaceOracle.setAssetSources(
        assets.map((x) => x.address),
        assets.map((x) => x.aggregator),
        GLOBAL_OVERRIDES
      )
    );
  }

  console.log("init reserves");
  const reservesParams = paraSpaceConfig.ReservesConfig;
  const allTokenAddresses = assets.reduce(
    (accum: {[name: string]: tEthereumAddress}, {symbol, address}) => ({
      ...accum,
      [symbol]: address,
    }),
    {}
  );
  const {PTokenNamePrefix, VariableDebtTokenNamePrefix, SymbolPrefix} =
    paraSpaceConfig;
  const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
  const treasuryAddress = paraSpaceConfig.Treasury;

  await initReservesByHelper(
    reservesParams,
    allTokenAddresses,
    PTokenNamePrefix,
    VariableDebtTokenNamePrefix,
    SymbolPrefix,
    paraSpaceAdminAddress,
    treasuryAddress,
    ZERO_ADDRESS,
    verify,
    "0x46d24Ac3f5c7eeFF3f79D107BB727Bfa8e70B770",
    undefined,
    "0x986a94186c0F16Ce8D7e14456A3833C6Eb6Df4bE",
    "0x457A5eC6F2F3A98FD470a65Ad3Dcb593ff842c6d"
  );

  console.log("configuring reserves");
  await configureReservesByHelper(
    reservesParams,
    allTokenAddresses,
    protocolDataProvider,
    paraSpaceAdminAddress
  );

  console.timeEnd("release-p2p-wstETH");
};

async function main() {
  await rawBRE.run("set-DRE");
  await releaseP2PWstETH();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
