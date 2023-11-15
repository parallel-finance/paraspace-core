import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {
  getApeCoinStakingVoting,
  getAutoCompoundApe,
  getPToken,
  getPTokenSApe,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {waitForTx} from "../helpers/misc-utils";
import {VariableDebtToken, PTokenSApe, PToken, AutoCompoundApe} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {
  changePriceAndValidate,
  changeSApePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";
import {deployApeCoinStakingVoting} from "../helpers/contracts-deployments";
import {BigNumberish} from "ethers";

describe("APE Coin Staking Test", () => {
  let testEnv: TestEnv;
  let cApe: AutoCompoundApe;
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
      pool,
      apeCoinStaking,
      nMAYC,
      nBAYC,
      nBAKC,
    } = testEnv;
    const user1 = users[0];
    const depositor = users[1];
    const user4 = users[5];

    cApe = await getAutoCompoundApe();

    await supplyAndValidate(ape, "20000", depositor, true);
    await changePriceAndValidate(ape, "0.001");
    await changePriceAndValidate(cApe, "0.001");
    await changeSApePriceAndValidate(sApeAddress, "0.001");

    await changePriceAndValidate(mayc, "50");
    await changePriceAndValidate(bayc, "50");

    await waitForTx(await bakc["mint(uint256,address)"]("2", user1.address));

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

    await deployApeCoinStakingVoting(
      cApe.address,
      apeCoinStaking.address,
      nBAYC.address,
      nMAYC.address,
      nBAKC.address
    );

    return testEnv;
  };

  it("test with cape position", async () => {
    const {
      users: [user1],
      ape,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "15000", user1);
    await waitForTx(
      await ape.connect(user1.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user1.signer)
        .deposit(user1.address, parseEther("15000"))
    );

    const voting = await getApeCoinStakingVoting();
    expect(parseEther("15000")).equal(await voting.getVotes(user1.address));
    expect(parseEther("15000")).equal(await voting.getCApeVotes(user1.address));
    expect(0).equal(await voting.getVotesInAllNftPool(user1.address));
  });

  it("test with bayc and bakc position0", async () => {
    const {
      users: [user1],
      ape,
      bayc,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "15000", user1);

    const amount1 = await convertToCurrencyDecimals(ape.address, "7000");
    const amount2 = await convertToCurrencyDecimals(ape.address, "8000");
    const amount = await convertToCurrencyDecimals(ape.address, "15000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: amount,
        },
        [{tokenId: 0, amount: amount1}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount2}]
      )
    );

    const voting = await getApeCoinStakingVoting();
    expect(amount1).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount1).equal(await voting.getVotesInAllNftPool(user1.address));

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bakc.address,
        [
          {
            tokenId: 0,
            useAsCollateral: false,
          },
        ],
        user1.address,
        0
      )
    );
    expect(amount).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount).equal(await voting.getVotesInAllNftPool(user1.address));
  });

  it("test with bayc and bakc position1", async () => {
    const {
      users: [user1],
      ape,
      bayc,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await mintAndValidate(ape, "7000", user1);

    const amount1 = await convertToCurrencyDecimals(ape.address, "7000");
    // 50 * 0.3250 + 7000 * 0.001 * 0.2 = 17.65
    // 17.65 / 0.001 = 17650
    const amount2 = await convertToCurrencyDecimals(ape.address, "8000");
    const amount = await convertToCurrencyDecimals(ape.address, "15000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount2,
          cashAmount: amount1,
        },
        [{tokenId: 0, amount: amount1}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount2}]
      )
    );

    const voting = await getApeCoinStakingVoting();
    expect(amount1).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount1).equal(await voting.getVotesInAllNftPool(user1.address));

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bakc.address,
        [
          {
            tokenId: 0,
            useAsCollateral: false,
          },
        ],
        user1.address,
        0
      )
    );
    expect(amount).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount).equal(await voting.getVotesInAllNftPool(user1.address));
  });

  it("test with mayc and bakc position0", async () => {
    const {
      users: [user1],
      ape,
      mayc,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "15000", user1);

    const amount1 = await convertToCurrencyDecimals(ape.address, "7000");
    const amount2 = await convertToCurrencyDecimals(ape.address, "8000");
    const amount = await convertToCurrencyDecimals(ape.address, "15000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAmount: amount,
        },
        [{tokenId: 0, amount: amount1}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount2}]
      )
    );

    const voting = await getApeCoinStakingVoting();
    expect(amount1).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount1).equal(await voting.getVotesInAllNftPool(user1.address));

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bakc.address,
        [
          {
            tokenId: 0,
            useAsCollateral: false,
          },
        ],
        user1.address,
        0
      )
    );
    expect(amount).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount).equal(await voting.getVotesInAllNftPool(user1.address));
  });

  it("test with mayc and bakc position1", async () => {
    const {
      users: [user1],
      ape,
      mayc,
      bakc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "7000", user1);

    const amount1 = await convertToCurrencyDecimals(ape.address, "7000");
    // 50 * 0.3250 + 7000 * 0.001 * 0.2 = 17.65
    // 17.65 / 0.001 = 17650
    const amount2 = await convertToCurrencyDecimals(ape.address, "8000");
    const amount = await convertToCurrencyDecimals(ape.address, "15000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount2,
          cashAmount: amount1,
        },
        [{tokenId: 0, amount: amount1}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: amount2}]
      )
    );

    const voting = await getApeCoinStakingVoting();
    expect(amount1).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount1).equal(await voting.getVotesInAllNftPool(user1.address));

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        bakc.address,
        [
          {
            tokenId: 0,
            useAsCollateral: false,
          },
        ],
        user1.address,
        0
      )
    );
    expect(amount).equal(await voting.getVotes(user1.address));
    expect(0).equal(await voting.getCApeVotes(user1.address));
    expect(amount).equal(await voting.getVotesInAllNftPool(user1.address));
  });
});
