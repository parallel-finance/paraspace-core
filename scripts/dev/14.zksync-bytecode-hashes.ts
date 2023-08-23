import rawBRE from "hardhat";
import {getZkSyncBytecodeHashes} from "../../helpers/contracts-helpers";

const zksyncBytecodeHashes = async () => {
  console.time("zksync-bytecode-hashes");
  console.log(getZkSyncBytecodeHashes());
  console.timeEnd("zksync-bytecode-hashes");
};

async function main() {
  await rawBRE.run("set-DRE");
  await zksyncBytecodeHashes();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
