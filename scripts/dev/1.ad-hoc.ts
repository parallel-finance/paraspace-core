import rawBRE from "hardhat";
import {deployParaSpaceAidrop} from "../../helpers/contracts-deployments";

const adHoc = async () => {
  console.time("ad-hoc");
  await deployParaSpaceAidrop(
    "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
    "1991698504"
  );
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
