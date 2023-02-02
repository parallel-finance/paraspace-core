import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  deployUiPoolDataProvider,
  getPoolSignatures,
} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getPoolAddressesProvider,
} from "../../helpers/contracts-getters";
import {withSaveAndVerify} from "../../helpers/contracts-helpers";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {eContractid} from "../../helpers/types";
import {ParaProxyInterfaces, ParaProxyInterfaces__factory} from "../../types";

const adHoc = async () => {
  console.time("ad-hoc");
  const addressesProvider = await getPoolAddressesProvider();

  const {poolParaProxyInterfacesSelectors} = getPoolSignatures();

  const poolParaProxyInterfaces = (await withSaveAndVerify(
    new ParaProxyInterfaces__factory(await getFirstSigner()),
    eContractid.ParaProxyInterfacesImpl,
    [],
    false,
    false,
    undefined,
    poolParaProxyInterfacesSelectors
  )) as ParaProxyInterfaces;

  await waitForTx(
    await addressesProvider.updatePoolImpl(
      [
        {
          implAddress: poolParaProxyInterfaces.address,
          action: 0,
          functionSelectors: poolParaProxyInterfacesSelectors.map(
            (s) => s.signature
          ),
        },
      ],
      ZERO_ADDRESS,
      "0x",
      GLOBAL_OVERRIDES
    )
  );

  await deployUiPoolDataProvider(
    "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    false
  );

  // await deployMintableERC721(["PPG", "PPG", ""], false);
  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
