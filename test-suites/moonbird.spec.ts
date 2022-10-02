import {expect} from "chai";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {RateMode} from "../deploy/helpers/types";
import {makeSuite} from "./helpers/make-suite";
import {
  getMockAggregator,
  getMoonBirds,
  getMoonBirdsGatewayProxy,
} from "../deploy/helpers/contracts-getters";
import {parseEther} from "ethers/lib/utils";

makeSuite("MoonBird gateway and supply while nesting", (testEnv) => {
  it("User 1 deposits a nesting moonbird and toggles nesting from Ntoken through gateway", async () => {
    const {
      users: [user1, user2],
      pool,
      moonbirds,
      nMOONBIRD,
    } = testEnv;

    // for (let i = 0; i < 3; i++) {
    await waitForTx(
      await moonbirds.connect(user1.signer)["mint(address)"](user1.address)
    );
    //   }

    await waitForTx(
      await moonbirds
        .connect(user1.signer)
        .setApprovalForAll(pool.address, true)
    );

    const moonbirdsGateway = await getMoonBirdsGatewayProxy();

    await moonbirds.setNestingOpen(true);

    await waitForTx(await moonbirds.connect(user1.signer).toggleNesting(["0"]));

    await waitForTx(
      await moonbirds
        .connect(user1.signer)
        .setApprovalForAll(moonbirdsGateway.address, true)
    );

    await moonbirdsGateway
      .connect(user1.signer)
      .supplyMoonBirds(
        pool.address,
        [{tokenId: 0, useAsCollateral: true}],
        user1.address,
        "0"
      );

    const balance = await nMOONBIRD.balanceOf(user1.address);
    expect(balance.toNumber()).equal(1);

    const nesting = await moonbirds.nestingPeriod("0");

    expect(nesting.nesting).equal(false);

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    await nMoonBird.connect(user1.signer).toggleNesting(["0"]);

    const isNestingOpen = await nMoonBird.nestingOpen();
    expect(isNestingOpen).equal(true);

    const newNesting = await moonbirds.nestingPeriod("0");
    expect(newNesting.nesting).equal(true);

    await nMoonBird.connect(user1.signer).toggleNesting(["0"]);

    expect(nMoonBird.connect(user2.signer).toggleNesting(["0"])).to.be.reverted;
  });

  it("User 2 deposits DAI and user 1 borrows DAI", async () => {
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
        .borrow(
          dai.address,
          borrowAmount,
          RateMode.Variable,
          "0",
          user1.address
        )
    );
  });

  it("Moonbird price drops enough so that borrower becomes eligible for liquidation", async () => {
    const agg = await getMockAggregator(undefined, "MOONBIRD");
    await agg.updateLatestAnswer(parseEther("0.00092").toString()); // dai price: 0.000908578801039414 ETH
  });

  it("Liquidator attempts to liquidate Moonbird while it's nesting", async () => {
    const {
      deployer,
      configurator,
      users: [borrower, , liquidator],
      moonbirds,
      dai,
      pool,
    } = testEnv;

    await waitForTx(
      await configurator
        .connect(deployer.signer)
        .configureReserveAsAuctionCollateral(
          moonbirds.address,
          false,
          "1500000000000000000"
        )
    );

    const daiAmount = await convertToCurrencyDecimals(dai.address, "1");
    await waitForTx(
      await dai.connect(liquidator.signer)["mint(uint256)"](daiAmount)
    );
    await waitForTx(
      await dai
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );

    await pool
      .connect(liquidator.signer)
      .liquidationERC721(
        moonbirds.address,
        dai.address,
        borrower.address,
        0,
        daiAmount,
        false
      );

    const balance = await moonbirds.balanceOf(liquidator.address);
    expect(balance.toNumber()).equal(1);

    const newNesting = await moonbirds.nestingPeriod("0");
    expect(newNesting.nesting).equal(false);
  });

  it("User 1 deposits a nesting moonbird and withdraw after", async () => {
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

    const moonbirdsGateway = await getMoonBirdsGatewayProxy();

    await waitForTx(await moonbirds.connect(user2.signer).toggleNesting(["1"]));

    await waitForTx(
      await moonbirds
        .connect(user2.signer)
        .setApprovalForAll(moonbirdsGateway.address, true)
    );

    await moonbirdsGateway
      .connect(user2.signer)
      .supplyMoonBirds(
        pool.address,
        [{tokenId: 1, useAsCollateral: true}],
        user2.address,
        "0"
      );

    await pool
      .connect(user2.signer)
      .withdrawERC721(moonbirds.address, ["1"], user2.address);

    const balance = await nMOONBIRD.balanceOf(user2.address);
    expect(balance.toNumber()).equal(0);

    const moonBalance = await moonbirds.balanceOf(user2.address);
    expect(moonBalance.toNumber()).equal(1);
  });

  it("User 1 deposits a nesting moonbird through transfer and toggles nesting from Ntoken", async () => {
    const {
      users: [user1, user2],
      pool,
      moonbirds,
      nMOONBIRD,
    } = testEnv;

    await waitForTx(
      await moonbirds.connect(user2.signer)["mint(address)"](user2.address)
    );

    await moonbirds.setNestingOpen(true);

    await waitForTx(await moonbirds.connect(user2.signer).toggleNesting(["2"]));

    await moonbirds
      .connect(user2.signer)
      .safeTransferWhileNesting(user2.address, nMOONBIRD.address, "2");

    const balance = await nMOONBIRD.balanceOf(user2.address);
    expect(balance.toNumber()).equal(1);

    const nesting = await moonbirds.nestingPeriod("2");

    expect(nesting.nesting).equal(true);

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    await nMoonBird.connect(user2.signer).toggleNesting(["2"]);

    const newNesting = await moonbirds.nestingPeriod("2");
    expect(newNesting.nesting).equal(false);

    await nMoonBird.connect(user2.signer).toggleNesting(["2"]);

    expect(nMoonBird.connect(user1.signer).toggleNesting(["2"])).to.be.reverted;

    await pool
      .connect(user2.signer)
      .withdrawERC721(moonbirds.address, ["2"], user2.address);
  });

  it("User 1 deposits a nesting moonbird through transfer and toggles nesting from Ntoken", async () => {
    const {
      users: [, user2],
      pool,
      bayc,
      nMOONBIRD,
    } = testEnv;

    await waitForTx(
      await bayc.connect(user2.signer)["mint(address)"](user2.address)
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
          "0"
        )
    ).to.be.reverted;
  });
});
