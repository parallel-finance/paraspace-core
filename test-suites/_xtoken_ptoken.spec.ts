import type {HardhatRuntimeEnvironment} from "hardhat/types";

import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber, utils} from "ethers";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {
  deployDelegationAwarePToken,
  deployMintableDelegationERC20,
} from "../deploy/helpers/contracts-deployments";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {getTestWallets} from "./helpers/utils/wallets";
import {HARDHAT_CHAINID} from "../deploy/helpers/hardhat-constants";
import {
  buildPermitParams,
  convertToCurrencyDecimals,
  getSignatureFromTypedData,
} from "../deploy/helpers/contracts-helpers";
import {supplyAndValidate} from "./helpers/validated-steps";

declare let hre: HardhatRuntimeEnvironment;
describe("Ptoken delegation", () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {pool} = testEnv;
    const delegationERC20 = await deployMintableDelegationERC20([
      "DEL",
      "DEL",
      "18",
    ]);
    const delegationPToken = await deployDelegationAwarePToken([
      pool.address,
      delegationERC20.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      "aDEL",
      "aDEL",
    ]);
    return {
      ...testEnv,
      delegationERC20,
      delegationPToken,
    };
  };

  it("TC-ptoken-delegation-aware-01: user shouldn't call delegateUnderlyingTo if he isn't POOL_ADMIN", async () => {
    const {
      users: [user1, user2],
      delegationPToken,
    } = await loadFixture(fixture);

    await expect(
      delegationPToken.connect(user1.signer).delegateUnderlyingTo(user2.address)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);
  });

  it("TC-ptoken-delegation-aware-02: POOL_ADMIN should delegate to external address", async () => {
    const {
      users: [user2],
      delegationERC20,
      delegationPToken,
    } = await loadFixture(fixture);
    expect(await delegationPToken.delegateUnderlyingTo(user2.address))
      .to.emit(delegationPToken, "DelegateUnderlyingTo")
      .withArgs(user2.address);

    const delegateeAddress = await delegationERC20.delegatee();

    expect(delegateeAddress).to.be.equal(user2.address);
  });
});

