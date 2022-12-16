import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {ApeYield, PToken, VariableDebtToken} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {
  getApeYield,
  getPToken,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";

describe("APE Coin Staking Test", () => {
  let testEnv: TestEnv;
  let apeYield: ApeYield;
  let pPsApe: PToken;
  let variableDebtPsAPE: VariableDebtToken;
  let user1Amount;
  let user2Amount;
  let user3Amount;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, user2, user3],
      apeCoinStaking,
      pool,
      protocolDataProvider,
    } = testEnv;

    apeYield = await getApeYield();

    const {
      xTokenAddress: pPsApeAddress,
      variableDebtTokenAddress: variableDebtPsApeAddress,
    } = await protocolDataProvider.getReserveTokensAddresses(apeYield.address);
    pPsApe = await getPToken(pPsApeAddress);
    variableDebtPsAPE = await getVariableDebtToken(variableDebtPsApeAddress);
    console.log(variableDebtPsAPE.address);

    await mintAndValidate(ape, "1000", user1);
    await mintAndValidate(ape, "2000", user2);
    await mintAndValidate(ape, "4000", user3);

    user1Amount = parseEther("1000");
    user2Amount = parseEther("2000");
    user3Amount = parseEther("4000");

    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(apeCoinStaking.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await ape.connect(user1.signer).approve(apeYield.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user2.signer).approve(apeYield.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user3.signer).approve(apeYield.address, MAX_UINT_AMOUNT)
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

    await waitForTx(await apeCoinStaking.updatePool(0));

    return testEnv;
  };

  it("user1 receive reward as expected", async () => {
    const {
      users: [user1],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await apeYield.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    let user1Balance = await apeYield.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));
    let user1Share = await apeYield.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await advanceTimeAndBlock(600);

    user1Balance = await apeYield.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));

    await advanceTimeAndBlock(3000);
    user1Balance = await apeYield.balanceOf(user1.address);
    // 1000 + 3600
    almostEqual(user1Balance, parseEther("4600"));

    user1Share = await apeYield.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await waitForTx(
      await apeYield.connect(user1.signer).withdraw(user1Balance)
    );
    user1Share = await apeYield.sharesOf(user1.address);
    expect(user1Share).to.be.equal(0);
    user1Balance = await apeYield.balanceOf(user1.address);
    expect(user1Balance).to.be.equal(0);

    const apeBalance = await ape.balanceOf(user1.address);
    almostEqual(apeBalance, parseEther("4600"));

    // pool is empty
    expect(await apeYield.totalSupply()).to.be.equal(0);
    expect(await apeYield.getTotalPooledApeBalance()).to.be.equal(0);
  });

  it("user receive reward as deposit portion 1", async () => {
    const {
      users: [user1, user2, user3],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await apeYield.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await waitForTx(
      await apeYield.connect(user2.signer).deposit(user2.address, user2Amount)
    );
    await waitForTx(
      await apeYield.connect(user3.signer).deposit(user3.address, user3Amount)
    );

    await advanceTimeAndBlock(86400);

    const user1Balance = await apeYield.balanceOf(user1.address);
    const user2Balance = await apeYield.balanceOf(user2.address);
    const user3Balance = await apeYield.balanceOf(user3.address);
    almostEqual(user2Balance, user1Balance.mul(2));
    almostEqual(user3Balance, user2Balance.mul(2));

    await waitForTx(
      await apeYield.connect(user1.signer).withdraw(user1Balance)
    );
    const user1ApeBalance = await ape.balanceOf(user1.address);
    almostEqual(user1ApeBalance, user1Balance);

    await waitForTx(
      await apeYield.connect(user2.signer).withdraw(user2Balance)
    );
    const user2ApeBalance = await ape.balanceOf(user2.address);
    almostEqual(user2ApeBalance, user2Balance);

    await waitForTx(
      await apeYield.connect(user3.signer).withdraw(user3Balance)
    );
    const user3ApeBalance = await ape.balanceOf(user3.address);
    almostEqual(user3ApeBalance, user3Balance);

    // ApeCoinStaking reward 1 ape/s. so user1 balance = 4000 + 86400 * 4 / 7 = 53371
    almostEqual(user3Balance, parseEther("53371"));

    // pool is empty
    expect(await apeYield.totalSupply()).to.be.equal(0);
    expect(await apeYield.getTotalPooledApeBalance()).to.be.equal(0);
  });

  it("user receive reward as deposit portion 2", async () => {
    const {
      users: [user1, user2],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await apeYield.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await advanceTimeAndBlock(3600);
    const user1Share = await apeYield.sharesOf(user1.address);
    let user1Balance = await apeYield.balanceOf(user1.address);
    //1000 + 3600 = 4600
    almostEqual(user1Balance, parseEther("4600"));

    //user2 balance is 4600 now
    await mintAndValidate(ape, "2600", user2);
    await waitForTx(
      await apeYield.connect(user2.signer).deposit(user2.address, user1Balance)
    );
    const user2Share = await apeYield.sharesOf(user2.address);
    almostEqual(user1Share, user2Share);

    await advanceTimeAndBlock(3600);
    user1Balance = await apeYield.balanceOf(user1.address);
    //1000 + 3600 + 1800
    almostEqual(user1Balance, parseEther("6400"));

    const user2Balance = await apeYield.balanceOf(user2.address);
    await waitForTx(
      await apeYield.connect(user2.signer).withdraw(user2Balance)
    );
    almostEqual(await ape.balanceOf(user2.address), user1Balance);

    await advanceTimeAndBlock(3600);
    user1Balance = await apeYield.balanceOf(user1.address);
    //1000 + 3600 + 1800 + 3600
    almostEqual(user1Balance, parseEther("10000"));
    await waitForTx(
      await apeYield.connect(user1.signer).withdraw(user1Balance)
    );
    almostEqual(await ape.balanceOf(user1.address), user1Balance);

    // pool is empty
    expect(await apeYield.totalSupply()).to.be.equal(0);
    expect(await apeYield.getTotalPooledApeBalance()).to.be.equal(0);
  });

  it("compound function work as expected", async () => {
    const {
      users: [user1, user2],
      ape,
      apeCoinStaking,
    } = await loadFixture(fixture);

    //user1 balance is 2000 now
    await mintAndValidate(ape, "1000", user1);
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .depositApeCoin(user2Amount, user1.address)
    );

    await waitForTx(
      await apeYield.connect(user2.signer).deposit(user2.address, user2Amount)
    );

    await advanceTimeAndBlock(3600);

    let user2Balance = await apeYield.balanceOf(user2.address);
    //2000 + 1800 = 3800
    almostEqual(user2Balance, parseEther("3800"));

    await waitForTx(await apeYield.connect(user2.signer).harvestAndYield());

    await advanceTimeAndBlock(3600);
    user2Balance = await apeYield.balanceOf(user2.address);
    //3800 + 3600 * 3800 / (3800 + 2000) = 6158.6
    almostEqual(user2Balance, parseEther("6158.6"));

    await waitForTx(await apeYield.connect(user2.signer).harvestAndYield());

    await advanceTimeAndBlock(3600);
    user2Balance = await apeYield.balanceOf(user2.address);
    //6158.6 + 3600 * 6158.6 / (6158.6 + 2000) = 8876
    almostEqual(user2Balance, parseEther("8876"));

    //use2 exit pool
    await waitForTx(
      await apeYield.connect(user2.signer).withdraw(user2Balance)
    );
    const user2ApeBalance = await ape.balanceOf(user2.address);
    almostEqual(user2ApeBalance, parseEther("8876"));

    //user1 exit pool
    await waitForTx(
      await apeCoinStaking
        .connect(user1.signer)
        .withdrawApeCoin(user2Amount, user1.address)
    );
    const user1ApeBalance = await ape.balanceOf(user1.address);
    //2000 + 3600 * 2000 / 4000 + 3600 * 2000 / 5800 + 3600 * 2000 / 8158.6 = 5923.8
    almostEqual(user1ApeBalance, parseEther("5923.8"));
  });

  it("claimApeAndYield function work as expected", async () => {
    const {
      users: [user1, user2, user3],
      mayc,
      pool,
    } = await loadFixture(fixture);

    await waitForTx(
      await mayc.connect(user1.signer)["mint(address)"](user1.address)
    );
    await waitForTx(
      await mayc.connect(user2.signer)["mint(address)"](user2.address)
    );
    await waitForTx(
      await mayc.connect(user3.signer)["mint(address)"](user3.address)
    );
    await waitForTx(
      await mayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await mayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await mayc.connect(user3.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          mayc.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          "0"
        )
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supplyERC721(
          mayc.address,
          [{tokenId: 1, useAsCollateral: true}],
          user2.address,
          "0"
        )
    );
    await waitForTx(
      await pool
        .connect(user3.signer)
        .supplyERC721(
          mayc.address,
          [{tokenId: 2, useAsCollateral: true}],
          user3.address,
          "0"
        )
    );

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAmount: 0,
          cashAmount: user1Amount,
        },
        [{tokenId: 0, amount: user1Amount}],
        []
      )
    );

    await waitForTx(
      await pool.connect(user2.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAmount: 0,
          cashAmount: user2Amount,
        },
        [{tokenId: 1, amount: user2Amount}],
        []
      )
    );

    await waitForTx(
      await pool.connect(user3.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAmount: 0,
          cashAmount: user3Amount,
        },
        [{tokenId: 2, amount: user3Amount}],
        []
      )
    );

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool.connect(user2.signer).claimApeAndYield(mayc.address, [0, 1, 2])
    );

    // 3600 / 7 = 514.28
    const user1Balance = await pPsApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("514.28"));

    // 3600 * 2 / 7 = 1028.57
    const user2Balance = await pPsApe.balanceOf(user2.address);
    almostEqual(user2Balance, parseEther("1028.57"));

    // 3600 * 4 / 7 = 2057.14
    const user3Balance = await pPsApe.balanceOf(user3.address);
    almostEqual(user3Balance, parseEther("2057.14"));

    await advanceTimeAndBlock(3600);

    await waitForTx(
      await pool.connect(user2.signer).claimApeAndYield(mayc.address, [0, 1, 2])
    );
  });

  it("backedBalance work as expected", async () => {
    const {
      users: [user1, user2],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await apeYield.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await waitForTx(
      await ape.connect(user2.signer).transfer(apeYield.address, user2Amount)
    );
    let user1Balance = await apeYield.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));
    let user1Share = await apeYield.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await advanceTimeAndBlock(600);

    user1Balance = await apeYield.balanceOf(user1.address);
    await waitForTx(
      await apeYield.connect(user1.signer).withdraw(user1Balance)
    );
    user1Share = await apeYield.sharesOf(user1.address);
    expect(user1Share).to.be.equal(0);
    user1Balance = await apeYield.balanceOf(user1.address);
    expect(user1Balance).to.be.equal(0);

    almostEqual(await ape.balanceOf(user1.address), user1Amount);
    almostEqual(await ape.balanceOf(apeYield.address), user2Amount);
  });

  it("check rescueERC20", async () => {
    const {
      users: [user1, user2],
      ape,
      weth,
      poolAdmin,
    } = await loadFixture(fixture);

    await mintAndValidate(weth, "1", user2);

    await waitForTx(
      await weth
        .connect(user2.signer)
        .transfer(apeYield.address, parseEther("1"))
    );

    await expect(
      apeYield
        .connect(user2.signer)
        .rescueERC20(weth.address, user2.address, parseEther("1"))
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await waitForTx(
      await ape
        .connect(user2.signer)
        .transfer(apeYield.address, parseEther("100"))
    );

    await waitForTx(
      await apeYield
        .connect(user1.signer)
        .deposit(user1.address, parseEther("50"))
    );

    almostEqual(await ape.balanceOf(apeYield.address), parseEther("150"));

    await expect(
      apeYield
        .connect(poolAdmin.signer)
        .rescueERC20(ape.address, user1.address, parseEther("150"))
    ).to.be.revertedWith("balance below backed balance");

    await waitForTx(
      await apeYield
        .connect(poolAdmin.signer)
        .rescueERC20(ape.address, user2.address, parseEther("100"))
    );

    almostEqual(await ape.balanceOf(user2.address), user2Amount);
  });
});
