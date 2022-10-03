import {expect} from "chai";
import {
  deployDefaultReserveAuctionStrategy,
  deployMockReserveAuctionStrategy,
} from "../deploy/helpers/contracts-deployments";
import {
  DefaultReserveAuctionStrategy,
  MockReserveAuctionStrategy,
} from "../types";
import {
  auctionStrategyExp,
  auctionStrategyLinear,
} from "../deploy/market-config/auctionStrategies";
import {makeSuite} from "./helpers/make-suite";
import "./helpers/utils/wadraymath";
import {utils} from "ethers";

makeSuite("AuctionStrategy", () => {
  let strategyInstanceExp: DefaultReserveAuctionStrategy;
  let strategyInstanceLinear: MockReserveAuctionStrategy;

  before(async () => {
    strategyInstanceExp = await deployDefaultReserveAuctionStrategy([
      auctionStrategyExp.maxPriceMultiplier,
      auctionStrategyExp.minExpPriceMultiplier,
      auctionStrategyExp.minPriceMultiplier,
      auctionStrategyExp.stepLinear,
      auctionStrategyExp.stepExp,
      auctionStrategyExp.tickLength,
    ]);

    strategyInstanceLinear = await deployMockReserveAuctionStrategy([
      auctionStrategyLinear.maxPriceMultiplier,
      auctionStrategyLinear.minExpPriceMultiplier,
      auctionStrategyLinear.minPriceMultiplier,
      auctionStrategyLinear.stepLinear,
      auctionStrategyLinear.stepExp,
      auctionStrategyLinear.tickLength,
    ]);
  });

  it("DefaultReserveAuctionStrategy with maxPriceRatio: 300%, minExpPriceRatio: 120%, minPriceRatio: 50%, stepLinearRatio: 5.7%, lamda: 0.08", async () => {
    const auctionStartTimestamp = 0;
    const tickResults = [
      3.0,
      2.769349039, // eslint-disable-next-line
      2.556431366, // eslint-disable-next-line
      2.359883583, // eslint-disable-next-line
      2.178447111, // eslint-disable-next-line
      2.010960138, // eslint-disable-next-line
      1.856350175, // eslint-disable-next-line
      1.713627191, // eslint-disable-next-line
      1.581877272, // eslint-disable-next-line
      1.460256767, // eslint-disable-next-line
      1.347986892, // eslint-disable-next-line
      1.244348735, // eslint-disable-next-line
      1.168857146, // eslint-disable-next-line
      1.111857146, // eslint-disable-next-line
      1.054857146, // eslint-disable-next-line
      0.997857146, // eslint-disable-next-line
      0.940857146, // eslint-disable-next-line
      0.883857146, // eslint-disable-next-line
      0.826857146, // eslint-disable-next-line
      0.769857146, // eslint-disable-next-line
      0.712857146, // eslint-disable-next-line
      0.655857146, // eslint-disable-next-line
      0.598857146, // eslint-disable-next-line
      0.541857146, // eslint-disable-next-line
      0.5, // eslint-disable-next-line
    ];
    expect(await strategyInstanceExp.getMaxPriceMultiplier()).to.be.equal(
      auctionStrategyExp.maxPriceMultiplier
    );
    expect(await strategyInstanceExp.getMinExpPriceMultiplier()).to.be.equal(
      auctionStrategyExp.minExpPriceMultiplier
    );
    expect(await strategyInstanceExp.getMinPriceMultiplier()).to.be.equal(
      auctionStrategyExp.minPriceMultiplier
    );
    expect(await strategyInstanceExp.getStepExp()).to.be.equal(
      auctionStrategyExp.stepExp
    );
    expect(await strategyInstanceExp.getStepLinear()).to.be.equal(
      auctionStrategyExp.stepLinear
    );
    expect(await strategyInstanceExp.getTickLength()).to.be.equal(
      auctionStrategyExp.tickLength
    );
    await Promise.all(
      Array.from(Array(25).keys()).map(async (t) => {
        const currentTimestamp =
          auctionStartTimestamp + +auctionStrategyExp.tickLength * t;
        const price = await strategyInstanceExp.calculateAuctionPriceMultiplier(
          auctionStartTimestamp,
          currentTimestamp
        );
        const priceRounded = price.div(1e9).mul(1e9);
        expect(priceRounded).to.be.equal(
          utils.parseUnits(tickResults[t].toString(), 18)
        );
      })
    );
  });

  it("MockReserveAuctionStrategy with maxPriceRatio: 300%, minExpPriceRatio: 100%, minPriceRatio: 50%, stepLinearRatio: 5%, lamda: 0.1", async () => {
    const auctionStartTimestamp = 0;
    const tickResults = [
      3.0, // eslint-disable-next-line
      2.95, // eslint-disable-next-line
      2.9, // eslint-disable-next-line
      2.85, // eslint-disable-next-line
      2.8, // eslint-disable-next-line
      2.75, // eslint-disable-next-line
      2.7, // eslint-disable-next-line
      2.65, // eslint-disable-next-line
      2.6, // eslint-disable-next-line
      2.55, // eslint-disable-next-line
      2.5, // eslint-disable-next-line
      2.45, // eslint-disable-next-line
      2.4, // eslint-disable-next-line
      2.35, // eslint-disable-next-line
      2.3, // eslint-disable-next-line
      2.25, // eslint-disable-next-line
      2.2, // eslint-disable-next-line
      2.15, // eslint-disable-next-line
      2.1, // eslint-disable-next-line
      2.05, // eslint-disable-next-line
      2.0, // eslint-disable-next-line
      1.95, // eslint-disable-next-line
      1.9, // eslint-disable-next-line
      1.85, // eslint-disable-next-line
      1.8, // eslint-disable-next-line
      1.75, // eslint-disable-next-line
      1.7, // eslint-disable-next-line
      1.65, // eslint-disable-next-line
      1.6, // eslint-disable-next-line
      1.55, // eslint-disable-next-line
      1.5, // eslint-disable-next-line
      1.45, // eslint-disable-next-line
      1.4, // eslint-disable-next-line
      1.35, // eslint-disable-next-line
      1.3, // eslint-disable-next-line
      1.25, // eslint-disable-next-line
      1.2, // eslint-disable-next-line
      1.15, // eslint-disable-next-line
      1.1, // eslint-disable-next-line
      1.05, // eslint-disable-next-line
      1.0, // eslint-disable-next-line
      0.95, // eslint-disable-next-line
      0.9, // eslint-disable-next-line
      0.85, // eslint-disable-next-line
      0.8, // eslint-disable-next-line
      0.75, // eslint-disable-next-line
      0.7, // eslint-disable-next-line
      0.65, // eslint-disable-next-line
      0.6, // eslint-disable-next-line
      0.55, // eslint-disable-next-line
      0.5, // eslint-disable-next-line
    ];
    expect(await strategyInstanceLinear.getMaxPriceMultiplier()).to.be.equal(
      auctionStrategyLinear.maxPriceMultiplier
    );
    expect(await strategyInstanceLinear.getMinExpPriceMultiplier()).to.be.equal(
      auctionStrategyLinear.minExpPriceMultiplier
    );
    expect(await strategyInstanceLinear.getMinPriceMultiplier()).to.be.equal(
      auctionStrategyLinear.minPriceMultiplier
    );
    expect(await strategyInstanceLinear.getStepExp()).to.be.equal(
      auctionStrategyLinear.stepExp
    );
    expect(await strategyInstanceLinear.getStepLinear()).to.be.equal(
      auctionStrategyLinear.stepLinear
    );
    expect(await strategyInstanceLinear.getTickLength()).to.be.equal(
      auctionStrategyLinear.tickLength
    );
    await Promise.all(
      Array.from(Array(51).keys()).map(async (t) => {
        const currentTimestamp =
          auctionStartTimestamp + +auctionStrategyLinear.tickLength * t;
        const price =
          await strategyInstanceLinear.calculateAuctionPriceMultiplier(
            auctionStartTimestamp,
            currentTimestamp
          );
        expect(price).to.be.equal(
          utils.parseUnits(tickResults[t].toString(), 18)
        );
      })
    );
  });
});
