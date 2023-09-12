import {
  deployConduitController,
  deployPausableZoneController,
  deploySeaport,
  deploySeaportAdapter,
} from "../../../helpers/contracts-deployments";
import {
  getConduit,
  getFirstSigner,
  getPoolAddressesProvider,
  getProtocolDataProvider,
} from "../../../helpers/contracts-getters";
import {
  OPENSEA_SEAPORT_ID_V11,
  OPENSEA_SEAPORT_ID_V14,
  OPENSEA_SEAPORT_ID_V15,
  PARASPACE_SEAPORT_ID,
} from "../../../helpers/constants";
import {DRE, getParaSpaceConfig, waitForTx} from "../../../helpers/misc-utils";
import {
  createZone,
  insertContractAddressInDb,
  createConduit,
} from "../../../helpers/contracts-helpers";
import {eContractid} from "../../../helpers/types";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";

export const step_15 = async (verify = false) => {
  try {
    const deployer = await getFirstSigner();
    const deployerAddress = await deployer.getAddress();
    const paraSpaceConfig = getParaSpaceConfig();
    const addressesProvider = await getPoolAddressesProvider();
    const protocolDataProvider = await getProtocolDataProvider();
    const conduitController = await deployConduitController(verify);
    const pausableZoneController = await deployPausableZoneController(
      deployerAddress,
      verify
    );
    const conduitKey = `${deployerAddress}000000000000000000000000`;
    if (DRE.network.config.zksync) {
      GLOBAL_OVERRIDES.gasLimit = 35_000_000;
    }
    const conduit = await createConduit(
      conduitController,
      deployer,
      conduitKey,
      GLOBAL_OVERRIDES
    );
    const conduitInstance = await getConduit(conduit);
    await waitForTx(
      await conduitInstance.initialize(
        protocolDataProvider.address,
        GLOBAL_OVERRIDES
      )
    );
    const zone = await createZone(pausableZoneController, deployer);
    const seaport = await deploySeaport(conduitController.address, verify);
    const seaportAdapter = await deploySeaportAdapter(
      addressesProvider.address,
      verify
    );
    if (!DRE.network.config.zksync) {
      // TODO: fix updateChannel method for zksync
      await waitForTx(
        await conduitController.updateChannel(
          conduit,
          seaport.address,
          true,
          GLOBAL_OVERRIDES
        )
      );
    }
    if (DRE.network.config.zksync) {
      delete GLOBAL_OVERRIDES.gasLimit;
    }
    await waitForTx(
      await addressesProvider.setMarketplace(
        PARASPACE_SEAPORT_ID,
        seaport.address,
        seaportAdapter.address,
        conduitInstance.address,
        false,
        GLOBAL_OVERRIDES
      )
    );

    if (paraSpaceConfig.Marketplace.Seaport?.V11) {
      await waitForTx(
        await addressesProvider.setMarketplace(
          OPENSEA_SEAPORT_ID_V11,
          paraSpaceConfig.Marketplace.Seaport.V11,
          seaportAdapter.address,
          paraSpaceConfig.Marketplace.Seaport.V11,
          false,
          GLOBAL_OVERRIDES
        )
      );
    }

    if (paraSpaceConfig.Marketplace.Seaport?.V14) {
      await waitForTx(
        await addressesProvider.setMarketplace(
          OPENSEA_SEAPORT_ID_V14,
          paraSpaceConfig.Marketplace.Seaport.V14,
          seaportAdapter.address,
          paraSpaceConfig.Marketplace.Seaport.V14,
          false,
          GLOBAL_OVERRIDES
        )
      );
    }

    if (paraSpaceConfig.Marketplace.Seaport?.V15) {
      await waitForTx(
        await addressesProvider.setMarketplace(
          OPENSEA_SEAPORT_ID_V15,
          paraSpaceConfig.Marketplace.Seaport.V15,
          seaportAdapter.address,
          paraSpaceConfig.Marketplace.Seaport.V15,
          false,
          GLOBAL_OVERRIDES
        )
      );
    }

    await insertContractAddressInDb(eContractid.ConduitKey, conduitKey, false);
    await insertContractAddressInDb(eContractid.Conduit, conduit);
    await insertContractAddressInDb(eContractid.PausableZone, zone);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
