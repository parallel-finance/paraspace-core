import rawBRE from "hardhat";
import {DRE} from "../../helpers/misc-utils";

const verifyV13 = async () => {
  await DRE.run("set-DRE");
  console.time("verify-v1.3");
  console.timeEnd("verify-v1.3");
};

async function main() {
  await rawBRE.run("set-DRE");
  await verifyV13();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
