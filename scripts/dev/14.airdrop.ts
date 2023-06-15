import rawBRE from "hardhat";
import {tEthereumAddress} from "../../helpers/types";
import fs from "fs";
import dotenv from "dotenv";
import {getAirdropper} from "../../helpers/contracts-getters";
import {
  AIRDROP_CONFIG_FILE,
  AIRDROP_CONTRACT,
  GLOBAL_OVERRIDES,
} from "../../helpers/hardhat-constants";
import {DRE, waitForTx} from "../../helpers/misc-utils";
import {BigNumber} from "ethers";

dotenv.config();

type AirdropItemType = "ERC20" | "ETH" | "ERC721" | "ERC1155";

type AirdropItemERC20 = {
  token: tEthereumAddress;
  to: tEthereumAddress;
  amount: string;
};

type AirdropItemETH = {
  to: tEthereumAddress;
  amount: string;
};

type AirdropItemERC721 = {
  token: tEthereumAddress;
  to: tEthereumAddress;
  ids: string[];
};

type AirdropItemERC1155 = {
  token: tEthereumAddress;
  to: tEthereumAddress;
  ids: string[];
  amounts: string[];
  payload: string;
};

type AirdropConfig = {
  type: AirdropItemType;
  items:
    | AirdropItemERC20[]
    | AirdropItemETH[]
    | AirdropItemERC721[]
    | AirdropItemERC1155[];
};

const airdrop = async () => {
  console.time("airdrop");
  const airdropper = await getAirdropper(AIRDROP_CONTRACT);
  const airdropConfig: AirdropConfig = JSON.parse(
    fs.readFileSync(AIRDROP_CONFIG_FILE, "utf8")
  );
  console.log(
    (airdropConfig.items as AirdropItemETH[])
      .reduce((ite, cur) => {
        ite = ite.add(BigNumber.from(cur.amount));
        return ite;
      }, BigNumber.from("0"))
      .toString()
  );

  if (airdropConfig.type == "ERC721") {
    const items = airdropConfig.items as AirdropItemERC721[];
    const tokens = items.map((x) => x.token);
    const tos = items.map((x) => x.to);
    const ids = items.map((x) => x.ids);
    await waitForTx(
      await airdropper.airdropERC721(tokens, tos, ids, GLOBAL_OVERRIDES)
    );
  } else if (airdropConfig.type == "ERC20") {
    const items = airdropConfig.items as AirdropItemERC20[];
    const tokens = items.map((x) => x.token);
    const tos = items.map((x) => x.to);
    const amounts = items.map((x) => x.amount);
    await waitForTx(
      await airdropper.airdropERC20(tokens, tos, amounts, GLOBAL_OVERRIDES)
    );
  } else if (airdropConfig.type == "ETH") {
    const items = airdropConfig.items as AirdropItemETH[];
    const tos = items.map((x) => x.to);
    const amounts = items.map((x) => x.amount);
    console.log(tos, amounts);
    console.log(await DRE.ethers.provider.getBalance(airdropper.address));
    await waitForTx(
      await airdropper.airdropETH(tos, amounts, GLOBAL_OVERRIDES)
    );
    console.log(await DRE.ethers.provider.getBalance(airdropper.address));
  } else if (airdropConfig.type == "ERC1155") {
    const items = airdropConfig.items as AirdropItemERC1155[];
    const tokens = items.map((x) => x.token);
    const tos = items.map((x) => x.to);
    const ids = items.map((x) => x.ids);
    const amounts = items.map((x) => x.amounts);
    const payload = items.map((x) => x.payload);
    await waitForTx(
      await airdropper.airdropERC1155(
        tokens,
        tos,
        ids,
        amounts,
        payload,
        GLOBAL_OVERRIDES
      )
    );
  }

  console.timeEnd("airdrop");
};

async function main() {
  await rawBRE.run("set-DRE");
  await airdrop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
