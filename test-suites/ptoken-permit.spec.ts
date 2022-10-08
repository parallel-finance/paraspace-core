import {expect} from "chai";
import {ethers, utils} from "ethers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {HARDHAT_CHAINID} from "../deploy/helpers/hardhat-constants";
import {
  buildPermitParams,
  getSignatureFromTypedData,
} from "../deploy/helpers/contracts-helpers";
import {makeSuite, TestEnv} from "./helpers/make-suite";
import {getTestWallets} from "./helpers/utils/wallets";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {ProtocolErrors} from "../deploy/helpers/types";

declare let hre: HardhatRuntimeEnvironment;

makeSuite("PToken: Permit", (testEnv: TestEnv) => {
  let testWallets;

  const EIP712_REVISION = "1";

  before(async () => {
    const {dai, pool, deployer} = testEnv;

    testWallets = getTestWallets();

    // Mint DAI and deposit to Pool to for pDAI
    await waitForTx(await dai["mint(uint256)"](utils.parseEther("20000")));
    await waitForTx(await dai.approve(pool.address, utils.parseEther("20000")));

    await waitForTx(
      await pool.supply(
        dai.address,
        utils.parseEther("20000"),
        deployer.address,
        0
      )
    );
  });

  it("Checks the domain separator", async () => {
    const {pDai} = testEnv;
    const separator = await pDai.DOMAIN_SEPARATOR();

    const domain = {
      name: await pDai.name(),
      version: EIP712_REVISION,
      chainId: hre.network.config.chainId,
      verifyingContract: pDai.address,
    };
    const domainSeparator = utils._TypedDataEncoder.hashDomain(domain);

    expect(separator).to.be.equal(domainSeparator, "Invalid domain separator");
  });

  it("Tries to submit a permit with 0 expiration (revert expected)", async () => {
    const {pDai, deployer, users} = testEnv;
    const owner = deployer;
    const spender = users[1];

    const tokenName = await pDai.name();

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const expiration = 0;
    const nonce = (await pDai.nonces(owner.address)).toNumber();
    const permitAmount = utils.parseEther("2").toString();
    const msgParams = buildPermitParams(
      chainId,
      pDai.address,
      EIP712_REVISION,
      tokenName,
      owner.address,
      spender.address,
      nonce,
      permitAmount,
      expiration.toFixed()
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    expect(
      (await pDai.allowance(owner.address, spender.address)).toString()
    ).to.be.equal("0", "INVALID_ALLOWANCE_BEFORE_PERMIT");

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      pDai
        .connect(spender.signer)
        .permit(
          owner.address,
          spender.address,
          permitAmount,
          expiration,
          v,
          r,
          s
        )
    ).to.be.revertedWith(ProtocolErrors.INVALID_EXPIRATION);

    expect(
      (await pDai.allowance(owner.address, spender.address)).toString()
    ).to.be.equal("0", "INVALID_ALLOWANCE_AFTER_PERMIT");
  });

  it("Submits a permit with maximum expiration length", async () => {
    const {pDai, deployer, users} = testEnv;
    const owner = deployer;
    const spender = users[1];

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await pDai.nonces(owner.address)).toNumber();
    const permitAmount = utils.parseEther("2").toString();
    const msgParams = buildPermitParams(
      chainId,
      pDai.address,
      EIP712_REVISION,
      await pDai.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    expect(
      (await pDai.allowance(owner.address, spender.address)).toString()
    ).to.be.equal("0", "INVALID_ALLOWANCE_BEFORE_PERMIT");

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    expect(
      await pDai
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, deadline, v, r, s)
    );

    expect((await pDai.nonces(owner.address)).toNumber()).to.be.equal(1);
  });

  it("Cancels the previous permit", async () => {
    const {pDai, deployer, users} = testEnv;
    const owner = deployer;
    const spender = users[1];

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await pDai.nonces(owner.address)).toNumber();
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      pDai.address,
      EIP712_REVISION,
      await pDai.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    expect(
      (await pDai.allowance(owner.address, spender.address)).toString()
    ).to.be.equal(
      ethers.utils.parseEther("2"),
      "INVALID_ALLOWANCE_BEFORE_PERMIT"
    );

    expect(
      await pDai
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, deadline, v, r, s)
    );
    expect(
      (await pDai.allowance(owner.address, spender.address)).toString()
    ).to.be.equal(permitAmount, "INVALID_ALLOWANCE_AFTER_PERMIT");

    expect((await pDai.nonces(owner.address)).toNumber()).to.be.equal(2);
  });

  it("Tries to submit a permit with invalid nonce (revert expected)", async () => {
    const {pDai, deployer, users} = testEnv;
    const owner = deployer;
    const spender = users[1];

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = 1000;
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      pDai.address,
      EIP712_REVISION,
      await pDai.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      pDai
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith(ProtocolErrors.INVALID_SIGNATURE);
  });

  it("Tries to submit a permit with invalid expiration (previous to the current block) (revert expected)", async () => {
    const {pDai, deployer, users} = testEnv;
    const owner = deployer;
    const spender = users[1];

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const expiration = "1";
    const nonce = (await pDai.nonces(owner.address)).toNumber();
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      pDai.address,
      EIP712_REVISION,
      await pDai.name(),
      owner.address,
      spender.address,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      pDai
        .connect(spender.signer)
        .permit(
          owner.address,
          spender.address,
          expiration,
          permitAmount,
          v,
          r,
          s
        )
    ).to.be.revertedWith(ProtocolErrors.INVALID_EXPIRATION);
  });

  it("Tries to submit a permit with invalid signature (revert expected)", async () => {
    const {pDai, deployer, users} = testEnv;
    const owner = deployer;
    const spender = users[1];

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await pDai.nonces(owner.address)).toNumber();
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      pDai.address,
      EIP712_REVISION,
      await pDai.name(),
      owner.address,
      spender.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      pDai
        .connect(spender.signer)
        .permit(owner.address, ZERO_ADDRESS, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith(ProtocolErrors.INVALID_SIGNATURE);
  });

  it("Tries to submit a permit with invalid owner (revert expected)", async () => {
    const {pDai, deployer, users} = testEnv;
    const owner = deployer;
    const spender = users[1];

    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const expiration = MAX_UINT_AMOUNT;
    const nonce = (await pDai.nonces(owner.address)).toNumber();
    const permitAmount = "0";
    const msgParams = buildPermitParams(
      chainId,
      pDai.address,
      EIP712_REVISION,
      await pDai.name(),
      owner.address,
      spender.address,
      nonce,
      expiration,
      permitAmount
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      pDai
        .connect(spender.signer)
        .permit(
          ZERO_ADDRESS,
          spender.address,
          expiration,
          permitAmount,
          v,
          r,
          s
        )
    ).to.be.revertedWith(ProtocolErrors.ZERO_ADDRESS_NOT_VALID);
  });
});
