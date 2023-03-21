import rawBRE from "hardhat";
import {deployUiPoolDataProvider} from "../../helpers/contracts-deployments";

const adHoc = async () => {
  console.time("ad-hoc");
  await deployUiPoolDataProvider(
    "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
    "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e"
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
