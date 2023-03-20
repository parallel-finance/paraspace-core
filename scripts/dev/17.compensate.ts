import {MetaTransaction} from "ethers-multisend";
import {parseEther} from "ethers/lib/utils";
import rawBRE from "hardhat";
import {getAutoCompoundApe} from "../../helpers/contracts-getters";
import {proposeMultiSafeTransactions} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";

const compensate = async () => {
  console.time("compensate");

  const cape = await getAutoCompoundApe();

  if (DRY_RUN) {
    const transactions: MetaTransaction[] = [];

    console.log("unpause cAPE");
    const encodedData2 = cape.interface.encodeFunctionData("unpause");
    transactions.push({
      to: cape.address,
      value: "0",
      data: encodedData2,
    });

    console.log("deposit APE as cAPE");
    const encodedData3 = cape.interface.encodeFunctionData("deposit", [
      "0xf090eb4c2b63e7b26e8bb09e6fc0cc3a7586263b",
      parseEther("48").add(1),
    ]);
    transactions.push({
      to: cape.address,
      value: "0",
      data: encodedData3,
    });
    const encodedData4 = cape.interface.encodeFunctionData("deposit", [
      "0xe03a95f82a20914f778afe3a64013265f8bce95c",
      parseEther("173").add(1),
    ]);
    transactions.push({
      to: cape.address,
      value: "0",
      data: encodedData4,
    });

    console.log("pause cAPE");
    const encodedData5 = cape.interface.encodeFunctionData("pause");
    transactions.push({
      to: cape.address,
      value: "0",
      data: encodedData5,
    });

    await proposeMultiSafeTransactions(transactions);
  }

  console.timeEnd("compensate");
};

async function main() {
  await rawBRE.run("set-DRE");
  await compensate();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
