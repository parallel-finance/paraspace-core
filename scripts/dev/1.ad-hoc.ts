import {utils} from "ethers";
import rawBRE from "hardhat";
import {getFirstSigner} from "../../helpers/contracts-getters";

const adHoc = async () => {
  console.time("ad-hoc");
  const signer = await getFirstSigner();
  await signer.sendTransaction({
    to: "0xe965198731CDdB2f06e91DD0CDff74b71e4b3714",
    value: utils.parseEther("10").toString(),
  });
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
