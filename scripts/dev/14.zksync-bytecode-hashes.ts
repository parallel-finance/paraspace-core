import rawBRE from "hardhat";
import walkdir from "walkdir";
import fs from "fs";
import {utils} from "zksync-web3";
import {hexlify} from "ethers/lib/utils";

const zksyncBytecodeHashes = async () => {
  console.time("zksync-bytecode-hashes");
  walkdir.sync("./artifacts-zk", (path, stat) => {
    if (
      stat.isDirectory() ||
      !path.endsWith(".json") ||
      path.endsWith("dbg.json")
    ) {
      return;
    }
    try {
      const content = JSON.parse(fs.readFileSync(path, "utf8"));
      console.log(
        content.contractName,
        hexlify(utils.hashBytecode(content.bytecode))
      );
    } catch (e) {
      //
    }
  });
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
