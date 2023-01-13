import rawBRE from "hardhat";
import {input} from "../../helpers/wallet-helpers";
import {ethers} from "ethers";
import fs from "fs";
import {KEYSTORE_PATH} from "../../helpers/hardhat-constants";

const wallet = async () => {
  console.time("wallet");
  const wallet = await ethers.Wallet.fromMnemonic(input("secret: "));
  const keystore = await wallet.encrypt(input("password: "));

  if (!fs.existsSync(KEYSTORE_PATH)) {
    fs.mkdirSync(KEYSTORE_PATH);
  }

  const fileName = JSON.parse(keystore).id;
  const filePath = `${KEYSTORE_PATH}/${fileName}`;
  fs.writeFileSync(filePath, keystore);
  console.log(`wallet generated at: ${filePath}`);
  console.timeEnd("wallet");
};

async function main() {
  await rawBRE.run("set-DRE");
  await wallet();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
