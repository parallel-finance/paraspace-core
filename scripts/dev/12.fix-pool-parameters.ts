import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {deployPoolLogic} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getPoolAddressesProvider,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {
  dryRunEncodedData,
  getFunctionSignatures,
  withSaveAndVerify,
} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {eContractid} from "../../helpers/types";
import {IParaProxy, PoolParameters__factory} from "../../types";

const fixPoolParameters = async (verify = false) => {
  console.time("fix-pool-parameters");
  const pool = await getPoolProxy();
  const provider = await getPoolAddressesProvider();

  const poolLogic = await deployPoolLogic(verify);

  const parametersLibraries = {
    ["contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic"]:
      poolLogic.address,
  };

  const newParametersSelectors = getFunctionSignatures(
    PoolParameters__factory.abi
  );

  const poolParameters = await withSaveAndVerify(
    new PoolParameters__factory(parametersLibraries, await getFirstSigner()),
    eContractid.PoolParametersImpl,
    [provider.address],
    verify,
    false,
    parametersLibraries,
    newParametersSelectors
  );

  const oldParametersSelectors = await pool.facetFunctionSelectors(
    "0x6B0424Cf33B25BbEa92A5E9834d9942E68B69Eba"
  );
  const parametersToAdd = newParametersSelectors.filter(
    (s) => !oldParametersSelectors.includes(s.signature)
  );
  const parametersToReplace = newParametersSelectors.filter((s) =>
    oldParametersSelectors.includes(s.signature)
  );
  const parametersToRemove = oldParametersSelectors.filter(
    (s) => !newParametersSelectors.map((x) => x.signature).includes(s)
  );
  const parametersImplChange: IParaProxy.ProxyImplementationStruct[] = [];
  if (parametersToRemove.length)
    parametersImplChange.push({
      implAddress: ZERO_ADDRESS,
      action: 2,
      functionSelectors: parametersToRemove,
    });
  if (parametersToReplace.length)
    parametersImplChange.push({
      implAddress: poolParameters.address,
      action: 1,
      functionSelectors: parametersToReplace.map((s) => s.signature),
    });
  if (parametersToAdd.length)
    parametersImplChange.push({
      implAddress: poolParameters.address,
      action: 0,
      functionSelectors: parametersToAdd.map((s) => s.signature),
    });
  console.log(parametersImplChange);

  console.time("upgrade PoolParameters");
  if (DRY_RUN) {
    const encodedData = provider.interface.encodeFunctionData(
      "updatePoolImpl",
      [parametersImplChange, ZERO_ADDRESS, "0x"]
    );
    await dryRunEncodedData(provider.address, encodedData);
  }
  console.timeEnd("upgrade PoolParameters");

  console.timeEnd("fix-pool-parameters");
};

async function main() {
  await rawBRE.run("set-DRE");
  await fixPoolParameters();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
