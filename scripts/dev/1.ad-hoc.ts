import rawBRE from "hardhat";
import {DRE} from "../../helpers/misc-utils";

const adHoc = async () => {
  await DRE.run("set-DRE");
  console.time("ad-hoc");
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
