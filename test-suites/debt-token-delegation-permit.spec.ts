import {expect} from "chai";
import {BigNumber, utils} from "ethers";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {HARDHAT_CHAINID} from "../deploy/helpers/hardhat-constants";
import {
  buildDelegationWithSigParams,
  convertToCurrencyDecimals,
  getSignatureFromTypedData,
} from "../deploy/helpers/contracts-helpers";
import {evmRevert, evmSnapshot, timeLatest} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {getTestWallets} from "./helpers/utils/wallets";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {ProtocolErrors} from "../deploy/helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

declare let hre: HardhatRuntimeEnvironment;

describe("DebtToken: Permit Delegation", () => {
  let snapId;
  let testEnv: TestEnv;

  beforeEach(async () => {
    snapId = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snapId);
  });

  let daiMintedAmount: BigNumber;
  let wethMintedAmount: BigNumber;
  let testWallets;

  const MINT_AMOUNT = "1000";
  const EIP712_REVISION = "1";

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      pool,
      weth,
      dai,
      deployer: user1,
      users: [user2],
    } = testEnv;
    testWallets = getTestWallets();

    // Setup the pool
    daiMintedAmount = await convertToCurrencyDecimals(dai.address, MINT_AMOUNT);
    wethMintedAmount = await convertToCurrencyDecimals(
      weth.address,
      MINT_AMOUNT
    );

    expect(await dai["mint(uint256)"](daiMintedAmount));
    expect(await dai.approve(pool.address, daiMintedAmount));
    expect(await pool.supply(dai.address, daiMintedAmount, user1.address, 0));
    expect(await weth.connect(user2.signer)["mint(uint256)"](wethMintedAmount));
    expect(
      await weth.connect(user2.signer).approve(pool.address, wethMintedAmount)
    );
    expect(
      await pool
        .connect(user2.signer)
        .supply(weth.address, wethMintedAmount, user2.address, 0)
    );
  });

  it("Checks the domain separator", async () => {
    const {variableDebtDai} = testEnv;
    const variableSeparator = await variableDebtDai.DOMAIN_SEPARATOR();

    const variableDomain = {
      name: await variableDebtDai.name(),
      version: EIP712_REVISION,
      chainId: hre.network.config.chainId,
      verifyingContract: variableDebtDai.address,
    };
    const variableDomainSeparator =
      utils._TypedDataEncoder.hashDomain(variableDomain);

    expect(variableSeparator).to.be.equal(
      variableDomainSeparator,
      "Invalid variable domain separator"
    );
  });

  it("User 3 borrows variable interest dai on behalf of user 2 via permit", async () => {
    const {
      pool,
      variableDebtDai,
      dai,
      deployer: user1,
      users: [user2, user3],
    } = testEnv;

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
    const permitAmount = daiMintedAmount.div(3);
    const msgParams = buildDelegationWithSigParams(
      chainId,
      variableDebtDai.address,
      EIP712_REVISION,
      await variableDebtDai.name(),
      user3.address,
      nonce,
      expiration,
      permitAmount.toString()
    );

    const user2PrivateKey = testWallets[1].secretKey;
    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");

    const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

    expect(
      await variableDebtDai
        .connect(user1.signer)
        .delegationWithSig(
          user2.address,
          user3.address,
          permitAmount,
          expiration,
          v,
          r,
          s
        )
    );

    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal(permitAmount);

    await pool
      .connect(user3.signer)
      .borrow(dai.address, permitAmount, 0, user2.address);
    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");
  });

  it("Variable debt delegation with delegator == address(0)", async () => {
    const {
      variableDebtDai,
      deployer: user1,
      users: [user2, user3],
    } = testEnv;

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
    const permitAmount = daiMintedAmount.div(3);
    const msgParams = buildDelegationWithSigParams(
      chainId,
      variableDebtDai.address,
      EIP712_REVISION,
      await variableDebtDai.name(),
      user3.address,
      nonce,
      expiration,
      permitAmount.toString()
    );

    const user2PrivateKey = testWallets[1].secretKey;
    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");

    const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

    await expect(
      variableDebtDai
        .connect(user1.signer)
        .delegationWithSig(
          ZERO_ADDRESS,
          user3.address,
          permitAmount,
          expiration,
          v,
          r,
          s
        )
    ).to.be.revertedWith(ProtocolErrors.ZERO_ADDRESS_NOT_VALID);

    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");
  });

  it("Variable debt delegation with block.timestamp > deadline", async () => {
    const {
      variableDebtDai,
      deployer: user1,
      users: [user2, user3],
    } = testEnv;

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const expiration = (await timeLatest()).sub(500).toString();
    const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
    const permitAmount = daiMintedAmount.div(3);
    const msgParams = buildDelegationWithSigParams(
      chainId,
      variableDebtDai.address,
      EIP712_REVISION,
      await variableDebtDai.name(),
      user3.address,
      nonce,
      expiration,
      permitAmount.toString()
    );

    const user2PrivateKey = testWallets[1].secretKey;
    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");

    const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

    await expect(
      variableDebtDai
        .connect(user1.signer)
        .delegationWithSig(
          user2.address,
          user3.address,
          permitAmount,
          expiration,
          v,
          r,
          s
        )
    ).to.be.revertedWith(ProtocolErrors.INVALID_EXPIRATION);

    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");
  });

  it("Variable debt delegation with wrong delegator", async () => {
    const {
      variableDebtDai,
      deployer: user1,
      users: [user2, user3],
    } = testEnv;

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
    const permitAmount = daiMintedAmount.div(3);
    const msgParams = buildDelegationWithSigParams(
      chainId,
      variableDebtDai.address,
      EIP712_REVISION,
      await variableDebtDai.name(),
      user3.address,
      nonce,
      expiration,
      permitAmount.toString()
    );

    const user2PrivateKey = testWallets[1].secretKey;
    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");

    const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

    await expect(
      variableDebtDai
        .connect(user1.signer)
        .delegationWithSig(
          user1.address,
          user3.address,
          permitAmount,
          expiration,
          v,
          r,
          s
        )
    ).to.be.revertedWith(ProtocolErrors.INVALID_SIGNATURE);

    expect(
      (
        await variableDebtDai.borrowAllowance(user2.address, user3.address)
      ).toString()
    ).to.be.equal("0");
  });
});