describe("Ptoken modifiers", () => {
  it("TC-ptoken-access-control-01: mint should only be called by POOL", async () => {
    const {deployer, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.mint(deployer.address, deployer.address, "1", "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });

  it("TC-ptoken-access-control-02: burn should only be called by POOL", async () => {
    const {deployer, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.burn(deployer.address, deployer.address, "1", "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });

  it("TC-ptoken-access-control-03: transferOnLiquidation should only be called by POOL", async () => {
    const {deployer, users, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.transferOnLiquidation(deployer.address, users[0].address, "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });

  it("TC-ptoken-access-control-04: transferUnderlyingTo should only be called by POOL", async () => {
    const {deployer, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.transferUnderlyingTo(deployer.address, "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });
});

describe("Functionalities of ptoken permit", () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {dai, pool, deployer} = testEnv;
    const testWallets = getTestWallets();
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
    return {
      ...testEnv,
      ownerPrivateKey: testWallets[0].secretKey,
    };
  };
  const EIP712_REVISION = "1";

  it("TC-ptoken-permit-01: user shouldn't submit a permit with 0 expiration", async () => {
    const {
      pDai,
      deployer: owner,
      users: [, spender],
      ownerPrivateKey,
    } = await loadFixture(fixture);

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

  describe("Allowance could be override", () => {
    let preset: Awaited<ReturnType<typeof fixture>>;
    before(async () => {
      preset = await loadFixture(fixture);
    });

    it("TC-ptoken-permit-02: user should submit a permit with maxmium expiration", async () => {
      const {
        pDai,
        deployer: owner,
        users: [, spender],
        ownerPrivateKey,
      } = preset;

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

      expect(
        (await pDai.allowance(owner.address, spender.address)).toString()
      ).to.be.equal("0", "INVALID_ALLOWANCE_BEFORE_PERMIT");

      const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      expect(
        await pDai
          .connect(spender.signer)
          .permit(
            owner.address,
            spender.address,
            permitAmount,
            deadline,
            v,
            r,
            s
          )
      );

      expect((await pDai.nonces(owner.address)).toNumber()).to.be.equal(1);
    });

    it("TC-ptoken-permit-03: user should override a permit with new params", async () => {
      const {
        pDai,
        deployer: owner,
        users: [, spender],
        ownerPrivateKey,
      } = preset;

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

      expect(
        (await pDai.allowance(owner.address, spender.address)).toString()
      ).to.be.equal(utils.parseEther("2"), "INVALID_ALLOWANCE_BEFORE_PERMIT");

      const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);
      expect(
        await pDai
          .connect(spender.signer)
          .permit(
            owner.address,
            spender.address,
            permitAmount,
            deadline,
            v,
            r,
            s
          )
      );
      expect(
        (await pDai.allowance(owner.address, spender.address)).toString()
      ).to.be.equal(permitAmount, "INVALID_ALLOWANCE_AFTER_PERMIT");

      expect((await pDai.nonces(owner.address)).toNumber()).to.be.equal(2);
    });
  });

  it("TC-ptoken-permit-04: user shouldn't submit a permit with invalid nonce", async () => {
    const {
      pDai,
      deployer: owner,
      users: [, spender],
      ownerPrivateKey,
    } = await loadFixture(fixture);

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

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      pDai
        .connect(spender.signer)
        .permit(owner.address, spender.address, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith(ProtocolErrors.INVALID_SIGNATURE);
  });

  it("TC-ptoken-permit-05: user shouldn't submit a permit if expiration block is lower than current height", async () => {
    const {
      pDai,
      deployer: owner,
      users: [, spender],
      ownerPrivateKey,
    } = await loadFixture(fixture);

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

  it("TC-ptoken-permit-06: user shouldn't submit a permit if signature doesn't match the params", async () => {
    const {
      pDai,
      deployer: owner,
      users: [, spender],
      ownerPrivateKey,
    } = await loadFixture(fixture);

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

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    await expect(
      pDai
        .connect(spender.signer)
        .permit(owner.address, ZERO_ADDRESS, permitAmount, deadline, v, r, s)
    ).to.be.revertedWith(ProtocolErrors.INVALID_SIGNATURE);
  });

  it("TC-ptoken-permit-07: user shouldn't submit a permit while owner is ZERO_ADDRESS", async () => {
    const {
      pDai,
      deployer: owner,
      users: [, spender],
      ownerPrivateKey,
    } = await loadFixture(fixture);

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

  it("TC-ptoken-permit-08: domain separator should be correct", async () => {
    const {pDai} = await loadFixture(fixture);
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
});

describe("Tests for events in ptoken functions", () => {
  const fixture = async () => {
    const {
      dai,
      pDai,
      users: [depositor, receiver],
      pool,
      protocolDataProvider,
    } = await loadFixture(testEnvFixture);
    const firstDaiDeposit = await convertToCurrencyDecimals(
      dai.address,
      "10000"
    );

    // mints DAI to depositor
    await waitForTx(
      await dai
        .connect(depositor.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access depositor wallet
    await waitForTx(
      await dai.connect(depositor.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    const daiReserveData = await protocolDataProvider.getReserveData(
      dai.address
    );
    return {
      depositor,
      receiver,
      firstDaiDeposit,
      dai,
      pDai,
      daiReserveData,
      pool,
    };
  };
  it("TC-ptoken-event-01: `supply` should emit `Mint` event correctly when depositing for himself", async () => {
    const {depositor, firstDaiDeposit, dai, pDai, daiReserveData, pool} =
      await loadFixture(fixture);
    const expectedBalanceIncrease = 0;

    await expect(
      pool
        .connect(depositor.signer)
        .supply(dai.address, firstDaiDeposit, depositor.address, "0")
    )
      .to.emit(pDai, "Mint")
      .withArgs(
        depositor.address,
        depositor.address,
        firstDaiDeposit,
        expectedBalanceIncrease,
        daiReserveData.liquidityIndex
      );

    const pDaiBalance = await pDai.balanceOf(depositor.address);
    expect(pDaiBalance).to.be.equal(firstDaiDeposit);
  });

  it("TC-ptoken-event-02: `supply` should emit `Mint` event correctly when is on behave of others", async () => {
    const {
      depositor,
      receiver,
      firstDaiDeposit,
      dai,
      pDai,
      daiReserveData,
      pool,
    } = await loadFixture(fixture);

    const expectedBalanceIncrease = 0;

    await expect(
      pool
        .connect(depositor.signer)
        .supply(dai.address, firstDaiDeposit, receiver.address, "0")
    )
      .to.emit(pDai, "Mint")
      .withArgs(
        depositor.address,
        receiver.address,
        firstDaiDeposit,
        expectedBalanceIncrease,
        daiReserveData.liquidityIndex
      );

    const pDaiBalance = await pDai.balanceOf(receiver.address);
    expect(pDaiBalance).to.be.equal(firstDaiDeposit);
  });
});

describe("Ptoken transfer tests", () => {
  let amountDAItoDeposit: BigNumber;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {users, pool, dai, weth} = testEnv;
    const DAI_AMOUNT_TO_DEPOSIT = "1000";

    amountDAItoDeposit = await convertToCurrencyDecimals(
      dai.address,
      DAI_AMOUNT_TO_DEPOSIT
    );

    await dai.connect(users[0].signer)["mint(uint256)"](amountDAItoDeposit);
    await dai.connect(users[0].signer).approve(pool.address, MAX_UINT_AMOUNT);
    await pool
      .connect(users[0].signer)
      .supply(dai.address, amountDAItoDeposit, users[0].address, "0");

    await supplyAndValidate(weth, "1", users[2], true);
    return testEnv;
  };

  it("TC-ptoken-transfer-01: user should transfer ptoken when underlying assets are collateral", async () => {
    const {users, pDai} = await loadFixture(fixture);
    expect(
      await pDai
        .connect(users[0].signer)
        .transfer(users[0].address, amountDAItoDeposit)
    )
      .to.emit(pDai, "Transfer")
      .withArgs(users[0].address, users[0].address, amountDAItoDeposit);

    const fromBalance = await pDai.balanceOf(users[0].address);
    const toBalance = await pDai.balanceOf(users[0].address);
    expect(fromBalance.toString()).to.be.eq(toBalance.toString());
  });

  it("TC-ptoken-transfer-02: user should transfer ptoken when underlying assets ain't collateral", async () => {
    const {users, pool, dai, pDai} = await loadFixture(fixture);
    await pool
      .connect(users[0].signer)
      .setUserUseERC20AsCollateral(dai.address, false);

    expect(
      await pDai
        .connect(users[0].signer)
        .transfer(users[1].address, amountDAItoDeposit)
    )
      .to.emit(pDai, "Transfer")
      .withArgs(users[0].address, users[1].address, amountDAItoDeposit);

    const fromBalance = await pDai.balanceOf(users[0].address);
    const toBalance = await pDai.balanceOf(users[1].address);
    expect(fromBalance.toString()).to.be.equal("0");
    expect(toBalance.toString()).to.be.equal(amountDAItoDeposit.toString());
  });

  it("TC-ptoken-transfer-05: user shouldn't transfer all his tokens if he has loans", async () => {
    const {users, pDai, weth, pool} = await loadFixture(fixture);

    await pool
      .connect(users[0].signer)
      .borrow(
        weth.address,
        await convertToCurrencyDecimals(weth.address, "0.1"),
        "0",
        users[0].address,
        {gasLimit: 500000}
      );

    const user0Balance = await pDai.balanceOf(users[0].address);

    await expect(
      pDai.connect(users[0].signer).transfer(users[1].address, user0Balance),
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    ).to.be.revertedWith(
      ProtocolErrors.HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD
    );
  });
});
