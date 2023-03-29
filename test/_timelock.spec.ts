import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {deployReserveTimeLockStrategy} from "../helpers/contracts-deployments";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {
  getAutoCompoundApe,
  getPoolConfiguratorProxy,
  getTimeLockProxy,
} from "../helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {eContractid} from "../helpers/types";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {AutoCompoundApe, IPool, ITimeLock, TimeLock} from "../types";
import {PromiseOrValue} from "../types/common";
import {BigNumberish, Signer, utils} from "ethers";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";

const agreementEventSig = utils.keccak256(
  utils.toUtf8Bytes(
    "AgreementCreated(bytes32,uint8,uint8,address,uint256[],address,uint48)"
  )
);
const withdrawEventSig = utils.keccak256(
  utils.toUtf8Bytes("Withdraw(address,address,address,uint256)")
);

const wrapBorrowERC20 = async (
  pool: IPool,
  signer: Signer,
  timeLockProxy: TimeLock,
  asset: PromiseOrValue<string>,
  amount: PromiseOrValue<BigNumberish>,
  to: PromiseOrValue<string>
): Promise<ITimeLock.AgreementStruct> => {
  const tx = await waitForTx(
    await pool.connect(signer).borrow(asset, amount, 0, to, {
      gasLimit: 5000000,
    })
  );

  const agreementEvents = tx.logs.filter(
    ({topics}) => topics[0] === agreementEventSig
  );

  const parsedAgreementEvent = timeLockProxy.interface.parseLog(
    agreementEvents[0]
  );

  return {
    assetType: parsedAgreementEvent.args.assetType,
    actionType: parsedAgreementEvent.args.actionType,
    asset: asset,
    beneficiary: to,
    tokenIdsOrAmounts: [amount],
    releaseTime: parsedAgreementEvent.args.releaseTime,
  };
};

const wrapWithdrawERC20 = async (
  pool: IPool,
  signer: Signer,
  timeLockProxy: TimeLock,
  asset: PromiseOrValue<string>,
  amount: PromiseOrValue<BigNumberish>,
  to: PromiseOrValue<string>
): Promise<ITimeLock.AgreementStruct> => {
  const tx = await waitForTx(
    await pool.connect(signer).withdraw(asset, amount, to, {
      gasLimit: 5000000,
    })
  );

  const agreementEvents = tx.logs.filter(
    ({topics}) => topics[0] === agreementEventSig
  );
  const withdrawEvents = tx.logs.filter(
    ({topics}) => topics[0] === withdrawEventSig
  );

  const parsedAgreementEvent = timeLockProxy.interface.parseLog(
    agreementEvents[0]
  );
  const parsedWithdrawEvent = pool.interface.parseLog(withdrawEvents[0]);

  return {
    assetType: parsedAgreementEvent.args.assetType,
    actionType: parsedAgreementEvent.args.actionType,
    asset: asset,
    beneficiary: to,
    tokenIdsOrAmounts: [parsedWithdrawEvent.args.amount],
    releaseTime: parsedAgreementEvent.args.releaseTime,
  };
};

const wrapWithdrawERC721 = async (
  pool: IPool,
  signer: Signer,
  timeLockProxy: TimeLock,
  asset: PromiseOrValue<string>,
  tokenIds: PromiseOrValue<BigNumberish>[],
  to: PromiseOrValue<string>
): Promise<ITimeLock.AgreementStruct> => {
  const tx = await waitForTx(
    await pool.connect(signer).withdrawERC721(asset, tokenIds, to, {
      gasLimit: 5000000,
    })
  );

  const agreementEvents = tx.logs.filter(
    ({topics}) => topics[0] === agreementEventSig
  );

  const parsedAgreementEvent = timeLockProxy.interface.parseLog(
    agreementEvents[0]
  );

  return {
    assetType: parsedAgreementEvent.args.assetType,
    actionType: parsedAgreementEvent.args.actionType,
    asset: asset,
    beneficiary: to,
    tokenIdsOrAmounts: tokenIds,
    releaseTime: parsedAgreementEvent.args.releaseTime,
  };
};

