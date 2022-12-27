import {
  deployLinearCurve,
  deployLSSVMPairEnumerableERC20,
  deployLSSVMPairEnumerableETH,
  deployLSSVMPairFactory,
  deployLSSVMPairMissingEnumerableERC20,
  deployLSSVMPairMissingEnumerableETH,
  deployLSSVMRouter,
  deploySudoAdapter,
} from "../../../helpers/contracts-deployments";
import {getPoolAddressesProvider} from "../../../helpers/contracts-getters";
import {SUDOSWAP_ID, ZERO_ADDRESS} from "../../../helpers/constants";
import {
  isLocalTestnet,
  isPublicTestnet,
  waitForTx,
} from "../../../helpers/misc-utils";
import {GLOBAL_OVERRIDES} from "../../../helpers/hardhat-constants";

export const step_20 = async (verify = false) => {
  try {
    if (!isLocalTestnet() && !isPublicTestnet()) {
      return;
    }

    const addressesProvider = await getPoolAddressesProvider();

    const enumerableETHTemplate = await deployLSSVMPairEnumerableETH(verify);
    const missingEnumerableETHTemplate =
      await deployLSSVMPairMissingEnumerableETH(verify);
    const enumerableERC20Template = await deployLSSVMPairEnumerableERC20(
      verify
    );
    const missingEnumerableERC20Template =
      await deployLSSVMPairMissingEnumerableERC20(verify);
    const pairFactory = await deployLSSVMPairFactory(
      enumerableETHTemplate.address,
      missingEnumerableETHTemplate.address,
      enumerableERC20Template.address,
      missingEnumerableERC20Template.address,
      ZERO_ADDRESS,
      "0",
      verify
    );
    const router = await deployLSSVMRouter(pairFactory.address, verify);
    const sudoAdapter = await deploySudoAdapter(
      addressesProvider.address,
      verify
    );

    const linearCurve = await deployLinearCurve(verify);
    await waitForTx(
      await pairFactory.setBondingCurveAllowed(linearCurve.address, true)
    );

    await waitForTx(
      await addressesProvider.setMarketplace(
        SUDOSWAP_ID,
        router.address,
        sudoAdapter.address,
        router.address,
        false,
        GLOBAL_OVERRIDES
      )
    );
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
