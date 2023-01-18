import rawBRE from "hardhat";
import {getNToken} from "../../helpers/contracts-getters";
import {waitForTx} from "../../helpers/misc-utils";

const adHoc = async () => {
  console.time("ad-hoc");
  const ntokens = [
    "0x3D248B3148f8Ed1FE0844f17C9e8a96c084Cc080",
    "0xc9D3Af281C52ba1e1c075e42bDb8A11f2FbB6C64",
    "0xe74B80b7fD90708775ecB0544b869d96cb3FC741",
  ];

  for (const ntoken of ntokens) {
    const nToken = await getNToken(ntoken);
    await waitForTx(
      await nToken.setApprovalForAllTo(
        await nToken.UNDERLYING_ASSET_ADDRESS(),
        "0x98f6D736BB9BA3fF5Fe6f6A3E57365Fd579D820a"
      )
    );
  }
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