describe("TimeLock functionality tests", () => {
  const minTime = 5;
  const midTime = 300;
  const maxTime = 3600;
  let timeLockProxy;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      apeCoinStaking,
      dai,
      usdc,
      pool,
      mayc,
      moonbirds,
      users: [user1, user2, , , user3],
      poolAdmin,
    } = testEnv;

    // User1 - Deposit cApe
    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();
    await mintAndValidate(ape, "1000", user1);
    await mintAndValidate(ape, "1", user3);
    await waitForTx(
      await ape.connect(user1.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user3.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );
    // user4 deposit MINIMUM_LIQUIDITY to make test case easy
    await waitForTx(
      await cApe.connect(user3.signer).deposit(user3.address, MINIMUM_LIQUIDITY)
    );
    await waitForTx(
      await cApe
        .connect(user1.signer)
        .deposit(user1.address, parseEther("1000"))
    );
    await waitForTx(
      await cApe.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(cApe.address, parseEther("1000"), user1.address, 0)
    );

    // User 1 - Deposit dai
    await supplyAndValidate(dai, "20000000", user1, true);
    // User 2 - Deposit usdc
    await supplyAndValidate(usdc, "200000", user2, true);

    await supplyAndValidate(mayc, "10", user1, true);

    await supplyAndValidate(moonbirds, "10", user1, true);

    const minThreshold = await convertToCurrencyDecimals(usdc.address, "1000");
    const midThreshold = await convertToCurrencyDecimals(usdc.address, "2000");
    const minThresholdNFT = 2;
    const midThresholdNFT = 5;

    const defaultStrategy = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy + "ERC20",
      pool.address,
      minThreshold.toString(),
      midThreshold.toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString(),
      midThreshold.mul(10).toString(),
      (12 * 3600).toString(),
      (24 * 3600).toString()
    );

    const cApeStrategy = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy + "cApe",
      pool.address,
      parseEther("100").toString(),
      parseEther("1000").toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString(),
      parseEther("10000").toString(),
      (12 * 3600).toString(),
      (24 * 3600).toString()
    );

    const defaultStrategyNFT = await deployReserveTimeLockStrategy(
      eContractid.DefaultTimeLockStrategy + "ERC721",
      pool.address,
      minThresholdNFT.toString(),
      midThresholdNFT.toString(),
      minTime.toString(),
      midTime.toString(),
      maxTime.toString(),
      midThreshold.mul(10).toString(),
      (12 * 3600).toString(),
      (24 * 3600).toString()
    );

    const poolConfigurator = await getPoolConfiguratorProxy();
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          usdc.address,
          defaultStrategy.address
        )
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          mayc.address,
          defaultStrategyNFT.address
        )
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(
          moonbirds.address,
          defaultStrategyNFT.address
        )
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(dai.address, defaultStrategy.address)
    );
    await waitForTx(
      await poolConfigurator
        .connect(poolAdmin.signer)
        .setReserveTimeLockStrategyAddress(cApe.address, cApeStrategy.address)
    );

    return testEnv;
  };

  before(async () => {
    await loadFixture(testEnvFixture);

    timeLockProxy = await getTimeLockProxy();
  });

  it("borrowed amount below minThreshold should be time locked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    const amount = await convertToCurrencyDecimals(usdc.address, "100");
    //FIXME(alan): may we have a error code for this.

    const agreement = await wrapBorrowERC20(
      pool,
      user1.signer,
      timeLockProxy,
      usdc.address,
      amount,
      user1.address
    );

    await expect(await usdc.balanceOf(pool.TIME_LOCK())).to.be.eq(amount);

    const balanceBefore = await usdc.balanceOf(user1.address);

    await advanceTimeAndBlock(10);

    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );

    const balanceAfter = await usdc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("borrowed amount below above min and below mid thresholds should be time locked for 300 seconds", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    const amount = await convertToCurrencyDecimals(usdc.address, "1200");
    //FIXME(alan): may we have a error code for this.

    const agreement = await wrapBorrowERC20(
      pool,
      user1.signer,
      timeLockProxy,
      usdc.address,
      amount,
      user1.address
    );

    await expect(await usdc.balanceOf(pool.TIME_LOCK())).to.be.eq(amount);

    const balanceBefore = await usdc.balanceOf(user1.address);

    await advanceTimeAndBlock(10);

    await expect(timeLockProxy.connect(user1.signer).claim([agreement])).to.be
      .reverted;

    await advanceTimeAndBlock(300);

    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );
    const balanceAfter = await usdc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("borrowed amount below above max thresholds should be time locked for 3600 seconds", async () => {
    const {
      pool,
      users: [user1],
      usdc,
    } = await loadFixture(fixture);

    const amount = await convertToCurrencyDecimals(usdc.address, "2200");
    //FIXME(alan): may we have a error code for this.

    const agreement = await wrapBorrowERC20(
      pool,
      user1.signer,
      timeLockProxy,
      usdc.address,
      amount,
      user1.address
    );

    await expect(await usdc.balanceOf(pool.TIME_LOCK())).to.be.eq(amount);

    const balanceBefore = await usdc.balanceOf(user1.address);

    await advanceTimeAndBlock(300);

    await expect(timeLockProxy.connect(user1.signer).claim([agreement])).to.be
      .reverted;

    await advanceTimeAndBlock(3400);

    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );
    const balanceAfter = await usdc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("withdraw ERC20 amount below minThreshold should be time locked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      dai,
      usdc,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(usdc.address, "100"); // used usdc intentionally since the mock strategy uses usdc decimals

    const balanceBefore = await dai.balanceOf(user1.address);

    const agreement = await wrapWithdrawERC20(
      pool,
      user1.signer,
      timeLockProxy,
      dai.address,
      amount,
      user1.address
    );

    await advanceTimeAndBlock(10);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );
    const balanceAfter = await dai.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("withdraw ERC20 amount above minThreshold should be time locked for 300 seconds", async () => {
    const {
      pool,
      users: [user1],
      dai,
      usdc,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(usdc.address, "1200"); // used usdc intentionally since the mock strategy uses usdc decimals

    const balanceBefore = await dai.balanceOf(user1.address);

    const agreement = await wrapWithdrawERC20(
      pool,
      user1.signer,
      timeLockProxy,
      dai.address,
      amount,
      user1.address
    );

    await advanceTimeAndBlock(10);
    await expect(timeLockProxy.connect(user1.signer).claim([agreement])).to.be
      .reverted;

    await advanceTimeAndBlock(300);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );

    const balanceAfter = await dai.balanceOf(user1.address);
    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
  });

  it("withdraw ERC20 multiple times and batch claim at once", async () => {
    const {
      pool,
      users: [user1],
      dai,
      usdc,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(usdc.address, "10"); // used usdc intentionally since the mock strategy uses usdc decimals

    const balanceBefore = await dai.balanceOf(user1.address);

    const agreements: ITimeLock.AgreementStruct[] = [];
    for (let index = 0; index < 10; index++) {
      const agreement = await wrapWithdrawERC20(
        pool,
        user1.signer,
        timeLockProxy,
        dai.address,
        amount,
        user1.address
      );
      agreements.push(agreement);
    }

    await advanceTimeAndBlock(10);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim(agreements)
    );

    const balanceAfter = await dai.balanceOf(user1.address);
    await expect(balanceAfter).to.be.eq(balanceBefore.add(amount.mul(10)));
  });

  it("withdraw ERC20 using max(uint) should work as expected", async () => {
    const {
      pool,
      users: [user1],
      dai,
      pDai,
    } = await loadFixture(fixture);
    const amount = await convertToCurrencyDecimals(dai.address, "100"); // used usdc intentionally since the mock strategy uses usdc decimals

    const pDaiBalance = await pDai.balanceOf(user1.address);

    const agreement = await wrapWithdrawERC20(
      pool,
      user1.signer,
      timeLockProxy,
      dai.address,
      MAX_UINT_AMOUNT,
      user1.address
    );

    await advanceTimeAndBlock(36 * 3600);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );

    const balanceAfter = await dai.balanceOf(user1.address);
    await expect(balanceAfter).to.be.closeTo(pDaiBalance, amount);
  });

  it("withdraw erc721 tokens below minThreshold should be time locked for 1 block only", async () => {
    const {
      pool,
      users: [user1],
      mayc,
    } = await loadFixture(fixture);

    const balanceBefore = await mayc.balanceOf(user1.address);

    const agreement = await wrapWithdrawERC721(
      pool,
      user1.signer,
      timeLockProxy,
      mayc.address,
      ["0"],
      user1.address
    );

    await advanceTimeAndBlock(10);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );
    const balanceAfter = await mayc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(1));
  });

  it("withdraw erc721 tokens above midThreshold should be time locked for 3600 seconds", async () => {
    const {
      pool,
      users: [user1],
      mayc,
    } = await loadFixture(fixture);

    const balanceBefore = await mayc.balanceOf(user1.address);

    const agreement = await wrapWithdrawERC721(
      pool,
      user1.signer,
      timeLockProxy,
      mayc.address,
      Array.from(Array(7).keys()),
      user1.address
    );

    await advanceTimeAndBlock(10);
    await expect(timeLockProxy.connect(user1.signer).claim([agreement])).to.be
      .reverted;

    await advanceTimeAndBlock(4000);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );
    const balanceAfter = await mayc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(7));
  });

  it("withdraw multiple ERC721 and batch claim at once", async () => {
    const {
      pool,
      users: [user1],
      mayc,
    } = await loadFixture(fixture);

    const balanceBefore = await mayc.balanceOf(user1.address);

    const agreements: ITimeLock.AgreementStruct[] = [];
    for (let index = 0; index < 10; index++) {
      const agreement = await wrapWithdrawERC721(
        pool,
        user1.signer,
        timeLockProxy,
        mayc.address,
        [index],
        user1.address
      );
      agreements.push(agreement);
    }

    await advanceTimeAndBlock(4000);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim(agreements)
    );
    const balanceAfter = await mayc.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(10));
  });

  it("withdraw multiple moonbirds and batch claim at once", async () => {
    const {
      pool,
      users: [user1],
      moonbirds,
    } = await loadFixture(fixture);

    const balanceBefore = await moonbirds.balanceOf(user1.address);

    const agreements: ITimeLock.AgreementStruct[] = [];
    for (let index = 0; index < 10; index++) {
      const agreement = await wrapWithdrawERC721(
        pool,
        user1.signer,
        timeLockProxy,
        moonbirds.address,
        [index],
        user1.address
      );
      agreements.push(agreement);
    }

    await advanceTimeAndBlock(4000);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim(agreements)
    );
    const balanceAfter = await moonbirds.balanceOf(user1.address);

    await expect(balanceAfter).to.be.eq(balanceBefore.add(10));
  });

  it("withdraw multiple mayc and moonbirds and batch claim at once", async () => {
    const {
      pool,
      users: [user1],
      mayc,
      moonbirds,
    } = await loadFixture(fixture);

    const moonbirdsBalanceBefore = await moonbirds.balanceOf(user1.address);
    const maycBalanceBefore = await mayc.balanceOf(user1.address);

    const agreements: ITimeLock.AgreementStruct[] = [];
    for (let index = 0; index < 2; index++) {
      const agreement = await wrapWithdrawERC721(
        pool,
        user1.signer,
        timeLockProxy,
        moonbirds.address,
        [index],
        user1.address
      );
      agreements.push(agreement);
    }

    for (let index = 0; index < 2; index++) {
      const agreement = await wrapWithdrawERC721(
        pool,
        user1.signer,
        timeLockProxy,
        mayc.address,
        [index],
        user1.address
      );
      agreements.push(agreement);
    }

    await advanceTimeAndBlock(4000);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim(agreements)
    );
    const moonbirdsBalanceAfter = await moonbirds.balanceOf(user1.address);
    const maycBalanceAfter = await mayc.balanceOf(user1.address);

    await expect(moonbirdsBalanceAfter).to.be.eq(moonbirdsBalanceBefore.add(2));
    await expect(maycBalanceAfter).to.be.eq(maycBalanceBefore.add(2));
  });

  it("withdraw Rebase ERC20 should work as expected", async () => {
    const {
      pool,
      users: [user1],
    } = await loadFixture(fixture);

    const agreement = await wrapWithdrawERC20(
      pool,
      user1.signer,
      timeLockProxy,
      cApe.address,
      MAX_UINT_AMOUNT,
      user1.address
    );

    await expect(timeLockProxy.connect(user1.signer).claim([agreement])).to.be
      .reverted;

    await advanceTimeAndBlock(3600);
    await waitForTx(
      await timeLockProxy.connect(user1.signer).claim([agreement])
    );

    const balance = await cApe.balanceOf(user1.address);
    // 1000 + 3600reward
    almostEqual(balance, parseEther("4600"));
  });
});
