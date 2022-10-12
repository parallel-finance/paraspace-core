import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {utils} from "ethers";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("PoolConfigurator: Liquidation Protocol Fee", () => {
  let testEnv: TestEnv;
  const {INVALID_LIQUIDATION_PROTOCOL_FEE} = ProtocolErrors;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {weth, pool, dai, usdc} = testEnv;

    const mintedAmount = utils.parseEther("1000000000");
    await dai["mint(uint256)"](mintedAmount);
    await weth["mint(uint256)"](mintedAmount);
    await usdc["mint(uint256)"](mintedAmount);

    await dai.approve(pool.address, MAX_UINT_AMOUNT);
    await weth.approve(pool.address, MAX_UINT_AMOUNT);
    await usdc.approve(pool.address, MAX_UINT_AMOUNT);
  });

  it("Reserves should initially have protocol liquidation fee set to 0", async () => {
    const {dai, usdc, protocolDataProvider} = testEnv;

    const usdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    expect(usdcLiquidationProtocolFee).to.be.equal("0");
    expect(daiLiquidationProtocolFee).to.be.equal("0");
  });

  it("Sets the protocol liquidation fee to 1000 (10.00%)", async () => {
    const {configurator, dai, usdc, protocolDataProvider} = testEnv;

    const oldUsdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const oldDaiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    const liquidationProtocolFee = 1000;

    expect(
      await configurator.setLiquidationProtocolFee(
        usdc.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        usdc.address,
        oldUsdcLiquidationProtocolFee,
        liquidationProtocolFee
      );
    expect(
      await configurator.setLiquidationProtocolFee(
        dai.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        dai.address,
        oldDaiLiquidationProtocolFee,
        liquidationProtocolFee
      );

    const usdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    expect(usdcLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
    expect(daiLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
  });

  it("Sets the protocol liquidation fee to 10000 (100.00%) equal to PERCENTAGE_FACTOR", async () => {
    const {configurator, dai, usdc, protocolDataProvider} = testEnv;

    const oldUsdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const oldDaiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    const liquidationProtocolFee = 10000;

    expect(
      await configurator.setLiquidationProtocolFee(
        usdc.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        usdc.address,
        oldUsdcLiquidationProtocolFee,
        liquidationProtocolFee
      );
    expect(
      await configurator.setLiquidationProtocolFee(
        dai.address,
        liquidationProtocolFee
      )
    )
      .to.emit(configurator, "LiquidationProtocolFeeChanged")
      .withArgs(
        dai.address,
        oldDaiLiquidationProtocolFee,
        liquidationProtocolFee
      );

    const usdcLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(usdc.address);
    const daiLiquidationProtocolFee =
      await protocolDataProvider.getLiquidationProtocolFee(dai.address);

    expect(usdcLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
    expect(daiLiquidationProtocolFee).to.be.equal(liquidationProtocolFee);
  });

  it("Tries to set the protocol liquidation fee to 10001 (100.01%) > PERCENTAGE_FACTOR (revert expected)", async () => {
    const {configurator, dai, usdc} = testEnv;

    const liquidationProtocolFee = 10001;

    expect(
      configurator.setLiquidationProtocolFee(
        usdc.address,
        liquidationProtocolFee
      )
    ).to.be.revertedWith(INVALID_LIQUIDATION_PROTOCOL_FEE);
    expect(
      configurator.setLiquidationProtocolFee(
        dai.address,
        liquidationProtocolFee
      )
    ).to.be.revertedWith(INVALID_LIQUIDATION_PROTOCOL_FEE);
  });
});
