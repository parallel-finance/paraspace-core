import {ethers} from "ethers";
import rawBRE from "hardhat";
import {
  getAutoCompoundApe,
  getNTokenMAYC,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {
  DEPLOYER_PRIVATE_KEY,
  GLOBAL_OVERRIDES,
} from "../../helpers/hardhat-constants";
import {DRE, waitForTx} from "../../helpers/misc-utils";
import {FORK_CHAINID} from "../../helpers/hardhat-constants";
const adHoc = async () => {
  console.time("ad-hoc");
  const compromisedWallet = new ethers.Wallet(
    process.env.CANDICE_PRIV || "",
    DRE.ethers.provider
  );
  const fundingWallet = new ethers.Wallet(
    DEPLOYER_PRIVATE_KEY,
    DRE.ethers.provider
  );
  const pool = await getPoolProxy();
  const nMAYC = await getNTokenMAYC(
    "0xFA51cdc70c512c13eF1e4A3dbf1e99082b242896"
  );
  const cAPE = await getAutoCompoundApe();
  console.log(await nMAYC.ownerOf("1460"));

  // console.log(1);
  // await waitForTx(
  //   await fundingWallet.sendTransaction({
  //     to: compromisedWallet.address,
  //     value: "20000000000000000",
  //   })
  // );

  // console.log(2);
  // await waitForTx(
  //   await pool
  //     .connect(fundingWallet)
  //     .repay(cAPE.address, "2050000000000000000000", compromisedWallet.address)
  // );

  // console.log(3);
  // console.log(await nMAYC.ownerOf("1460"));
  // await waitForTx(
  //   await nMAYC
  //     .connect(compromisedWallet)
  //     .transferFrom(
  //       compromisedWallet.address,
  //       "0x606A44a62354C830FEbCB5f9C44DA2ACB8200e2b",
  //       "1460",
  //       GLOBAL_OVERRIDES
  //     )
  // );
  // console.log(await nMAYC.ownerOf("1460"));

  // // await waitForTx(await cAPE.approve(pool.address, MAX_UINT_AMOUNT));
  // const funding_tx = (args) => ({
  //   chainId: FORK_CHAINID,
  //   data: "0x",
  //   value: 0,
  //   gasLimit: 21000,
  //   ...args,
  //   ...GLOBAL_OVERRIDES,
  // });
  //
  // // Cut down on some boilerplate
  // const other_tx = (args) => ({
  //   ...args,
  //   ...GLOBAL_OVERRIDES,
  // });
  // const encodedData1 = pool.interface.encodeFunctionData("repay", [
  //   cAPE.address,
  //   "2050000000000000000000",
  //   compromisedWallet.address,
  // ]);
  // const encodedData2 = nMAYC.interface.encodeFunctionData("transferFrom", [
  //   compromisedWallet.address,
  //   "0x606A44a62354C830FEbCB5f9C44DA2ACB8200e2b",
  //   "1460",
  // ]);
  // const bundle = [
  //   // send the compromised wallet some eth
  //   {
  //     transaction: funding_tx({
  //       to: compromisedWallet.address,
  //       value: 8000000000000000,
  //     }),
  //     signer: fundingWallet,
  //   },
  //
  //   // Repay debt
  //   {
  //     transaction: other_tx({
  //       data: encodedData1, // transfer data
  //       to: pool.address, // nft contract address
  //     }),
  //     signer: fundingWallet,
  //   },
  //
  //   // Transfer NFT
  //   {
  //     transaction: other_tx({
  //       data: encodedData2, // transfer data
  //       to: nMAYC.address, // nft contract address
  //     }),
  //     signer: compromisedWallet,
  //   },
  // ];
  //
  // for (const tx of bundle) {
  //   // console.log(tx.transaction);
  //   console.log(await tx.signer.estimateGas(tx.transaction));
  //   console.log(await tx.signer.sendTransaction(tx.transaction));
  //   // // const signedTx = await tx.signer.signTransaction(tx.transaction);
  //   // console.log(await DRE.ethers.provider.estimateGas(tx.transaction));
  // }
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
