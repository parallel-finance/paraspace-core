import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe, ParaApeStaking} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getParaApeStaking,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {parseEther} from "ethers/lib/utils";

describe("Para Ape Staking Test", () => {
  let testEnv: TestEnv;
  let paraApeStaking: ParaApeStaking;
  let cApe: AutoCompoundApe;
  let MINIMUM_LIQUIDITY;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, , , user4, , user6],
      apeCoinStaking,
      pool,
      configurator,
      poolAdmin,
    } = testEnv;

    paraApeStaking = await getParaApeStaking();

    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setApeStakingBot(user4.address)
    );

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    // user6 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

    // user4 deposit and supply cApe to MM
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setSupplyCap(cApe.address, "20000000000")
    );
    await mintAndValidate(ape, "10000000000", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user4.signer)
        .deposit(user4.address, parseEther("10000000000"))
    );
    await waitForTx(
      await cApe.connect(user4.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user4.signer)
        .supply(cApe.address, parseEther("10000000000"), user4.address, 0)
    );

    await mintAndValidate(ape, "200000000", user1);
    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );
  });

  it(" supply 100 + 4 bayc", async () => {
    const {
      bayc,
      users: [user1],
    } = testEnv;

    await supplyAndValidate(bayc, "104", user1, true);
  });

  it(" supply 100 + 4 mayc", async () => {
    const {
      mayc,
      users: [user1],
    } = testEnv;

    await supplyAndValidate(mayc, "104", user1, true);
  });

  it(" supply 125 + 8 bakc", async () => {
    const {
      bakc,
      users: [user1],
    } = testEnv;

    await supplyAndValidate(bakc, "133", user1, true);
  });

  it(" deposit", async () => {
    const {
      users: [user1],
      bayc,
      mayc,
      bakc,
      ape,
    } = testEnv;

    const tx0 = paraApeStaking.interface.encodeFunctionData("depositPairNFT", [
      user1.address,
      true,
      Array.from(Array(25).keys()), //bayc 0-25
      Array.from(Array(25).keys()), //bakc 0-25
    ]);
    const tx1 = paraApeStaking.interface.encodeFunctionData("depositPairNFT", [
      user1.address,
      false,
      Array.from(Array(25).keys()), //mayc 0-25
      Array.from(Array(50).keys()).slice(25), //bakc 25-50
    ]);
    const tx2 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      bayc.address,
      Array.from(Array(50).keys()).slice(25), //bayc 25-50
    ]);
    const tx3 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      mayc.address,
      Array.from(Array(50).keys()).slice(25), //mayc 25-50
    ]);
    const tx4 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      bakc.address,
      Array.from(Array(75).keys()).slice(50), //bakc 50-75
    ]);

    const tx5 = paraApeStaking.interface.encodeFunctionData(
      "depositApeCoinPool",
      [
        {
          onBehalf: user1.address,
          cashToken: ape.address,
          cashAmount: parseEther("5000000"),
          isBAYC: true,
          tokenIds: Array.from(Array(75).keys()).slice(50), //bayc 50-75
        },
      ]
    );

    const tx6 = paraApeStaking.interface.encodeFunctionData(
      "depositApeCoinPool",
      [
        {
          onBehalf: user1.address,
          cashToken: ape.address,
          cashAmount: parseEther("2500000"),
          isBAYC: false,
          tokenIds: Array.from(Array(75).keys()).slice(50), //mayc 50-75
        },
      ]
    );

    const tx7 = paraApeStaking.interface.encodeFunctionData(
      "depositApeCoinPairPool",
      [
        {
          onBehalf: user1.address,
          cashToken: ape.address,
          cashAmount: parseEther("1250000"),
          isBAYC: true,
          apeTokenIds: Array.from(Array(100).keys()).slice(75), //bayc 75-100
          bakcTokenIds: Array.from(Array(100).keys()).slice(75), //bakc 75-100
        },
      ]
    );

    const tx8 = paraApeStaking.interface.encodeFunctionData(
      "depositApeCoinPairPool",
      [
        {
          onBehalf: user1.address,
          cashToken: ape.address,
          cashAmount: parseEther("1250000"),
          isBAYC: false,
          apeTokenIds: Array.from(Array(100).keys()).slice(75), //mayc 75-100
          bakcTokenIds: Array.from(Array(125).keys()).slice(100), //bakc 100-125
        },
      ]
    );

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .multicall([tx0, tx1, tx2, tx3, tx4, tx5, tx6, tx7, tx8])
    );
  });

  it(" staking", async () => {
    const {
      users: [user1],
    } = testEnv;

    const tx0 = paraApeStaking.interface.encodeFunctionData("stakingPairNFT", [
      true,
      Array.from(Array(25).keys()), //bayc 0-25
      Array.from(Array(25).keys()), //bakc 0-25
    ]);
    const tx1 = paraApeStaking.interface.encodeFunctionData("stakingPairNFT", [
      false,
      Array.from(Array(25).keys()), //mayc 0-25
      Array.from(Array(50).keys()).slice(25), //bakc 25-50
    ]);
    const tx2 = paraApeStaking.interface.encodeFunctionData("stakingApe", [
      true,
      Array.from(Array(50).keys()).slice(25), //bayc 25-50
    ]);
    const tx3 = paraApeStaking.interface.encodeFunctionData("stakingApe", [
      false,
      Array.from(Array(50).keys()).slice(25), //mayc 25-50
    ]);
    const tx4 = paraApeStaking.interface.encodeFunctionData("stakingBAKC", [
      {
        baycTokenIds: Array.from(Array(50).keys()).slice(25, 30), //bayc 25-30
        bakcPairBaycTokenIds: Array.from(Array(75).keys()).slice(50, 55), //bakc 50-55
        maycTokenIds: Array.from(Array(50).keys()).slice(30), //mayc 30-50
        bakcPairMaycTokenIds: Array.from(Array(75).keys()).slice(55), //bakc 55-75
      },
    ]);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .multicall([tx0, tx1, tx2, tx3, tx4])
    );
  });

  it("first compound", async () => {
    const {
      users: [, , , user4],
    } = testEnv;

    await advanceTimeAndBlock(parseInt("4000"));

    const tx0 = paraApeStaking.interface.encodeFunctionData("compoundPairNFT", [
      true,
      Array.from(Array(25).keys()), //bayc 0-25,
      Array.from(Array(25).keys()), //bakc 0-25
    ]);

    const tx1 = paraApeStaking.interface.encodeFunctionData("compoundPairNFT", [
      false,
      Array.from(Array(25).keys()), //mayc 0-25
      Array.from(Array(50).keys()).slice(25), //bakc 25-50
    ]);

    const tx2 = paraApeStaking.interface.encodeFunctionData("compoundApe", [
      true,
      Array.from(Array(50).keys()).slice(25), //bayc 25-50
    ]);
    const tx3 = paraApeStaking.interface.encodeFunctionData("compoundApe", [
      false,
      Array.from(Array(50).keys()).slice(25), //mayc 25-50
    ]);
    const tx4 = paraApeStaking.interface.encodeFunctionData("compoundBAKC", [
      {
        baycTokenIds: Array.from(Array(50).keys()).slice(25, 30), //bayc 25-30
        bakcPairBaycTokenIds: Array.from(Array(75).keys()).slice(50, 55), //bakc 50-55
        maycTokenIds: Array.from(Array(50).keys()).slice(30), //mayc 30-50
        bakcPairMaycTokenIds: Array.from(Array(75).keys()).slice(55), //bakc 55-75
      },
    ]);

    const tx5 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPairPool",
      [
        true,
        Array.from(Array(100).keys()).slice(75), //bayc 75-100
        Array.from(Array(100).keys()).slice(75), //bakc 75-100
      ]
    );

    const tx6 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPairPool",
      [
        false,
        Array.from(Array(100).keys()).slice(75), //mayc 75-100
        Array.from(Array(125).keys()).slice(100), //bakc 100-125
      ]
    );

    const tx7 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPool",
      [
        true,
        Array.from(Array(75).keys()).slice(50), //bayc 50-75
      ]
    );

    const tx8 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPool",
      [
        false,
        Array.from(Array(75).keys()).slice(50), //mayc 50-75
      ]
    );

    const receipt = await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .multicall([tx0, tx1, tx2, tx3, tx4, tx5, tx6, tx7, tx8])
    );
    console.log("gas: ", receipt.gasUsed);
  });

  it("second compound", async () => {
    const {
      users: [, , , user4],
    } = testEnv;

    await advanceTimeAndBlock(parseInt("4000"));

    const tx0 = paraApeStaking.interface.encodeFunctionData("compoundPairNFT", [
      true,
      Array.from(Array(25).keys()), //bayc 0-25,
      Array.from(Array(25).keys()), //bakc 0-25
    ]);

    const tx1 = paraApeStaking.interface.encodeFunctionData("compoundPairNFT", [
      false,
      Array.from(Array(25).keys()), //mayc 0-25
      Array.from(Array(50).keys()).slice(25), //bakc 25-50
    ]);

    const tx2 = paraApeStaking.interface.encodeFunctionData("compoundApe", [
      true,
      Array.from(Array(50).keys()).slice(25), //bayc 25-50
    ]);
    const tx3 = paraApeStaking.interface.encodeFunctionData("compoundApe", [
      false,
      Array.from(Array(50).keys()).slice(25), //mayc 25-50
    ]);
    const tx4 = paraApeStaking.interface.encodeFunctionData("compoundBAKC", [
      {
        baycTokenIds: Array.from(Array(50).keys()).slice(25, 30), //bayc 25-30
        bakcPairBaycTokenIds: Array.from(Array(75).keys()).slice(50, 55), //bakc 50-55
        maycTokenIds: Array.from(Array(50).keys()).slice(30), //mayc 30-50
        bakcPairMaycTokenIds: Array.from(Array(75).keys()).slice(55), //bakc 55-75
      },
    ]);

    const tx5 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPairPool",
      [
        true,
        Array.from(Array(100).keys()).slice(75), //bayc 75-100
        Array.from(Array(100).keys()).slice(75), //bakc 75-100
      ]
    );

    const tx6 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPairPool",
      [
        false,
        Array.from(Array(100).keys()).slice(75), //mayc 75-100
        Array.from(Array(125).keys()).slice(100), //bakc 100-125
      ]
    );

    const tx7 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPool",
      [
        true,
        Array.from(Array(75).keys()).slice(50), //bayc 50-75
      ]
    );

    const tx8 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPool",
      [
        false,
        Array.from(Array(75).keys()).slice(50), //mayc 50-75
      ]
    );

    const receipt = await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .multicall([tx0, tx1, tx2, tx3, tx4, tx5, tx6, tx7, tx8])
    );
    console.log("gas: ", receipt.gasUsed);
  });

  it(" second deposit", async () => {
    const {
      users: [user1],
      bayc,
      mayc,
      bakc,
    } = testEnv;
    const tx0 = paraApeStaking.interface.encodeFunctionData("depositPairNFT", [
      user1.address,
      true,
      [100, 101],
      [125, 126],
    ]);
    const tx1 = paraApeStaking.interface.encodeFunctionData("depositPairNFT", [
      user1.address,
      false,
      [100, 101],
      [127, 128],
    ]);
    const tx2 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      bayc.address,
      [102, 103],
    ]);
    const tx3 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      mayc.address,
      [102, 103],
    ]);
    const tx4 = paraApeStaking.interface.encodeFunctionData("depositNFT", [
      user1.address,
      bakc.address,
      [129, 130, 131, 132],
    ]);

    await waitForTx(
      await paraApeStaking
        .connect(user1.signer)
        .multicall([tx0, tx1, tx2, tx3, tx4])
    );
  });

  it("third compound with staking", async () => {
    const {
      users: [, , , user4],
    } = testEnv;

    await advanceTimeAndBlock(parseInt("4000"));

    const tx0 = paraApeStaking.interface.encodeFunctionData("compoundPairNFT", [
      true,
      Array.from(Array(25).keys()), //bayc 0-25,
      Array.from(Array(25).keys()), //bakc 0-25
    ]);

    const tx1 = paraApeStaking.interface.encodeFunctionData("compoundPairNFT", [
      false,
      Array.from(Array(25).keys()), //mayc 0-25
      Array.from(Array(50).keys()).slice(25), //bakc 25-50
    ]);

    const tx2 = paraApeStaking.interface.encodeFunctionData("compoundApe", [
      true,
      Array.from(Array(50).keys()).slice(25), //bayc 25-50
    ]);
    const tx3 = paraApeStaking.interface.encodeFunctionData("compoundApe", [
      false,
      Array.from(Array(50).keys()).slice(25), //mayc 25-50
    ]);
    const tx4 = paraApeStaking.interface.encodeFunctionData("compoundBAKC", [
      {
        baycTokenIds: Array.from(Array(50).keys()).slice(25, 30), //bayc 25-30
        bakcPairBaycTokenIds: Array.from(Array(75).keys()).slice(50, 55), //bakc 50-55
        maycTokenIds: Array.from(Array(50).keys()).slice(30), //mayc 30-50
        bakcPairMaycTokenIds: Array.from(Array(75).keys()).slice(55), //bakc 55-75
      },
    ]);

    const tx5 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPairPool",
      [
        true,
        Array.from(Array(100).keys()).slice(75), //bayc 75-100
        Array.from(Array(100).keys()).slice(75), //bakc 75-100
      ]
    );

    const tx6 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPairPool",
      [
        false,
        Array.from(Array(100).keys()).slice(75), //mayc 75-100
        Array.from(Array(125).keys()).slice(100), //bakc 100-125
      ]
    );

    const tx7 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPool",
      [
        true,
        Array.from(Array(75).keys()).slice(50), //bayc 50-75
      ]
    );

    const tx8 = paraApeStaking.interface.encodeFunctionData(
      "compoundApeCoinPool",
      [
        false,
        Array.from(Array(75).keys()).slice(50), //mayc 50-75
      ]
    );

    const tx9 = paraApeStaking.interface.encodeFunctionData("stakingPairNFT", [
      true,
      [100, 101],
      [125, 126],
    ]);
    const tx10 = paraApeStaking.interface.encodeFunctionData("stakingPairNFT", [
      false,
      [100, 101],
      [127, 128],
    ]);
    const tx11 = paraApeStaking.interface.encodeFunctionData("stakingApe", [
      true,
      [102, 103],
    ]);
    const tx12 = paraApeStaking.interface.encodeFunctionData("stakingApe", [
      false,
      [102, 103],
    ]);
    const tx13 = paraApeStaking.interface.encodeFunctionData("stakingBAKC", [
      {
        baycTokenIds: [102, 103], //bayc 25-30
        bakcPairBaycTokenIds: [129, 130], //bakc 50-55
        maycTokenIds: [102, 103], //mayc 30-50
        bakcPairMaycTokenIds: [131, 132], //bakc 55-75
      },
    ]);

    const receipt = await waitForTx(
      await paraApeStaking
        .connect(user4.signer)
        .multicall([
          tx0,
          tx1,
          tx2,
          tx3,
          tx4,
          tx5,
          tx6,
          tx7,
          tx8,
          tx9,
          tx10,
          tx11,
          tx12,
          tx13,
        ])
    );
    console.log("gas: ", receipt.gasUsed);
  });
});
