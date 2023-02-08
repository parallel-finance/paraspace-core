import rawBRE from "hardhat";
import {getFunctionSignatures} from "../../helpers/contracts-helpers";
import {PoolApeStaking__factory} from "../../types";

const adHoc = async () => {
  console.time("ad-hoc");
  const newSelectors = getFunctionSignatures(PoolApeStaking__factory.abi);
  console.log(newSelectors);
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
