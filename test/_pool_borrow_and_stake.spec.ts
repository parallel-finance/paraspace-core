import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {getAutoCompoundApe, getPToken} from "../helpers/contracts-getters";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {PToken, AutoCompoundApe} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {
  changePriceAndValidate,
  changeSApePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";

describe("APE Coin Staking Test", () => {
  let testEnv: TestEnv;
  let cApe: AutoCompoundApe;
  let pcApeCoin: PToken;
  const sApeAddress = ONE_ADDRESS;
  const InitialNTokenApeBalance = parseEther("100");

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      mayc,
      bayc,
      users,
      bakc,
      protocolDataProvider,
      pool,
      apeCoinStaking,
      nMAYC,
      nBAYC,
    } = testEnv;
    const user1 = users[0];
    const user4 = users[5];

    cApe = await getAutoCompoundApe();
    const {xTokenAddress: pcApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(cApe.address);
    pcApeCoin = await getPToken(pcApeCoinAddress);

    await changePriceAndValidate(ape, "0.001");
    await changePriceAndValidate(cApe, "0.001");
    await changeSApePriceAndValidate(sApeAddress, "0.001");

    await changePriceAndValidate(mayc, "50");
    await changePriceAndValidate(bayc, "50");

    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await bakc.connect(user1.signer).setApprovalForAll(pool.address, true)
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

    // send extra tokens to the nToken contract for testing ape balance check
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](nMAYC.address, InitialNTokenApeBalance)
    );
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](nBAYC.address, InitialNTokenApeBalance)
    );

    await mintAndValidate(ape, "1", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    // user4 deposit MINIMUM_LIQUIDITY to make test case easy
    const MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();
    await waitForTx(
      await cApe.connect(user4.signer).deposit(user4.address, MINIMUM_LIQUIDITY)
    );

    //prepare user1 asset
    // await supplyAndValidate(bakc, "10", user1, true);
    await mintAndValidate(ape, "2000000", user1);
    await waitForTx(
      await ape.connect(user1.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user1.signer)
        .deposit(user1.address, parseEther("2000000"))
    );
    await waitForTx(
      await cApe.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(cApe.address, parseEther("2000000"), user1.address, 0)
    );

    return testEnv;
  };

  it("only borrow with 1 tokenId", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(fixture);

    await advanceTimeAndBlock(4000);

    await supplyAndValidate(bayc, "1", user1, true);
    const amount = parseEther("7000");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: amount,
          cashAsset: pcApeCoin.address,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: amount}],
        []
      )
    );
  });

  it("only borrow with 5 tokenId", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(fixture);

    await advanceTimeAndBlock(4000);

    await supplyAndValidate(bayc, "5", user1, true);
    const amount = parseEther("7000");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: amount.mul(5),
          cashAsset: pcApeCoin.address,
          cashAmount: 0,
        },
        [
          {tokenId: 0, amount: amount},
          {tokenId: 1, amount: amount},
          {tokenId: 2, amount: amount},
          {tokenId: 3, amount: amount},
          {tokenId: 4, amount: amount},
        ],
        []
      )
    );
  });

  it("only borrow with 10 tokenId", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(fixture);

    await advanceTimeAndBlock(4000);

    await supplyAndValidate(bayc, "10", user1, true);
    const amount = parseEther("7000");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: amount.mul(10),
          cashAsset: pcApeCoin.address,
          cashAmount: 0,
        },
        [
          {tokenId: 0, amount: amount},
          {tokenId: 1, amount: amount},
          {tokenId: 2, amount: amount},
          {tokenId: 3, amount: amount},
          {tokenId: 4, amount: amount},
          {tokenId: 5, amount: amount},
          {tokenId: 6, amount: amount},
          {tokenId: 7, amount: amount},
          {tokenId: 8, amount: amount},
          {tokenId: 9, amount: amount},
        ],
        []
      )
    );
  });

  it("only use pcApe cash with 1 tokenId", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(fixture);

    await advanceTimeAndBlock(4000);

    await supplyAndValidate(bayc, "1", user1, true);
    const amount = parseEther("7000");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: 0,
          cashAsset: pcApeCoin.address,
          cashAmount: amount,
        },
        [{tokenId: 0, amount: amount}],
        []
      )
    );
  });

  it("only use pcApe cash with 5 tokenId", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(fixture);

    await advanceTimeAndBlock(4000);

    await supplyAndValidate(bayc, "5", user1, true);
    const amount = parseEther("7000");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: 0,
          cashAsset: pcApeCoin.address,
          cashAmount: amount.mul(5),
        },
        [
          {tokenId: 0, amount: amount},
          {tokenId: 1, amount: amount},
          {tokenId: 2, amount: amount},
          {tokenId: 3, amount: amount},
          {tokenId: 4, amount: amount},
        ],
        []
      )
    );
  });

  it("only use pcApe cash with 10 tokenId", async () => {
    const {
      users: [user1],
      bayc,
      pool,
    } = await loadFixture(fixture);

    await advanceTimeAndBlock(4000);

    await supplyAndValidate(bayc, "10", user1, true);
    const amount = parseEther("7000");
    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: 0,
          cashAsset: pcApeCoin.address,
          cashAmount: amount.mul(10),
        },
        [
          {tokenId: 0, amount: amount},
          {tokenId: 1, amount: amount},
          {tokenId: 2, amount: amount},
          {tokenId: 3, amount: amount},
          {tokenId: 4, amount: amount},
          {tokenId: 5, amount: amount},
          {tokenId: 6, amount: amount},
          {tokenId: 7, amount: amount},
          {tokenId: 8, amount: amount},
          {tokenId: 9, amount: amount},
        ],
        []
      )
    );
  });
});
