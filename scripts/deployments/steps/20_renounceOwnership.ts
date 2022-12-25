import {
  getACLManager,
  getAutoCompoundApe,
  getConduit,
  getConduitController,
  getFirstSigner,
  getInitializableAdminUpgradeabilityProxy,
  getNFTFloorOracle,
  getPausableZoneController,
  getPoolAddressesProvider,
  getPoolAddressesProviderRegistry,
  getReservesSetupHelper,
  getWETHGatewayProxy,
  getWPunkGatewayProxy,
} from "../../../helpers/contracts-getters";
import {getParaSpaceAdmins} from "../../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {getParaSpaceConfig, waitForTx} from "../../../helpers/misc-utils";
import {
  ERC20TokenContractId,
  ERC721TokenContractId,
} from "../../../helpers/types";

export const step_20 = async (
  // eslint-disable-next-line
  verify = false,
  admins?: {
    paraSpaceAdminAddress: string;
    gatewayAdminAddress: string;
    riskAdminAddress: string;
  }
) => {
  const {paraSpaceAdminAddress, gatewayAdminAddress, riskAdminAddress} =
    admins || (await getParaSpaceAdmins());
  const paraSpaceConfig = getParaSpaceConfig();
  const deployer = await getFirstSigner();
  const deployerAddress = await deployer.getAddress();

  try {
    const addressesProviderRegistry = await getPoolAddressesProviderRegistry();
    const addressesProvider = await getPoolAddressesProvider();
    const reservesSetupHelper = await getReservesSetupHelper();
    const conduitController = await getConduitController();
    const conduit = await getConduit();
    const zoneController = await getPausableZoneController();
    const aclManager = await getACLManager();
    const nftFloorOracle = await getNFTFloorOracle();

    console.log("new paraSpaceAdmin: ", paraSpaceAdminAddress);
    console.log("new gatewayAdmin: ", gatewayAdminAddress);
    console.log("new riskAdmin: ", riskAdminAddress);
    if (deployerAddress === paraSpaceAdminAddress) {
      return;
    }

    await waitForTx(
      await addressesProviderRegistry.transferOwnership(
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );
    await waitForTx(
      await addressesProvider.setACLAdmin(
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );
    await waitForTx(
      await addressesProvider.transferOwnership(
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );

    await waitForTx(
      await aclManager.addPoolAdmin(paraSpaceAdminAddress, GLOBAL_OVERRIDES)
    );
    await waitForTx(
      await aclManager.removePoolAdmin(deployerAddress, GLOBAL_OVERRIDES)
    );

    if (!(await aclManager.isAssetListingAdmin(paraSpaceAdminAddress))) {
      await waitForTx(
        await aclManager.addAssetListingAdmin(
          paraSpaceAdminAddress,
          GLOBAL_OVERRIDES
        )
      );
    }
    if (await aclManager.isAssetListingAdmin(deployerAddress)) {
      await waitForTx(
        await aclManager.removeAssetListingAdmin(
          deployerAddress,
          GLOBAL_OVERRIDES
        )
      );
    }

    if (!(await aclManager.isRiskAdmin(riskAdminAddress))) {
      await waitForTx(
        await aclManager.addRiskAdmin(riskAdminAddress, GLOBAL_OVERRIDES)
      );
    }
    if (await aclManager.isRiskAdmin(deployerAddress)) {
      await waitForTx(
        await aclManager.removeRiskAdmin(deployerAddress, GLOBAL_OVERRIDES)
      );
    }

    await waitForTx(
      await aclManager.grantRole(
        await aclManager.DEFAULT_ADMIN_ROLE(),
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );
    await waitForTx(
      await aclManager.revokeRole(
        await aclManager.DEFAULT_ADMIN_ROLE(),
        deployerAddress,
        GLOBAL_OVERRIDES
      )
    );

    await waitForTx(
      await reservesSetupHelper.transferOwnership(
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );

    await waitForTx(
      await conduitController.transferOwnership(
        conduit.address,
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );
    await waitForTx(
      await zoneController.transferOwnership(
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );

    if (paraSpaceConfig.ReservesConfig[ERC20TokenContractId.WETH]) {
      const wethGatewayProxy = await getWETHGatewayProxy();
      await waitForTx(
        await wethGatewayProxy.transferOwnership(
          gatewayAdminAddress,
          GLOBAL_OVERRIDES
        )
      );
    }
    if (paraSpaceConfig.ReservesConfig[ERC721TokenContractId.WPUNKS]) {
      const punkGatewayProxy = await getWPunkGatewayProxy();
      await waitForTx(
        await punkGatewayProxy.transferOwnership(
          gatewayAdminAddress,
          GLOBAL_OVERRIDES
        )
      );
    }

    const cApe = await getAutoCompoundApe();
    const cApeProxy = await getInitializableAdminUpgradeabilityProxy(
      cApe.address
    );
    await waitForTx(
      await cApeProxy.changeAdmin(paraSpaceAdminAddress, GLOBAL_OVERRIDES)
    );
    await waitForTx(
      await cApe.transferOwnership(gatewayAdminAddress, GLOBAL_OVERRIDES)
    );

    await waitForTx(
      await nftFloorOracle.grantRole(
        await nftFloorOracle.UPDATER_ROLE(),
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );
    await waitForTx(
      await nftFloorOracle.revokeRole(
        await nftFloorOracle.UPDATER_ROLE(),
        deployerAddress,
        GLOBAL_OVERRIDES
      )
    );
    await waitForTx(
      await nftFloorOracle.grantRole(
        await nftFloorOracle.DEFAULT_ADMIN_ROLE(),
        paraSpaceAdminAddress,
        GLOBAL_OVERRIDES
      )
    );
    await waitForTx(
      await nftFloorOracle.revokeRole(
        await nftFloorOracle.DEFAULT_ADMIN_ROLE(),
        deployerAddress,
        GLOBAL_OVERRIDES
      )
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
