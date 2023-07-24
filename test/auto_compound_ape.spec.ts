import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoCompoundApe} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate} from "./helpers/validated-steps";
import {parseEther, solidityKeccak256} from "ethers/lib/utils";
import {
  almostEqual,
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "./helpers/uniswapv3-helper";
import {getAutoCompoundApe} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {deployMockedDelegateRegistry} from "../helpers/contracts-deployments";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {ProtocolErrors} from "../helpers/types";

describe("Auto Compound Ape Test", () => {
  let testEnv: TestEnv;
  let cApe: AutoCompoundApe;
  let user1Amount;
  let user2Amount;
  let user3Amount;
  let MINIMUM_LIQUIDITY;

  const {CALLER_NOT_POOL_ADMIN} = ProtocolErrors;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      usdc,
      weth,
      users: [user1, user2, , , user3, user4, user5],
      apeCoinStaking,
      pool,
      poolAdmin,
      nftPositionManager,
    } = testEnv;

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    await mintAndValidate(ape, "1000", user1);
    await mintAndValidate(ape, "2000", user2);
    await mintAndValidate(ape, "4000", user3);
    await mintAndValidate(ape, "1", user4);

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
      await ape.connect(user1.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user2.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user3.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool.connect(poolAdmin.signer).setClaimApeForCompoundFee(30)
    );

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .setClaimApeForCompoundBot(user2.address)
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

    // user4 deposit MINIMUM_LIQUIDITY to make test case easy
    await waitForTx(
      await cApe.connect(user4.signer).deposit(user4.address, MINIMUM_LIQUIDITY)
    );

    ////////////////////////////////////////////////////////////////////////////////
    // Uniswap APE/WETH/USDC
    ////////////////////////////////////////////////////////////////////////////////
    const userApeAmount = await convertToCurrencyDecimals(
      ape.address,
      "200000"
    );
    const userUsdcAmount = await convertToCurrencyDecimals(
      usdc.address,
      "800000"
    );
    const userWethAmount = await convertToCurrencyDecimals(
      weth.address,
      "732.76177"
    );
    await fund({token: ape, user: user5, amount: userApeAmount});
    await fund({token: weth, user: user5, amount: userWethAmount.mul(2)});
    await fund({token: usdc, user: user5, amount: userUsdcAmount});
    const nft = nftPositionManager.connect(user5.signer);
    await approveTo({
      target: nftPositionManager.address,
      token: ape,
      user: user5,
    });
    await approveTo({
      target: nftPositionManager.address,
      token: usdc,
      user: user5,
    });
    await approveTo({
      target: nftPositionManager.address,
      token: weth,
      user: user5,
    });
    const apeWethFee = 3000;
    const usdcWethFee = 500;
    const apeWethTickSpacing = apeWethFee / 50;
    const usdcWethTickSpacing = usdcWethFee / 50;
    const apeWethInitialPrice = encodeSqrtRatioX96(1091760000, 4000000);
    const apeWethLowerPrice = encodeSqrtRatioX96(109176000, 4000000);
    const apeWethUpperPrice = encodeSqrtRatioX96(10917600000, 4000000);
    const usdcWethInitialPrice = encodeSqrtRatioX96(
      1000000000000000000,
      1091760000
    );
    const usdcWethLowerPrice = encodeSqrtRatioX96(
      100000000000000000,
      1091760000
    );
    const usdcWethUpperPrice = encodeSqrtRatioX96(
      10000000000000000000,
      1091760000
    );
    await createNewPool({
      positionManager: nft,
      token0: weth,
      token1: ape,
      fee: apeWethFee,
      initialSqrtPrice: apeWethInitialPrice.toString(),
    });
    await createNewPool({
      positionManager: nft,
      token0: usdc,
      token1: weth,
      fee: usdcWethFee,
      initialSqrtPrice: usdcWethInitialPrice.toString(),
    });
    await mintNewPosition({
      nft: nft,
      token0: weth,
      token1: ape,
      fee: apeWethFee,
      user: user5,
      tickSpacing: apeWethTickSpacing,
      lowerPrice: apeWethLowerPrice,
      upperPrice: apeWethUpperPrice,
      token0Amount: userWethAmount,
      token1Amount: userApeAmount,
    });
    await mintNewPosition({
      nft: nft,
      token0: usdc,
      token1: weth,
      fee: usdcWethFee,
      user: user5,
      tickSpacing: usdcWethTickSpacing,
      lowerPrice: usdcWethLowerPrice,
      upperPrice: usdcWethUpperPrice,
      token0Amount: userUsdcAmount,
      token1Amount: userWethAmount,
    });

    return testEnv;
  };

  it("user1 receive reward as expected", async () => {
    const {
      users: [user1],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));
    let user1Share = await cApe.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await advanceTimeAndBlock(3600);
    user1Balance = await cApe.balanceOf(user1.address);
    // 1000 + 3600
    almostEqual(user1Balance, parseEther("4600"));

    user1Share = await cApe.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    user1Share = await cApe.sharesOf(user1.address);
    expect(user1Share.lte(1)).to.be.true;
    user1Balance = await cApe.balanceOf(user1.address);
    expect(user1Balance.lte(4)).to.be.true;

    const apeBalance = await ape.balanceOf(user1.address);
    almostEqual(apeBalance, parseEther("4600"));

    // pool is empty
    almostEqual(
      await cApe.totalSupply(),
      await cApe.getPooledApeByShares(MINIMUM_LIQUIDITY)
    );
  });

  it("user receive reward as deposit portion 1", async () => {
    const {
      users: [user1, user2, , , user3],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, user2Amount)
    );
    await waitForTx(
      await cApe.connect(user3.signer).deposit(user3.address, user3Amount)
    );

    await advanceTimeAndBlock(86400);

    const user1Balance = await cApe.balanceOf(user1.address);
    const user2Balance = await cApe.balanceOf(user2.address);
    const user3Balance = await cApe.balanceOf(user3.address);
    almostEqual(user2Balance, user1Balance.mul(2));
    almostEqual(user3Balance, user2Balance.mul(2));

    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    const user1ApeBalance = await ape.balanceOf(user1.address);
    almostEqual(user1ApeBalance, user1Balance);

    await waitForTx(await cApe.connect(user2.signer).withdraw(user2Balance));
    const user2ApeBalance = await ape.balanceOf(user2.address);
    almostEqual(user2ApeBalance, user2Balance);

    await waitForTx(await cApe.connect(user3.signer).withdraw(user3Balance));
    const user3ApeBalance = await ape.balanceOf(user3.address);
    almostEqual(user3ApeBalance, user3Balance);

    // ApeCoinStaking reward 1 ape/s. so user1 balance = 4000 + 86400 * 4 / 7 = 53371
    almostEqual(user3Balance, parseEther("53371"));

    // pool is empty
    almostEqual(
      await cApe.totalSupply(),
      await cApe.getPooledApeByShares(MINIMUM_LIQUIDITY)
    );
  });

  it("user receive reward as deposit portion 2", async () => {
    const {
      users: [user1, user2],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await advanceTimeAndBlock(3600);
    const user1Share = await cApe.sharesOf(user1.address);
    let user1Balance = await cApe.balanceOf(user1.address);
    //1000 + 3600 = 4600
    almostEqual(user1Balance, parseEther("4600"));

    //user2 balance is 4600 now
    await mintAndValidate(ape, "2600", user2);
    await waitForTx(
      await cApe.connect(user2.signer).deposit(user2.address, user1Balance)
    );
    const user2Share = await cApe.sharesOf(user2.address);
    almostEqual(user1Share, user2Share);

    await advanceTimeAndBlock(3600);
    user1Balance = await cApe.balanceOf(user1.address);
    //1000 + 3600 + 1800
    almostEqual(user1Balance, parseEther("6400"));

    const user2Balance = await cApe.balanceOf(user2.address);
    await waitForTx(await cApe.connect(user2.signer).withdraw(user2Balance));
    almostEqual(await ape.balanceOf(user2.address), user1Balance);

    await advanceTimeAndBlock(3600);
    user1Balance = await cApe.balanceOf(user1.address);
    //1000 + 3600 + 1800 + 3600
    almostEqual(user1Balance, parseEther("10000"));
    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    almostEqual(await ape.balanceOf(user1.address), user1Balance);

    // pool is empty
    almostEqual(
      await cApe.totalSupply(),
      await cApe.getPooledApeByShares(MINIMUM_LIQUIDITY)
    );
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
      await cApe.connect(user2.signer).deposit(user2.address, user2Amount)
    );

    await advanceTimeAndBlock(3600);

    let user2Balance = await cApe.balanceOf(user2.address);
    //2000 + 1800 = 3800
    almostEqual(user2Balance, parseEther("3800"));

    await waitForTx(await cApe.connect(user2.signer).harvestAndCompound());

    await advanceTimeAndBlock(3600);
    user2Balance = await cApe.balanceOf(user2.address);
    //3800 + 3600 * 3800 / (3800 + 2000) = 6158.6
    almostEqual(user2Balance, parseEther("6158.6"));

    await waitForTx(await cApe.connect(user2.signer).harvestAndCompound());

    await advanceTimeAndBlock(3600);
    user2Balance = await cApe.balanceOf(user2.address);
    //6158.6 + 3600 * 6158.6 / (6158.6 + 2000) = 8876
    almostEqual(user2Balance, parseEther("8876"));

    //use2 exit pool
    await waitForTx(await cApe.connect(user2.signer).withdraw(user2Balance));
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

  it("bufferBalance work as expected", async () => {
    const {
      users: [user1, user2],
      ape,
    } = await loadFixture(fixture);

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, user1Amount)
    );
    await waitForTx(
      await ape.connect(user2.signer).transfer(cApe.address, user2Amount)
    );
    let user1Balance = await cApe.balanceOf(user1.address);
    almostEqual(user1Balance, parseEther("1000"));
    let user1Share = await cApe.sharesOf(user1.address);
    almostEqual(user1Share, parseEther("1000"));

    await advanceTimeAndBlock(3600);

    user1Balance = await cApe.balanceOf(user1.address);
    await waitForTx(await cApe.connect(user1.signer).withdraw(user1Balance));
    user1Share = await cApe.sharesOf(user1.address);
    expect(user1Share.lte(1)).to.be.true;
    user1Balance = await cApe.balanceOf(user1.address);
    expect(user1Balance.lte(5)).to.be.true;

    almostEqual(await ape.balanceOf(user1.address), parseEther("4600"));
    almostEqual(await ape.balanceOf(cApe.address), user2Amount);
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
      await weth.connect(user2.signer).transfer(cApe.address, parseEther("1"))
    );

    await expect(
      cApe
        .connect(user2.signer)
        .rescueERC20(weth.address, user2.address, parseEther("1"))
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);

    await waitForTx(
      await ape.connect(user2.signer).transfer(cApe.address, parseEther("100"))
    );

    await waitForTx(
      await cApe.connect(user1.signer).deposit(user1.address, parseEther("50"))
    );

    almostEqual(await ape.balanceOf(cApe.address), parseEther("150"));

    await expect(
      cApe
        .connect(poolAdmin.signer)
        .rescueERC20(ape.address, user1.address, parseEther("150"))
    ).to.be.revertedWith("balance below backed balance");

    await waitForTx(
      await cApe
        .connect(poolAdmin.signer)
        .rescueERC20(ape.address, user2.address, parseEther("100"))
    );

    almostEqual(await ape.balanceOf(user2.address), user2Amount);
  });

  it("test vote delegation", async () => {
    const {
      users: [user1],
      poolAdmin,
    } = await loadFixture(fixture);

    const delegateRegistry = await deployMockedDelegateRegistry(
      ETHERSCAN_VERIFICATION
    );

    await cApe
      .connect(poolAdmin.signer)
      .setVotingDelegate(
        delegateRegistry.address,
        solidityKeccak256(["string"], ["test"]),
        user1.address
      );

    expect(
      await cApe.getDelegate(
        delegateRegistry.address,
        solidityKeccak256(["string"], ["test"])
      )
    ).to.be.eq(user1.address);
  });
});
