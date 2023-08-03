import rawBRE, {ethers} from "hardhat";

import {
  Client,
  Presets,
  UserOperationBuilder,
  BundlerJsonRpcProvider,
} from "userop";
// import {testEnvFixture} from "./helpers/setup-env";
// import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {
  deployAccount,
  deployAccountProxy,
  deployERC6551Registry,
  deployParaAccount,
} from "../../helpers/contracts-deployments";
import {getFirstSigner} from "../../helpers/contracts-getters";
import {
  AccountFactory__factory,
  Account,
  Account__factory,
  IEntryPoint__factory,
} from "../../types";
import {JsonRpcProvider} from "@ethersproject/providers";
import {DRE} from "../../helpers/misc-utils";
// import { getDefaultProvider } from "ethers";

const config = {
  rpcUrl:
    "https://api.stackup.sh/v1/node/87077e87e810f15a801f79b47340895c83fb21ab4080a71c97728e53316af4de",
};

const adHoc = async () => {
  console.time("ad-hoc");
  await rawBRE.run("set-DRE");

  const user1 = await getFirstSigner();

  const verify = false;

  const client = await Client.init(config.rpcUrl);
  client.waitTimeoutMs = 60000;

  // The interval at which it will poll the node to look up UserOperationEvent.
  client.waitIntervalMs = 2000;

  const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  // const accountImpl = await deployAccount(entryPoint, verify);

  // const accountProxy = await deployAccountProxy(accountImpl.address, verify);

  // const registry = await deployERC6551Registry(verify);

  // const paraAccount = await deployParaAccount(registry.address, verify);

  // await paraAccount.createAccount(await user1.getAddress(), accountProxy.address);

  // const tokenId = 1;

  // const senderAddress = await paraAccount.getAccount(tokenId, accountProxy.address);

  const senderAddress = "0x73a3718e453435B667198f6efeB05f8441dAe966";

  console.log("deployed new account", senderAddress);

  const builder = new UserOperationBuilder().useDefaults({
    sender: senderAddress,
  });

  const account = Account__factory.connect(senderAddress, user1);

  await builder.setCallData(
    account.interface.encodeFunctionData("executeCall", [
      "0x53b7129fBBA780751060e26bc3934E86cA9D83c4",
      "0",
      [],
    ])
  );

  builder.useMiddleware(Presets.Middleware.EOASignature(user1));
  const provider = new BundlerJsonRpcProvider(config.rpcUrl);

  // console.log("entry point", client.entryPoint.address)

  // builder.useMiddleware(Presets.Middleware.estimateUserOperationGas(provider));
  // builder.useMiddleware(Presets.Middleware.getGasPrice(provider));

  // // const resolveAccount = async (ctx) =>  {
  // //     ctx.op.nonce = await client.entryPoint.getNonce(ctx.op.sender, 0);
  // //     ctx.op.initCode = "0x";
  // // };

  // // builder.useMiddleware(resolveAccount)

  builder.setMaxFeePerGas(2004808248);
  builder.setPreVerificationGas(59001);
  builder.setMaxPriorityFeePerGas(2004808248);
  builder.setVerificationGasLimit(148941);

  console.log("sending user op");

  const result = await client.sendUserOperation(builder, {
    onBuild: (op) => console.log("Signed UserOperation:", op),
  });

  // // const res = await client.sendUserOperation(

  // // simpleAccount.execute(pool.address, "1", "0x"),
  // // { onBuild: (op) => console.log("Signed UserOperation:", op) }
  // // );
  // // console.log(`UserOpHash: ${res.userOpHash}`);

  console.log("Waiting for transaction...");
  const ev = await result.wait();
  console.log(`Transaction hash: ${ev?.transactionHash ?? null}`);
  console.timeEnd("ad-hoc");
};

async function main() {
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
