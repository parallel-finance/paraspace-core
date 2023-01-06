import rawBRE from "hardhat";
import {BigNumber, utils} from "ethers";
import {deployReserveAuctionStrategy} from "../../helpers/contracts-deployments";
import {exp, ln, div, mul} from "@prb/math";
import {fromBn} from "evm-bn";

const deployAuctionStrategy = async (verify = false) => {
  console.time("deploy:new-auction-strategy");
  const auctionStrategy = {
    name: "auctionStrategyUniswapV3",
    maxPriceMultiplier: utils.parseUnits("1.2", 18),
    minExpPriceMultiplier: utils.parseUnits("1", 18),
    minPriceMultiplier: utils.parseUnits("0.8", 18),
    stepLinear: utils.parseUnits("0.003102276665", 18),
    stepExp: utils.parseUnits("0.2022592736", 18),
    tickLength: BigNumber.from("900"),
  };
  console.log();
  console.log(auctionStrategy.name);
  const tminExp = div(
    ln(auctionStrategy.maxPriceMultiplier).sub(
      ln(auctionStrategy.minExpPriceMultiplier)
    ),
    auctionStrategy.stepExp
  );
  const pminExp = div(
    auctionStrategy.maxPriceMultiplier,
    exp(mul(auctionStrategy.stepExp, tminExp))
  );
  const tmin = tminExp.add(
    div(
      pminExp.sub(auctionStrategy.minPriceMultiplier),
      auctionStrategy.stepLinear
    )
  );

  console.log(`- T_minExp: `, fromBn(tminExp));
  console.log(
    `- T_minExp(hours): `,
    fromBn(tminExp.mul(auctionStrategy.tickLength).div(3600))
  );

  console.log(`- P_minExp: `, fromBn(pminExp));
  console.log(`- T_min: `, fromBn(tmin));
  console.log(
    `- T_min(hours): `,
    fromBn(tmin.mul(auctionStrategy.tickLength).div(3600))
  );
  console.log();

  const newStrategy = await deployReserveAuctionStrategy(
    auctionStrategy.name,
    [
      auctionStrategy.maxPriceMultiplier.toString(),
      auctionStrategy.minExpPriceMultiplier.toString(),
      auctionStrategy.minPriceMultiplier.toString(),
      auctionStrategy.stepLinear.toString(),
      auctionStrategy.stepExp.toString(),
      auctionStrategy.tickLength.toString(),
    ],
    verify
  );
  console.log("strategy:", newStrategy.address);
  console.timeEnd("deploy:new-auction-strategy");
};

async function main() {
  await rawBRE.run("set-DRE");
  await deployAuctionStrategy();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
