import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoYieldApe, PToken, PYieldToken} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {parseEther, solidityKeccak256} from "ethers/lib/utils";
import {
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "./helpers/uniswapv3-helper";
import {
  getAutoYieldApe,
  getParaSpaceOracle,
  getPToken,
  getPYieldToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {BigNumber, BigNumberish} from "ethers";
import {
  deployAggregator,
  deployMockedDelegateRegistry,
} from "../helpers/contracts-deployments";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";

function almostEqual(value0: BigNumberish, value1: BigNumberish) {
  const maxDiff = BigNumber.from(value0.toString()).mul(4).div("1000").abs();
  const abs = BigNumber.from(value0.toString()).sub(value1.toString()).abs();
  if (!abs.lte(maxDiff)) {
    console.log("---------value0=" + value0 + ", --------value1=" + value1);
  }
  expect(abs.lte(maxDiff)).to.be.equal(true);
}

describe("Auto Yield Ape Test", () => {
  let testEnv: TestEnv;
  let yApe: AutoYieldApe;
  let yApePToken: PYieldToken;
  let yUSDC: PToken;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, user2, user3, , , , user7],
      apeCoinStaking,
      pool,
      protocolDataProvider,
      usdc,
      nftPositionManager,
      poolAdmin,
      gatewayAdmin,
    } = testEnv;

    yApe = await getAutoYieldApe();

    const {xTokenAddress: pyApeAddress} =
      await protocolDataProvider.getReserveTokensAddresses(yApe.address);
    yApePToken = await getPYieldToken(pyApeAddress);
    const {xTokenAddress: pUSDCAddress} =
      await protocolDataProvider.getReserveTokensAddresses(usdc.address);
    yUSDC = await getPToken(pUSDCAddress);

    await waitForTx(
      await ape.connect(user1.signer).approve(yApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user2.signer).approve(yApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await ape.connect(user3.signer).approve(yApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await yApe.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await yApe.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await yApe.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await yApe.connect(gatewayAdmin.signer).setHarvestOperator(user3.address)
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

    //yApe Oracle
    const yApeOracle = await deployAggregator(
      "yAPE",
      parseEther("0.01").toString(),
      false
    );
    const ParaSpaceOracle = await getParaSpaceOracle();
    await waitForTx(
      await ParaSpaceOracle.connect(poolAdmin.signer).setAssetSources(
        [yApe.address],
        [yApeOracle.address]
      )
    );

    ////////////////////////////////////////////////////////////////////////////////
    // Uniswap
    ////////////////////////////////////////////////////////////////////////////////
    const userApeAmount = await convertToCurrencyDecimals(
      ape.address,
      "10000000000"
    );
    const userUsdcAmount = await convertToCurrencyDecimals(
      usdc.address,
      "10000000000"
    );
    await fund({token: ape, user: user7, amount: userApeAmount});
    await fund({token: usdc, user: user7, amount: userUsdcAmount});
    const nft = nftPositionManager.connect(user7.signer);
    await approveTo({
      target: nftPositionManager.address,
      token: ape,
      user: user7,
    });
    await approveTo({
      target: nftPositionManager.address,
      token: usdc,
      user: user7,
    });
    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1000000000000000000, 1000000);
    const lowerPrice = encodeSqrtRatioX96(100000000000000000, 1000000);
    const upperPrice = encodeSqrtRatioX96(10000000000000000000, 1000000);
    await createNewPool({
      positionManager: nft,
      token0: usdc,
      token1: ape,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });
    await mintNewPosition({
      nft: nft,
      token0: usdc,
      token1: ape,
      fee: fee,
      user: user7,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userUsdcAmount,
      token1Amount: userApeAmount,
    });

    return testEnv;
  };

  it("yApe yield reward calculation as expected 0", async () => {
    const {
      users: [user1, user2, user3, , user5],
      ape,
      usdc,
      apeCoinStaking,
      gatewayAdmin,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "200", user2);
    await mintAndValidate(ape, "200", user3);

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );
    await waitForTx(
      await yApe.connect(user3.signer).deposit(user3.address, parseEther("200"))
    );
    expect(await yApe.balanceOf(user2.address)).to.be.equal(parseEther("200"));
    expect(await yApe.balanceOf(user3.address)).to.be.equal(parseEther("200"));
    expect(
      (await apeCoinStaking.addressPosition(yApe.address)).stakedAmount
    ).to.be.equal(parseEther("400"));

    //user can deposit in and withdraw out before an harvest
    await waitForTx(
      await yApe.connect(user2.signer).withdraw(parseEther("200"))
    );
    expect(await yApe.balanceOf(user2.address)).to.be.equal(0);
    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    expect(await yApe.yieldAmount(user2.address)).to.be.equal(0);
    expect(await yApe.yieldAmount(user3.address)).to.be.equal(0);

    //user can withdraw out after an harvest with no yield
    await waitForTx(
      await yApe.connect(user2.signer).withdraw(parseEther("200"))
    );
    await waitForTx(await yApe.connect(user1.signer).claimFor(user2.address));
    await waitForTx(await yApe.connect(user1.signer).claimFor(user3.address));
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    //owner got withdraw fee +1800
    almostEqual(
      await yApe.yieldAmount(gatewayAdmin.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));
    expect(await yApe.yieldAmount(user2.address)).to.be.equal(0);
    almostEqual(
      await yApe.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    await waitForTx(await yApe.connect(user2.signer).claimFor(user2.address));
    await waitForTx(await yApe.connect(user3.signer).claimFor(user3.address));
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );

    //owner got withdraw fee +900
    await waitForTx(
      await yApe
        .connect(user2.signer)
        .transfer(user5.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApe.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApe.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    almostEqual(
      await yApe.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    await waitForTx(await yApe.connect(user1.signer).claimFor(user2.address));
    await waitForTx(await yApe.connect(user1.signer).claimFor(user3.address));
    await waitForTx(await yApe.connect(user1.signer).claimFor(user5.address));
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "3600")
    );
    almostEqual(
      await yUSDC.balanceOf(user5.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );

    //owner got withdraw fee +900
    await waitForTx(
      await yApe
        .connect(user3.signer)
        .transfer(user5.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApe.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApe.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApe.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    await waitForTx(await yApe.connect(user1.signer).claimFor(user2.address));
    await waitForTx(await yApe.connect(user1.signer).claimFor(user3.address));
    await waitForTx(await yApe.connect(user1.signer).claimFor(user5.address));
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "4500")
    );
    almostEqual(
      await yUSDC.balanceOf(user5.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApe.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApe.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApe.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    await waitForTx(await yApe.connect(user1.signer).claimFor(user2.address));
    await waitForTx(await yApe.connect(user1.signer).claimFor(user3.address));
    await waitForTx(await yApe.connect(user1.signer).claimFor(user5.address));
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "2700")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "5400")
    );
    almostEqual(
      await yUSDC.balanceOf(user5.address),
      await convertToCurrencyDecimals(usdc.address, "2700")
    );

    //owner got withdraw fee +900
    await waitForTx(await yApe.connect(user2.signer).exit());
    //owner got withdraw fee +900
    await waitForTx(await yApe.connect(user3.signer).exit());
    //owner got withdraw fee +1800
    await waitForTx(await yApe.connect(user5.signer).exit());
    expect(await yApe.balanceOf(user2.address)).to.be.equal(0);
    expect(await yApe.balanceOf(user3.address)).to.be.equal(0);
    expect(await yApe.balanceOf(user5.address)).to.be.equal(0);

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApe.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yApe.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yApe.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );

    almostEqual(
      await yApe.yieldAmount(gatewayAdmin.address),
      await convertToCurrencyDecimals(usdc.address, "7200")
    );
  });

  it("yApe yield reward calculation as expected 1", async () => {
    const {
      users: [, user2, user3],
      ape,
      usdc,
      gatewayAdmin,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "1000", user2);

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("800"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );

    await waitForTx(
      await yApe.connect(user2.signer).withdraw(parseEther("200"))
    );

    almostEqual(
      await yApe.yieldAmount(gatewayAdmin.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
  });

  it("yApe yield reward calculation as expected 2", async () => {
    const {
      users: [, user2, user3],
      ape,
      usdc,
      gatewayAdmin,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "1000", user2);

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("400"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("400"))
    );

    await waitForTx(
      await yApe.connect(user2.signer).withdraw(parseEther("600"))
    );
    almostEqual(
      await yApe.yieldAmount(gatewayAdmin.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
  });

  it("lending pool support for yApe work as expected", async () => {
    const {
      users: [user1, user2, user3, , user5],
      ape,
      usdc,
      pool,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "200", user2);
    await mintAndValidate(ape, "200", user3);

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );
    await waitForTx(
      await yApe.connect(user3.signer).deposit(user3.address, parseEther("200"))
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(yApe.address, parseEther("200"), user2.address, 0)
    );
    await waitForTx(
      await pool
        .connect(user3.signer)
        .supply(yApe.address, parseEther("200"), user3.address, 0)
    );

    //user can supply and withdraw out before an harvest
    await waitForTx(
      await pool
        .connect(user2.signer)
        .withdraw(yApe.address, parseEther("200"), user2.address)
    );
    expect(await yApePToken.balanceOf(user2.address)).to.be.equal(0);
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(yApe.address, parseEther("200"), user2.address, 0)
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    expect(await yApePToken.yieldAmount(user2.address)).to.be.equal(0);
    expect(await yApePToken.yieldAmount(user3.address)).to.be.equal(0);

    //user can withdraw out after an harvest with no yield
    await waitForTx(
      await pool
        .connect(user2.signer)
        .withdraw(yApe.address, parseEther("200"), user2.address)
    );

    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user2.address)
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user3.address)
    );
    almostEqual(
      await yUSDC.balanceOf(user1.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(yApe.address, parseEther("200"), user2.address, 0)
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));
    expect(await yApePToken.yieldAmount(user2.address)).to.be.equal(0);
    almostEqual(
      await yApePToken.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    await waitForTx(
      await yApePToken.connect(user2.signer).claimFor(user2.address)
    );
    await waitForTx(
      await yApePToken.connect(user3.signer).claimFor(user3.address)
    );
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );

    await waitForTx(
      await yApePToken
        .connect(user2.signer)
        .transfer(user5.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApePToken.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApePToken.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    almostEqual(
      await yApePToken.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user2.address)
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user3.address)
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user5.address)
    );
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "3600")
    );
    almostEqual(
      await yUSDC.balanceOf(user5.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );

    await waitForTx(
      await yApePToken
        .connect(user3.signer)
        .transfer(user5.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApePToken.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApePToken.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApePToken.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user2.address)
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user3.address)
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user5.address)
    );
    //1800 + 900
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "4500")
    );
    almostEqual(
      await yUSDC.balanceOf(user5.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApePToken.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApePToken.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );
    almostEqual(
      await yApePToken.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user2.address)
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user3.address)
    );
    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user5.address)
    );
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "2700")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "5400")
    );
    almostEqual(
      await yUSDC.balanceOf(user5.address),
      await convertToCurrencyDecimals(usdc.address, "2700")
    );

    await waitForTx(
      await pool
        .connect(user2.signer)
        .withdraw(yApe.address, parseEther("100"), user2.address)
    );
    await waitForTx(
      await pool
        .connect(user3.signer)
        .withdraw(yApe.address, parseEther("100"), user3.address)
    );
    await waitForTx(
      await pool
        .connect(user5.signer)
        .withdraw(yApe.address, parseEther("200"), user5.address)
    );
    expect(await yApePToken.balanceOf(user2.address)).to.be.equal(0);
    expect(await yApePToken.balanceOf(user3.address)).to.be.equal(0);
    expect(await yApePToken.balanceOf(user5.address)).to.be.equal(0);

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yApePToken.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yApePToken.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
    almostEqual(
      await yApePToken.yieldAmount(user5.address),
      await convertToCurrencyDecimals(usdc.address, "0")
    );
  });

  it("yApe can be liquidated as expected", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      usdc,
      weth,
      pool,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "2000", user1);
    await supplyAndValidate(weth, "100", user2, true);

    await changePriceAndValidate(yApe, "0.01");

    // user1 deposit yApe
    await waitForTx(
      await yApe
        .connect(user1.signer)
        .deposit(user1.address, parseEther("2000"))
    );

    // user1 supply yApe
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(yApe.address, parseEther("2000"), user1.address, 0)
    );

    // user1 borrow weth
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("1"), 0, user1.address)
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user3.signer).harvest("990000"));

    almostEqual(
      await yUSDC.balanceOf(yApe.address),
      await convertToCurrencyDecimals(usdc.address, "7200")
    );

    // price change
    await changePriceAndValidate(yApe, "0.00001");

    // user2 liquidate user1
    await mintAndValidate(weth, "2", user2);
    await waitForTx(
      await weth.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .liquidateERC20(
          yApe.address,
          weth.address,
          user1.address,
          parseEther("2000"),
          false
        )
    );

    expect(await yApe.balanceOf(user2.address)).to.be.equal(parseEther("2000"));

    await waitForTx(
      await yApePToken.connect(user1.signer).claimFor(user1.address)
    );
    almostEqual(
      await yUSDC.balanceOf(user1.address),
      await convertToCurrencyDecimals(usdc.address, "3600")
    );
  });

  it("harvest fee calculation as expected", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      usdc,
      gatewayAdmin,
    } = await loadFixture(fixture);

    await expect(
      yApe.connect(user2.signer).setHarvestOperator(user2.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(
      yApe.connect(user2.signer).setHarvestFeeRate(1000)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await waitForTx(
      await yApe.connect(gatewayAdmin.signer).setHarvestOperator(user2.address)
    );
    await waitForTx(
      await yApe.connect(gatewayAdmin.signer).setHarvestFeeRate(1000)
    );

    await mintAndValidate(ape, "200", user2);
    await mintAndValidate(ape, "200", user3);

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );
    await waitForTx(
      await yApe.connect(user3.signer).deposit(user3.address, parseEther("200"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user2.signer).harvest("990000"));

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user2.signer).harvest("990000"));

    //user1 is owner, so total yield is 360 + 360 = 720
    almostEqual(
      await yApe.yieldAmount(user1.address),
      await convertToCurrencyDecimals(usdc.address, "720")
    );
    almostEqual(
      await yApe.yieldAmount(user2.address),
      await convertToCurrencyDecimals(usdc.address, "1620")
    );
    almostEqual(
      await yApe.yieldAmount(user3.address),
      await convertToCurrencyDecimals(usdc.address, "1620")
    );

    await waitForTx(
      await yApe.connect(gatewayAdmin.signer).claimFor(gatewayAdmin.address)
    );

    almostEqual(
      await yUSDC.balanceOf(gatewayAdmin.address),
      await convertToCurrencyDecimals(usdc.address, "720")
    );
  });

  it("check rescueERC20", async () => {
    const {
      users: [user1, user2],
      weth,
      gatewayAdmin,
    } = await loadFixture(fixture);

    await mintAndValidate(weth, "1", user1);
    await waitForTx(
      await weth.connect(user1.signer).transfer(yApe.address, parseEther("1"))
    );

    await expect(
      yApe
        .connect(user2.signer)
        .rescueERC20(weth.address, user2.address, parseEther("1"))
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await waitForTx(
      await yApe
        .connect(gatewayAdmin.signer)
        .rescueERC20(weth.address, user1.address, parseEther("1"))
    );

    almostEqual(await weth.balanceOf(user1.address), parseEther("1"));
  });

  it("test vote delegation", async () => {
    const {
      users: [user1],
      gatewayAdmin,
    } = await loadFixture(fixture);

    const delegateRegistry = await deployMockedDelegateRegistry(
      ETHERSCAN_VERIFICATION
    );

    await yApe
      .connect(gatewayAdmin.signer)
      .setVotingDelegate(
        delegateRegistry.address,
        solidityKeccak256(["string"], ["test"]),
        user1.address
      );

    expect(
      await yApe.getDelegate(
        delegateRegistry.address,
        solidityKeccak256(["string"], ["test"])
      )
    ).to.be.eq(user1.address);
  });
});
