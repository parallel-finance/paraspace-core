import {expect} from "chai";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {
  convertToCurrencyDecimals,
  withSaveAndVerify,
} from "../deploy/helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {WalletBalanceProvider, WalletBalanceProvider__factory} from "../types";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {getFirstSigner} from "../deploy/helpers/contracts-getters";
import {ethers} from "ethers";

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("Wallet Balance Provider", () => {
  let walletBalanceProvider: WalletBalanceProvider;
  let testEnv: TestEnv;
  let snapShot: string;

  before("Deploy contract", async () => {
    testEnv = await loadFixture(testEnvFixture);

    walletBalanceProvider = await withSaveAndVerify(
      await new WalletBalanceProvider__factory(await getFirstSigner()).deploy(),
      "WalletBalanceProvider",
      [],
      false
    );
  });

  beforeEach(async () => {
    snapShot = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapShot);
  });

  it("Test can get user's balances from all reserves", async () => {
    const {
      addressesProvider,
      users: [user1],
      dai,
    } = testEnv;
    const amount = "1000";
    // mint token
    await mintAndValidate(dai, amount, user1);
    const [tokens, balances] =
      await walletBalanceProvider.getUserWalletBalances(
        addressesProvider.address,
        user1.address
      );

    expect(balances[tokens.indexOf(dai.address)]).to.eq(
      await convertToCurrencyDecimals(dai.address, amount)
    );
  });

  it("Test balance for inactive reserve is 0", async () => {
    const {
      addressesProvider,
      users: [user1],
      dai,
      configurator,
    } = testEnv;
    const amount = "1000";
    // mint token
    await mintAndValidate(dai, amount, user1);

    // deactivate DAI reserve
    await configurator.setReserveActive(dai.address, false);

    const [tokens, balances] =
      await walletBalanceProvider.getUserWalletBalances(
        addressesProvider.address,
        user1.address
      );

    expect(balances[tokens.indexOf(dai.address)]).to.eq(0);
  });

  it("Test can get user balance for a token", async () => {
    const {
      users: [user1],
      dai,
      pDai,
    } = testEnv;
    const amount = "1000";
    // mint tokens and supply
    await supplyAndValidate(dai, amount, user1, true);
    const balance = await walletBalanceProvider.balanceOf(
      user1.address,
      pDai.address
    );

    expect(balance).to.eq(await convertToCurrencyDecimals(dai.address, amount));
  });

  it("Test cannot get balance for unsupported token", async () => {
    const {
      users: [user1],
    } = testEnv;

    await expect(
      walletBalanceProvider.balanceOf(user1.address, ZERO_ADDRESS)
    ).to.be.revertedWith("INVALID_TOKEN");
  });

  it("Test can get User's ETH balance", async () => {
    const {
      users: [user1],
    } = testEnv;
    const balance = await walletBalanceProvider.balanceOf(
      user1.address,
      ETH_ADDRESS
    );

    expect(balance).to.eq(await user1.signer.getBalance());
  });

  it("Test can get user balances in batch", async () => {
    const {
      users: [user1, user2],
      dai,
      usdc,
    } = testEnv;
    const amount1 = "1000";
    const amount2 = "2000";
    // mint tokens
    await mintAndValidate(dai, amount1, user1);
    await mintAndValidate(usdc, amount2, user2);
    const balances = await walletBalanceProvider.batchBalanceOf(
      [user1.address, user2.address],
      [dai.address, usdc.address]
    );

    // response should be in the form of [ user1.dai, user1.usdc, user2.dai, user2.usdc]
    expect(balances[0]).to.eq(
      await convertToCurrencyDecimals(dai.address, amount1)
    );
    expect(balances[1]).to.eq(0);
    expect(balances[2]).to.eq(0);
    expect(balances[3]).to.eq(
      await convertToCurrencyDecimals(usdc.address, amount2)
    );
  });

  it("Test contract cannot receive ETH", async () => {
    const {deployer} = testEnv;

    await expect(
      deployer.signer.sendTransaction({
        to: walletBalanceProvider.address,
        value: ethers.utils.parseEther("1.0"),
      })
    ).to.be.revertedWith("22");
  });
});
