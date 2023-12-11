import {Presets, UserOperationBuilder} from "userop";
import {testEnvFixture} from "./helpers/setup-env";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {
  deployAccount,
  deployAccountFactory,
} from "../helpers/contracts-deployments";
import {
  getAccount,
  getAccountRegistry,
  getChainId,
} from "../helpers/contracts-getters";
import {expect} from "chai";
import {calcOpHash, waitForTx} from "../helpers/misc-utils";
import {AccountProxy__factory} from "../types";

const fixture = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {
    users: [, entryPoint],
  } = testEnv;
  const accountFactory = await deployAccountFactory(entryPoint.address);
  const accountRegistry = await getAccountRegistry();

  return {...testEnv, accountFactory, accountRegistry};
};

describe("Account Abstraction", () => {
  it("AA execute call from owner should succeed", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    await expect(
      await account.connect(user1.signer).execute(pool.address, "0", [])
    );
  });

  it("AA execute call from entry point should succeed", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, entryPoint],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    await expect(
      await account.connect(entryPoint.signer).execute(pool.address, "0", [])
    );
  });

  it("AA execute call from non owner nor entry point should revert", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, , user2],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    await expect(account.connect(user2.signer).execute(pool.address, "0", []))
      .to.be.reverted;
  });

  it("AA execute batch from owner should succeed", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    await expect(
      await account
        .connect(user1.signer)
        .executeBatch([pool.address], ["0"], [[]])
    );
  });

  it("AA execute batch from entry point should succeed", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, entryPoint],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    await expect(
      await account
        .connect(entryPoint.signer)
        .executeBatch([pool.address], ["0"], [[]])
    );
  });

  it("AA execute batch from non owner nor entry point should revert", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, , user2],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    await expect(
      account.connect(user2.signer).executeBatch([pool.address], ["0"], [[]])
    ).to.be.reverted;
  });

  it("AA validateUserOp called from non entry point should revert", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, entryPoint, user2],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    const builder = new UserOperationBuilder().useDefaults({
      sender: account.address,
    });

    await builder.setCallData(
      account.interface.encodeFunctionData("execute", [pool.address, 0, []])
    );

    builder.useMiddleware(Presets.Middleware.EOASignature(user1.signer));
    const userOp = await builder.buildOp(
      entryPoint.address,
      await getChainId()
    );
    const userOpHash = calcOpHash(
      userOp,
      entryPoint.address,
      await getChainId()
    );

    await expect(
      account.connect(user2.signer).validateUserOp(userOp, userOpHash, 0)
    ).to.be.reverted;
  });

  it("AA validateUserOp called from entry point with correct signature should succeed", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, entryPoint],
      pool,
      accountFactory,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = await getAccount(
      await accountFactory.getAddress(user1.address, "1")
    );

    const builder = new UserOperationBuilder().useDefaults({
      sender: account.address,
    });

    await builder.setCallData(
      account.interface.encodeFunctionData("execute", [pool.address, 0, []])
    );

    builder.useMiddleware(Presets.Middleware.EOASignature(user1.signer));
    const userOp = await builder.buildOp(
      entryPoint.address,
      await getChainId()
    );
    const userOpHash = calcOpHash(
      userOp,
      entryPoint.address,
      await getChainId()
    );

    await expect(
      await account
        .connect(entryPoint.signer)
        .validateUserOp(userOp, userOpHash, 0)
    );
  });

  it("AA Account Delegation is true by default", async () => {
    const testEnv = await loadFixture(fixture);
    const {
      users: [user1, entryPoint],
      accountFactory,
      accountRegistry,
    } = testEnv;

    await accountFactory.createAccount(user1.address, "1");

    const account = AccountProxy__factory.connect(
      await accountFactory.getAddress(user1.address, "1"),
      user1.signer
    );

    await expect(await account.getImplementation()).to.be.eq(
      await accountRegistry.getLatestImplementation()
    );

    const newAccountImpl = await deployAccount(entryPoint.address);
    await waitForTx(
      await accountRegistry.setLatestImplementation(newAccountImpl.address)
    );

    await expect(await account.getImplementation()).to.be.eq(
      newAccountImpl.address
    );
  });
});
