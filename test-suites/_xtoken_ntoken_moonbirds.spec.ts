import {expect} from "chai";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {getAggregator, getMoonBirds} from "../deploy/helpers/contracts-getters";
import {parseEther} from "ethers/lib/utils";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("MoonBirds nToken and supply while nesting", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  it("TC-moonbirds-01 User deposits a nesting moonbird through transfer", async () => {
    const {
      users: [user1],
      moonbirds,
      nMOONBIRD,
    } = testEnv;

    await waitForTx(
      await moonbirds.connect(user1.signer)["mint(address)"](user1.address)
    );

    await moonbirds.setNestingOpen(true);

    await waitForTx(await moonbirds.connect(user1.signer).toggleNesting(["0"]));

    await moonbirds
      .connect(user1.signer)
      .safeTransferWhileNesting(user1.address, nMOONBIRD.address, "0");

    const balance = await nMOONBIRD.balanceOf(user1.address);
    expect(balance.toNumber()).equal(1);

    const nesting = await moonbirds.nestingPeriod("0");

    expect(nesting.nesting).equal(true);
  });

  it("TC-moonbirds-02 User toggles nesting from nToken", async () => {
    const {
      users: [user1],
      moonbirds,
      nMOONBIRD,
    } = testEnv;
    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    await nMoonBird.connect(user1.signer).toggleNesting(["0"]);

    const newNesting = await moonbirds.nestingPeriod("0");
    expect(newNesting.nesting).equal(false);

    await nMoonBird.connect(user1.signer).toggleNesting(["0"]);
  });

  it("TC-moonbirds-03 Non-nft owner cannot toggle nesting from nToken", async () => {
    const {
      users: [, user2],
      nMOONBIRD,
    } = testEnv;
    const nMoonBird = await getMoonBirds(nMOONBIRD.address);

    await expect(
      nMoonBird.connect(user2.signer).toggleNesting(["0"])
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
  });

  const liquidationFixture = async () => {
    // User 2 deposits DAI and user 1 borrows DAI
    // Then Moonbird price drops enough so that borrower becomes eligible for liquidation
    const {
      users: [user1, user2],
      pool,
      dai,
    } = testEnv;

    const daiAmount = await convertToCurrencyDecimals(dai.address, "40000");

    await waitForTx(
      await dai.connect(user2.signer)["mint(uint256)"](daiAmount)
    );

    // approve protocol to access depositor wallet
    await waitForTx(
      await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 2 - Deposit dai
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(dai.address, daiAmount, user2.address, "0")
    );

    // 1 Moonbird price is set to ~$21. So you can borrow 30%
    const borrowAmount = await convertToCurrencyDecimals(dai.address, "5");

    // User 1 - Borrow dai
    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(dai.address, borrowAmount, "0", user1.address)
    );

    // drop price
    const agg = await getAggregator(undefined, "MOONBIRD");
    await agg.updateLatestAnswer(parseEther("0.00092").toString()); // dai price: 0.000908578801039414 ETH

    return testEnv;
  };

  it("TC-moonbirds-04 Liquidator liquidates Moonbird while it's nesting - gets nToken", async () => {
    testEnv = await loadFixture(liquidationFixture);
    const {
      users: [borrower, , liquidator],
      moonbirds,
      nMOONBIRD,
      configurator,
      weth,
      pool,
    } = testEnv;

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        moonbirds.address,
        ZERO_ADDRESS
      )
    );

    const wethAmount = await convertToCurrencyDecimals(weth.address, "0.00092");
    await waitForTx(
      await weth.connect(liquidator.signer)["mint(uint256)"](wethAmount)
    );
    await waitForTx(
      await weth
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    const nesting = await nMoonBird.nestingPeriod(0);
    expect(nesting.nesting).equal(true);

    await pool
      .connect(liquidator.signer)
      .liquidateERC721(
        moonbirds.address,
        borrower.address,
        0,
        wethAmount,
        true
      );

    const balance = await nMOONBIRD.balanceOf(liquidator.address);
    expect(balance.toNumber()).equal(1);

    // should stay nested
    const newNesting = await nMoonBird.nestingPeriod(0);
    expect(newNesting.nesting).equal(true);
  });

  it("TC-moonbirds-05 Liquidator liquidates Moonbird while it's nesting - gets Moonbird", async () => {
    testEnv = await loadFixture(liquidationFixture);
    const {
      users: [borrower, , liquidator],
      moonbirds,
      nMOONBIRD,
      weth,
      pool,
      configurator,
    } = testEnv;

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        moonbirds.address,
        ZERO_ADDRESS
      )
    );

    const wethAmount = await convertToCurrencyDecimals(weth.address, "0.00092");
    await waitForTx(
      await weth.connect(liquidator.signer)["mint(uint256)"](wethAmount)
    );
    await waitForTx(
      await weth
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    const nesting = await nMoonBird.nestingPeriod(0);
    expect(nesting.nesting).equal(true);

    await pool
      .connect(liquidator.signer)
      .liquidateERC721(
        moonbirds.address,
        borrower.address,
        0,
        wethAmount,
        false
      );

    const balance = await moonbirds.balanceOf(liquidator.address);
    expect(balance.toNumber()).equal(1);

    // should stay nested
    const newNesting = await moonbirds.nestingPeriod(0);
    expect(newNesting.nesting).equal(true);
  });

  it("TC-moonbirds-06 User deposits a nesting moonbird from transfer and withdraws after", async () => {
    const {
      users: [, user2],
      pool,
      moonbirds,
      nMOONBIRD,
    } = testEnv;

    await waitForTx(
      await moonbirds.connect(user2.signer)["mint(address)"](user2.address)
    );

    await waitForTx(
      await moonbirds
        .connect(user2.signer)
        .setApprovalForAll(pool.address, true)
    );

    await moonbirds.setNestingOpen(true);

    await waitForTx(await moonbirds.connect(user2.signer).toggleNesting(["1"]));

    await moonbirds
      .connect(user2.signer)
      .safeTransferWhileNesting(user2.address, nMOONBIRD.address, "1");

    const nTokenBalance = await nMOONBIRD.balanceOf(user2.address);
    expect(nTokenBalance.toNumber()).equal(1);

    expect((await moonbirds.nestingPeriod("1")).nesting).equal(true);

    await pool
      .connect(user2.signer)
      .withdrawERC721(moonbirds.address, [1], user2.address);

    const balance = await nMOONBIRD.balanceOf(user2.address);
    expect(balance.toNumber()).equal(0);

    const moonBalance = await moonbirds.balanceOf(user2.address);
    expect(moonBalance.toNumber()).equal(1);

    const nesting = await moonbirds.nestingPeriod(1);
    expect(nesting.nesting).equal(true);
  });

  it("TC-moonbirds-07 Cannot use safeTransfer() to transfer another asset to nMoonbird (revert expected)", async () => {
    const {
      users: [, user2],
      pool,
      bayc,
      moonbirds,
      nMOONBIRD,
    } = testEnv;

    await waitForTx(
      await moonbirds.connect(user2.signer)["mint(address)"](user2.address)
    );

    await waitForTx(
      await bayc.connect(user2.signer).setApprovalForAll(pool.address, true)
    );

    expect(
      bayc
        .connect(user2.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user2.address,
          nMOONBIRD.address,
          "3"
        )
    ).to.be.reverted;
  });
});
