import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {AutoYieldApe, PToken, PYieldToken} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate} from "./helpers/validated-steps";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {
  getAutoYieldApe,
  getPToken,
  getPYieldToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";

describe("Auto Yield Ape Test", () => {
  let testEnv: TestEnv;
  let yApe: AutoYieldApe;
  let yApePToken: PYieldToken;
  let yUSDC: PToken;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, user2, user3],
      apeCoinStaking,
      pool,
      protocolDataProvider,
      usdc,
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

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    return testEnv;
  };

  it("yApe yield reward calculation as expected", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      usdc,
      apeCoinStaking,
    } = await loadFixture(fixture);

    await mintAndValidate(usdc, "100000", user1);
    await usdc.connect(user1.signer).transfer(yApe.address, "100000000000");
    await mintAndValidate(ape, "200", user1);
    await mintAndValidate(ape, "200", user2);

    await waitForTx(
      await yApe.connect(user1.signer).deposit(user1.address, parseEther("200"))
    );

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );
    expect(
      await yApe.connect(user1.signer).balanceOf(user1.address)
    ).to.be.equal(parseEther("200"));
    expect(
      await yApe.connect(user1.signer).balanceOf(user2.address)
    ).to.be.equal(parseEther("200"));
    expect(
      (await apeCoinStaking.addressPosition(yApe.address)).stakedAmount
    ).to.be.equal(parseEther("400"));

    await advanceTimeAndBlock(3600);

    await waitForTx(await yApe.connect(user1.signer).claim());
    await waitForTx(await yApe.connect(user2.signer).claim());
    expect(await yUSDC.balanceOf(user1.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    expect(await yUSDC.balanceOf(user2.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "1800")
    );

    await waitForTx(
      await yApe
        .connect(user1.signer)
        .transfer(user3.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);

    await waitForTx(await yApe.connect(user1.signer).claim());
    await waitForTx(await yApe.connect(user2.signer).claim());
    await waitForTx(await yApe.connect(user3.signer).claim());
    expect(await yUSDC.balanceOf(user1.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "2700")
    );
    expect(await yUSDC.balanceOf(user2.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "3600")
    );
    expect(await yUSDC.balanceOf(user3.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "900")
    );

    await waitForTx(
      await yApe
        .connect(user2.signer)
        .transfer(user3.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApe.connect(user1.signer).claim());
    await waitForTx(await yApe.connect(user2.signer).claim());
    await waitForTx(await yApe.connect(user3.signer).claim());
    expect(await yUSDC.balanceOf(user1.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "3600")
    );
    expect(await yUSDC.balanceOf(user2.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "4500")
    );
    expect(await yUSDC.balanceOf(user3.address)).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, "2700")
    );
  });

  it("lending pool support for yApe work as expected", async () => {
    const {
      users: [user1, user2, user3],
      ape,
      usdc,
      pool,
    } = await loadFixture(fixture);

    await mintAndValidate(usdc, "20000", user1);
    await usdc.connect(user1.signer).transfer(yApe.address, "20000000000");
    await mintAndValidate(ape, "200", user1);
    await mintAndValidate(ape, "200", user2);

    await waitForTx(
      await yApe.connect(user1.signer).deposit(user1.address, parseEther("200"))
    );

    await waitForTx(
      await yApe.connect(user2.signer).deposit(user2.address, parseEther("200"))
    );
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(yApe.address, parseEther("200"), user1.address, 0)
    );
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(yApe.address, parseEther("200"), user2.address, 0)
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApePToken.connect(user1.signer).claimYield());
    await waitForTx(await yApePToken.connect(user2.signer).claimYield());

    almostEqual(
      await yUSDC.balanceOf(user1.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "1800")
    );

    await waitForTx(
      await yApePToken
        .connect(user1.signer)
        .transfer(user3.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApePToken.connect(user1.signer).claimYield());
    await waitForTx(await yApePToken.connect(user2.signer).claimYield());
    await waitForTx(await yApePToken.connect(user3.signer).claimYield());
    //1800 + 900
    almostEqual(
      await yUSDC.balanceOf(user1.address),
      await convertToCurrencyDecimals(usdc.address, "2700")
    );
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "3600")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "900")
    );

    await waitForTx(
      await yApePToken
        .connect(user2.signer)
        .transfer(user3.address, parseEther("100"))
    );

    await advanceTimeAndBlock(3600);
    await waitForTx(await yApePToken.connect(user1.signer).claimYield());
    await waitForTx(await yApePToken.connect(user2.signer).claimYield());
    await waitForTx(await yApePToken.connect(user3.signer).claimYield());
    //1800 + 900
    almostEqual(
      await yUSDC.balanceOf(user1.address),
      await convertToCurrencyDecimals(usdc.address, "3600")
    );
    almostEqual(
      await yUSDC.balanceOf(user2.address),
      await convertToCurrencyDecimals(usdc.address, "4500")
    );
    almostEqual(
      await yUSDC.balanceOf(user3.address),
      await convertToCurrencyDecimals(usdc.address, "2700")
    );
  });
});
