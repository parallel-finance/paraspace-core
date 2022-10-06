import {expect} from "chai";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {RateMode} from "../deploy/helpers/types";
import {makeSuite} from "./helpers/make-suite";
import {snapshot} from "./helpers/snapshot-manager";
import {
  getMockAggregator,
  getMoonBirds,
  getMoonBirdsGatewayProxy,
} from "../deploy/helpers/contracts-getters";
import {parseEther} from "ethers/lib/utils";

makeSuite("MoonBird gateway and supply while nesting", (testEnv) => {
  let snapshotId: string;
  before(async () => {
    snapshotId = await snapshot.take();
  });

  it("Borrower deposits a nesting moonbird through transfer and toggles nesting from nToken", async () => {
    const {
      users: [user1, user2],
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

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    await nMoonBird.connect(user1.signer).toggleNesting(["0"]);

    const newNesting = await moonbirds.nestingPeriod("0");
    expect(newNesting.nesting).equal(false);

    await nMoonBird.connect(user1.signer).toggleNesting(["0"]);

    await expect(
      nMoonBird.connect(user2.signer).toggleNesting(["0"])
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
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

  it("Liquidator liquidates Moonbird while it's nesting - gets nToken", async () => {
    const {
      users: [borrower, , liquidator],
      moonbirds,
      nMOONBIRD,
      configurator,
      dai,
      pool,
    } = testEnv;

    const liqSnapshotId = await snapshot.take();

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        moonbirds.address,
        ZERO_ADDRESS
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

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    const nesting = await nMoonBird.nestingPeriod(0);
    expect(nesting.nesting).equal(true);

    await pool
      .connect(liquidator.signer)
      .liquidationERC721(
        moonbirds.address,
        dai.address,
        borrower.address,
        0,
        daiAmount,
        true
      );

    const balance = await nMOONBIRD.balanceOf(liquidator.address);
    expect(balance.toNumber()).equal(1);

    // should stay nested
    const newNesting = await nMoonBird.nestingPeriod(0);
    expect(newNesting.nesting).equal(true);

    await snapshot.revert(liqSnapshotId);
  });

  it("Liquidator liquidates Moonbird while it's nesting - gets Moonbird", async () => {
    const {
      users: [borrower, , liquidator],
      moonbirds,
      nMOONBIRD,
      dai,
      pool,
      configurator,
    } = testEnv;

    await waitForTx(
      await configurator.setReserveAuctionStrategyAddress(
        moonbirds.address,
        ZERO_ADDRESS
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

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    const nesting = await nMoonBird.nestingPeriod(0);
    expect(nesting.nesting).equal(true);

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

    // should stay nested
    const newNesting = await moonbirds.nestingPeriod(0);
    expect(newNesting.nesting).equal(true);
  });

  it("User 2 deposits a nesting moonbird from transfer and withdraws after", async () => {
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

  it("User 2 deposits a nesting moonbird through gateway and toggles nesting from nToken", async () => {
    const {
      users: [user1, user2],
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

    await moonbirds.setNestingOpen(true);

    await waitForTx(await moonbirds.connect(user2.signer).toggleNesting(["2"]));
    expect((await moonbirds.nestingPeriod("2")).nesting).equal(true);

    await waitForTx(
      await moonbirds
        .connect(user2.signer)
        .setApprovalForAll(moonbirdsGateway.address, true)
    );

    await moonbirdsGateway
      .connect(user2.signer)
      .supplyMoonBirds(
        [{tokenId: 2, useAsCollateral: true}],
        user2.address,
        "0"
      );

    const balance = await nMOONBIRD.balanceOf(user2.address);
    expect(balance.toNumber()).equal(1);

    const nesting = await moonbirds.nestingPeriod("2");
    expect(nesting.nesting).equal(false); // supplying through gateway looses nesting

    const nMoonBird = await getMoonBirds(nMOONBIRD.address);
    await nMoonBird.connect(user2.signer).toggleNesting(["2"]);

    const newNesting = await moonbirds.nestingPeriod("2");
    expect(newNesting.nesting).equal(true);

    await nMoonBird.connect(user2.signer).toggleNesting(["2"]);

    // another user cannot toggle nesting
    await expect(
      nMoonBird.connect(user1.signer).toggleNesting(["2"])
    ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");

    await pool
      .connect(user2.signer)
      .withdrawERC721(moonbirds.address, ["2"], user2.address);

    expect((await moonbirds.nestingPeriod("2")).nesting).equal(false);
  });

  it("User attempts to transfer BAYC to a Moonbird nToken - should be reverted", async () => {
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

  it("If user supplies a mix of nesting and non-nesting moonbirds through gateway, they all become unnested", async () => {
    const {
      users: [, , user3],
      pool,
      moonbirds,
    } = testEnv;

    await snapshot.revert(snapshotId);

    for (let i = 0; i < 3; i++) {
      await waitForTx(
        await moonbirds.connect(user3.signer)["mint(address)"](user3.address)
      );
    }

    await waitForTx(
      await moonbirds
        .connect(user3.signer)
        .setApprovalForAll(pool.address, true)
    );

    const moonbirdsGateway = await getMoonBirdsGatewayProxy();

    await moonbirds.setNestingOpen(true);

    // toggle nesting for 2 of the 3
    for (let i = 0; i < 2; i++) {
      await waitForTx(await moonbirds.connect(user3.signer).toggleNesting([i]));
    }

    await waitForTx(
      await moonbirds
        .connect(user3.signer)
        .setApprovalForAll(moonbirdsGateway.address, true)
    );

    await moonbirdsGateway.connect(user3.signer).supplyMoonBirds(
      [
        {tokenId: 0, useAsCollateral: true},
        {tokenId: 1, useAsCollateral: true},
        {tokenId: 2, useAsCollateral: true},
      ],
      user3.address,
      "0"
    );

    // they should all be unnested now
    for (let i = 0; i < 3; i++) {
      const newNesting = await moonbirds.nestingPeriod(i);
      expect(newNesting.nesting).equal(false);
    }
  });
});
