import rawBRE from "hardhat";
import {ethers, Wallet} from "ethers";
import {
  DEPLOYER_PRIVATE_KEY,
  GLOBAL_OVERRIDES,
  MAINNET_CHAINID,
} from "../../helpers/hardhat-constants";
import {
  getAutoCompoundApe,
  getNTokenMAYC,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {FlashbotsBundleProvider} from "@flashbots/ethers-provider-bundle";
import {DRE, sleep} from "../../helpers/misc-utils";

const FLASHBOTS_ENDPOINT = "https://relay.flashbots.net";
const CHAIN_ID = MAINNET_CHAINID;

const rescueFunds = async () => {
  console.time("rescue-funds");
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
  // await waitForTx(await cAPE.approve(pool.address, MAX_UINT_AMOUNT));

  const funding_tx = (args) => ({
    chainId: CHAIN_ID,
    data: "0x",
    value: 0,
    gasLimit: 21000,
    ...args,
    ...GLOBAL_OVERRIDES,
  });

  // Cut down on some boilerplate
  const other_tx = (args) => ({
    chainId: CHAIN_ID,
    value: 0,
    gasLimit: 400000,
    ...args,
    ...GLOBAL_OVERRIDES,
  });
  const encodedData1 = pool.interface.encodeFunctionData("repay", [
    cAPE.address,
    "2050000000000000000000",
    compromisedWallet.address,
  ]);
  const encodedData2 = nMAYC.interface.encodeFunctionData("transferFrom", [
    compromisedWallet.address,
    "0x606A44a62354C830FEbCB5f9C44DA2ACB8200e2b",
    "1460",
  ]);
  const bundle = [
    // send the compromised wallet some eth
    {
      transaction: funding_tx({
        to: compromisedWallet.address,
        value: "45000000000000000",
      }),
      signer: fundingWallet,
    },

    // Repay debt
    {
      transaction: other_tx({
        data: encodedData1, // transfer data
        to: pool.address, // nft contract address
      }),
      signer: fundingWallet,
    },

    // Transfer NFT
    {
      transaction: other_tx({
        data: encodedData2, // transfer data
        to: nMAYC.address, // nft contract address
      }),
      signer: compromisedWallet,
    },
  ];

  let flashbotsProvider;
  try {
    flashbotsProvider = await FlashbotsBundleProvider.create(
      DRE.ethers.provider,
      Wallet.createRandom(),
      FLASHBOTS_ENDPOINT
    );
  } catch (err) {
    console.error(err);
  }

  while (true) {
    const blockNumber = await DRE.ethers.provider.getBlockNumber();
    try {
      const nextBlock = blockNumber + 1;
      console.log(`Preparing bundle for block: ${nextBlock}`);

      const signedBundle = await flashbotsProvider.signBundle(bundle);
      const txBundle = await flashbotsProvider.sendRawBundle(
        signedBundle,
        nextBlock
      );

      if ("error" in txBundle) {
        console.log("bundle error:");
        console.warn(txBundle.error.message);
        return;
      }

      console.log("Submitting bundle");
      const response = await txBundle.simulate();
      if ("error" in response) {
        console.log("Simulate error");
        console.error(response.error);
        process.exit(1);
      }

      console.log("response:", response);
    } catch (err) {
      console.log("Request error");
      console.error(err);
      process.exit(1);
    }

    await sleep(3000);
  }

  console.timeEnd("rescue-funds");
};

async function main() {
  await rawBRE.run("set-DRE");
  await rescueFunds();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
