import {expect} from "chai";
import {fund, approveTo} from "./helpers/uniswapv3-helper";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {parseEther} from "ethers/lib/utils";
import {
  borrowAndValidate,
  changePriceAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {getUniswapV2Pair} from "../helpers/contracts-getters";
import {BigNumber, BigNumberish} from "ethers";
import {waitForTx} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT} from "../helpers/constants";

function almostEqual(value0: BigNumberish, value1: BigNumberish) {
  const maxDiff = BigNumber.from(value0.toString()).mul(3).div("1000").abs();
  const abs = BigNumber.from(value0.toString()).sub(value1.toString()).abs();
  if (!abs.lte(maxDiff)) {
    console.log("---------value0=" + value0 + ", --------value1=" + value1);
  }
  expect(abs.lte(maxDiff)).to.be.equal(true);
}

describe("UniswapV2 Lending Test", () => {
  it("lp token can be supplied to borrow other asset", async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, supplier, liquidator],
      dai,
      weth,
      uniswapv2Factory,
      uniswapv2Router,
      pool,
    } = testEnv;

    await supplyAndValidate(dai, "10000000", supplier, true);

    const userDaiAmount = parseEther("1000");
    const userWethAmount = parseEther("1");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: uniswapv2Router.address,
      token: weth,
      user: user1,
    });

    const weth_dai_address = await uniswapv2Factory.getPair(
      weth.address,
      dai.address
    );
    await uniswapv2Router
      .connect(user1.signer)
      .addLiquidity(
        weth.address,
        dai.address,
        userWethAmount,
        userDaiAmount,
        0,
        0,
        user1.address,
        2659537628
      );
    const weth_dai = await getUniswapV2Pair(weth_dai_address);
    const lp_balance = await weth_dai.balanceOf(user1.address);
    await waitForTx(
      await weth_dai
        .connect(user1.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(weth_dai_address, lp_balance, user1.address, 0)
    );

    await changePriceAndValidate(dai, "0.001");
    let userData = await pool.getUserAccountData(user1.address);
    almostEqual(userData.totalCollateralBase, parseEther("2"));
    almostEqual(userData.availableBorrowsBase, parseEther("1.4"));
    almostEqual(userData.totalDebtBase, 0);

    await borrowAndValidate(dai, "1300", user1);
    userData = await pool.getUserAccountData(user1.address);
    almostEqual(userData.totalCollateralBase, parseEther("2"));
    almostEqual(userData.availableBorrowsBase, parseEther("0.1"));
    almostEqual(userData.totalDebtBase, parseEther("1.3"));

    await changePriceAndValidate(dai, "0.01");
    userData = await pool.getUserAccountData(user1.address);
    almostEqual(userData.availableBorrowsBase, 0);
    almostEqual(userData.totalDebtBase, parseEther("13"));
    expect(userData.healthFactor).to.be.lt(parseEther("1"));

    //liquidation
    await fund({token: dai, user: liquidator, amount: parseEther("1300")});
    await approveTo({
      target: pool.address,
      token: dai,
      user: liquidator,
    });
    await pool
      .connect(liquidator.signer)
      .liquidateERC20(
        weth_dai_address,
        dai.address,
        user1.address,
        parseEther("1300"),
        false
      );
    expect(await weth_dai.balanceOf(liquidator.address)).to.be.eq(lp_balance);
  });

  it("lp token can be borrowed", async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, supplier, liquidator],
      dai,
      weth,
      uniswapv2Factory,
      uniswapv2Router,
      pool,
    } = testEnv;

    const userDaiAmount = parseEther("10000");
    const userWethAmount = parseEther("10");
    await fund({token: dai, user: supplier, amount: userDaiAmount});
    await fund({token: weth, user: supplier, amount: userWethAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: dai,
      user: supplier,
    });
    await approveTo({
      target: uniswapv2Router.address,
      token: weth,
      user: supplier,
    });

    const weth_dai_address = await uniswapv2Factory.getPair(
      weth.address,
      dai.address
    );
    await uniswapv2Router
      .connect(supplier.signer)
      .addLiquidity(
        weth.address,
        dai.address,
        userWethAmount,
        userDaiAmount,
        0,
        0,
        supplier.address,
        2659537628
      );
    const weth_dai = await getUniswapV2Pair(weth_dai_address);
    const lp_balance = await weth_dai.balanceOf(supplier.address);
    await waitForTx(
      await weth_dai
        .connect(supplier.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(supplier.signer)
        .supply(weth_dai_address, lp_balance, supplier.address, 0)
    );

    await supplyAndValidate(dai, "3000", user1, true);
    await changePriceAndValidate(dai, "0.001");
    let userData = await pool.getUserAccountData(user1.address);
    almostEqual(userData.totalCollateralBase, parseEther("3"));
    almostEqual(userData.availableBorrowsBase, parseEther("2.31"));
    almostEqual(userData.totalDebtBase, 0);

    //borrow 1/10 of the lp, value 2ETH
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth_dai_address, lp_balance.div(10), 0, user1.address)
    );
    userData = await pool.getUserAccountData(user1.address);
    almostEqual(userData.totalCollateralBase, parseEther("3"));
    almostEqual(userData.availableBorrowsBase, parseEther("0.31"));
    almostEqual(userData.totalDebtBase, parseEther("2"));

    await changePriceAndValidate(dai, "0.0001");
    userData = await pool.getUserAccountData(user1.address);
    almostEqual(userData.availableBorrowsBase, 0);
    expect(userData.healthFactor).to.be.lt(parseEther("1"));

    //liquidation
    await fund({token: dai, user: liquidator, amount: userDaiAmount});
    await fund({token: weth, user: liquidator, amount: userWethAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: dai,
      user: liquidator,
    });
    await approveTo({
      target: uniswapv2Router.address,
      token: weth,
      user: liquidator,
    });
    await uniswapv2Router
      .connect(liquidator.signer)
      .addLiquidity(
        weth.address,
        dai.address,
        userWethAmount,
        userDaiAmount,
        0,
        0,
        liquidator.address,
        2659537628
      );
    await waitForTx(
      await weth_dai
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );
    await pool
      .connect(liquidator.signer)
      .liquidateERC20(
        dai.address,
        weth_dai_address,
        user1.address,
        lp_balance.div(10),
        false
      );
  });
});
