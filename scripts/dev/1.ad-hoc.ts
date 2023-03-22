import {BigNumber} from "ethers";
import rawBRE from "hardhat";

const adHoc = async () => {
  console.time("ad-hoc");
  console.log(
    BigNumber.from(
      "115792089237316195423570979396521620502602778763490806408930788529132164612095"
    ).
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
