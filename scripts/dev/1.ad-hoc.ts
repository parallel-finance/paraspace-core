import rawBRE from "hardhat";
import {getParaSpaceOracle} from "../../helpers/contracts-getters";

const adHoc = async () => {
  console.time("ad-hoc");
  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  const paraspaceOracle = await getParaSpaceOracle();
  console.log(
    await paraspaceOracle.getAssetPrice(
      "0xDa8b420EDa077bF188a1d133Eb8F162265F4abEc"
    )
  );
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
