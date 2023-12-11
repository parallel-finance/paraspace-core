import {
  deployP2PPairStaking,
  deployParaApeStaking,
  deployParaApeStakingImpl,
} from "../../../helpers/contracts-deployments";
import {
  getAllTokens,
  getFirstSigner,
  getInitializableAdminUpgradeabilityProxy,
  getNTokenBAKC,
  getNTokenBAYC,
  getNTokenMAYC,
  getParaApeStaking,
  getPoolProxy,
} from "../../../helpers/contracts-getters";
import {getParaSpaceConfig, waitForTx} from "../../../helpers/misc-utils";
import {
  ERC20TokenContractId,
  ERC721TokenContractId,
} from "../../../helpers/types";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";
import {InitializableAdminUpgradeabilityProxy} from "../../../types";

export const step_20 = async (verify = false) => {
  const paraSpaceConfig = getParaSpaceConfig();
  try {
    if (!paraSpaceConfig.ReservesConfig[ERC20TokenContractId.APE]) {
      return;
    }

    // deploy P2PPairStaking
    const p2pPairStaking = await deployP2PPairStaking(verify);
    const allTokens = await getAllTokens();
    const pool = await getPoolProxy();

    const bayc = allTokens[ERC721TokenContractId.BAYC];
    const mayc = allTokens[ERC721TokenContractId.MAYC];
    const bakc = allTokens[ERC721TokenContractId.BAKC];

    if (bayc) {
      const nBAYC = await getNTokenBAYC(
        (
          await pool.getReserveData(bayc.address)
        ).xTokenAddress
      );
      await waitForTx(
        await nBAYC.setApprovalForAllTo(
          bayc.address,
          p2pPairStaking.address,
          true
        )
      );
    }

    if (mayc) {
      const nMAYC = await getNTokenMAYC(
        (
          await pool.getReserveData(mayc.address)
        ).xTokenAddress
      );
      await waitForTx(
        await nMAYC.setApprovalForAllTo(
          mayc.address,
          p2pPairStaking.address,
          true
        )
      );
    }

    if (bakc) {
      const nBAKC = await getNTokenBAKC(
        (
          await pool.getReserveData(bakc.address)
        ).xTokenAddress
      );
      await waitForTx(
        await nBAKC.setApprovalForAllTo(
          bakc.address,
          p2pPairStaking.address,
          true
        )
      );
    }

    //deploy ParaApeStaking
    const paraApeStaking = await getParaApeStaking();
    //upgrade to non-fake implementation
    if (paraApeStaking) {
      const paraApeStakingImpl = await deployParaApeStakingImpl(verify);
      const paraApeStakingProxy =
        await getInitializableAdminUpgradeabilityProxy(paraApeStaking.address);

      const deployer = await getFirstSigner();
      const deployerAddress = await deployer.getAddress();
      const initData =
        paraApeStakingImpl.interface.encodeFunctionData("initialize");

      await waitForTx(
        await (paraApeStakingProxy as InitializableAdminUpgradeabilityProxy)[
          "initialize(address,address,bytes)"
        ](
          paraApeStakingImpl.address,
          deployerAddress,
          initData,
          GLOBAL_OVERRIDES
        )
      );
    } else {
      await deployParaApeStaking(false, verify);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
