import {expect} from "chai";
import {fund, approveTo} from "./helpers/uniswapv3-helper";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {parseEther} from "ethers/lib/utils";
import {changePriceAndValidate} from "./helpers/validated-steps";
import {getERC20} from "../helpers/contracts-getters";
import {BigNumber, BigNumberish} from "ethers";

function almostEqual(value0: BigNumberish, value1: BigNumberish) {
  const maxDiff = BigNumber.from(value0.toString()).mul(3).div("1000").abs();
  const abs = BigNumber.from(value0.toString()).sub(value1.toString()).abs();
  if (!abs.lte(maxDiff)) {
    console.log("---------value0=" + value0 + ", --------value1=" + value1);
  }
  expect(abs.lte(maxDiff)).to.be.equal(true);
}

describe("UniswapV2 Oracle Wrapper Test", () => {
  it("test with dai and weth:(token0 decimal equals token1 decimal)", async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, swapper],
      dai,
      weth,
      uniswapv2Factory,
      uniswapv2Router,
      paraspaceOracle,
    } = testEnv;

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
    const weth_dai = await getERC20(weth_dai_address);

    await changePriceAndValidate(dai, "0.001");
    let lp_price = await paraspaceOracle.getAssetPrice(weth_dai_address);
    const total_supply = await weth_dai.totalSupply();
    const expectedPrice = parseEther("1")
      .mul(2)
      .mul(parseEther("1"))
      .div(total_supply);
    expect(lp_price).to.be.eq(expectedPrice);

    const swapAmount = parseEther("200");
    await fund({token: dai, user: swapper, amount: swapAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: dai,
      user: swapper,
    });
    await uniswapv2Router
      .connect(swapper.signer)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        [dai.address, weth.address],
        swapper.address,
        2659537628
      );
    lp_price = await paraspaceOracle.getAssetPrice(weth_dai_address);
    almostEqual(lp_price, expectedPrice);
  });

  it("test with usdc and weth:(token0 decimal less than token1 decimal)", async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, swapper],
      usdc,
      weth,
      uniswapv2Factory,
      uniswapv2Router,
      paraspaceOracle,
    } = testEnv;

    const userUsdcAmount = "1000000000";
    const userWethAmount = parseEther("1");
    await fund({token: usdc, user: user1, amount: userUsdcAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: usdc,
      user: user1,
    });
    await approveTo({
      target: uniswapv2Router.address,
      token: weth,
      user: user1,
    });

    const weth_usdc_address = await uniswapv2Factory.getPair(
      weth.address,
      usdc.address
    );
    await uniswapv2Router
      .connect(user1.signer)
      .addLiquidity(
        weth.address,
        usdc.address,
        userWethAmount,
        userUsdcAmount,
        0,
        0,
        user1.address,
        2659537628
      );
    const weth_usdc = await getERC20(weth_usdc_address);

    await changePriceAndValidate(usdc, "0.001");
    let lp_price = await paraspaceOracle.getAssetPrice(weth_usdc_address);
    const total_supply = await weth_usdc.totalSupply();
    const expectedPrice = parseEther("1")
      .mul(2)
      .mul(parseEther("1"))
      .div(total_supply);
    expect(lp_price).to.be.eq(expectedPrice);

    const swapAmount = "2000000000";
    await fund({token: usdc, user: swapper, amount: swapAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: usdc,
      user: swapper,
    });
    await uniswapv2Router
      .connect(swapper.signer)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        [usdc.address, weth.address],
        swapper.address,
        2659537628
      );
    lp_price = await paraspaceOracle.getAssetPrice(weth_usdc_address);
    almostEqual(lp_price, expectedPrice);
  });

  it("test with weth and usdt:(token0 decimal greater than token1 decimal)", async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, swapper],
      usdt,
      weth,
      uniswapv2Factory,
      uniswapv2Router,
      paraspaceOracle,
    } = testEnv;

    const userUsdtAmount = "1000000000";
    const userWethAmount = parseEther("1");
    await fund({token: usdt, user: user1, amount: userUsdtAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: usdt,
      user: user1,
    });
    await approveTo({
      target: uniswapv2Router.address,
      token: weth,
      user: user1,
    });

    const weth_usdt_address = await uniswapv2Factory.getPair(
      weth.address,
      usdt.address
    );
    await uniswapv2Router
      .connect(user1.signer)
      .addLiquidity(
        weth.address,
        usdt.address,
        userWethAmount,
        userUsdtAmount,
        0,
        0,
        user1.address,
        2659537628
      );
    const weth_usdt = await getERC20(weth_usdt_address);

    await changePriceAndValidate(usdt, "0.001");
    let lp_price = await paraspaceOracle.getAssetPrice(weth_usdt_address);
    const total_supply = await weth_usdt.totalSupply();
    const expectedPrice = parseEther("1")
      .mul(2)
      .mul(parseEther("1"))
      .div(total_supply);
    expect(lp_price).to.be.eq(expectedPrice);

    const swapAmount = "2000000000";
    await fund({token: usdt, user: swapper, amount: swapAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: usdt,
      user: swapper,
    });
    await uniswapv2Router
      .connect(swapper.signer)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        [usdt.address, weth.address],
        swapper.address,
        2659537628
      );
    lp_price = await paraspaceOracle.getAssetPrice(weth_usdt_address);
    almostEqual(lp_price, expectedPrice);
  });

  it("test with fee on", async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, swapper],
      dai,
      weth,
      uniswapv2Factory,
      uniswapv2Router,
      paraspaceOracle,
      deployer,
    } = testEnv;

    await uniswapv2Factory.connect(deployer.signer).setFeeTo(deployer.address);

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
    const weth_dai = await getERC20(weth_dai_address);

    await changePriceAndValidate(dai, "0.001");
    let lp_price = await paraspaceOracle.getAssetPrice(weth_dai_address);
    const total_supply = await weth_dai.totalSupply();
    const expectedPrice = parseEther("1")
      .mul(2)
      .mul(parseEther("1"))
      .div(total_supply);
    expect(lp_price).to.be.eq(expectedPrice);

    const swapAmount = parseEther("200");
    await fund({token: dai, user: swapper, amount: swapAmount});
    await approveTo({
      target: uniswapv2Router.address,
      token: dai,
      user: swapper,
    });
    await uniswapv2Router
      .connect(swapper.signer)
      .swapExactTokensForTokens(
        swapAmount,
        0,
        [dai.address, weth.address],
        swapper.address,
        2659537628
      );
    lp_price = await paraspaceOracle.getAssetPrice(weth_dai_address);
    almostEqual(lp_price, expectedPrice);
  });
});
