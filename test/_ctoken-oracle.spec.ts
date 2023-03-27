import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {WAD} from "../helpers/constants";
import {testEnvFixture} from "./helpers/setup-env";
import {utils} from "ethers";

describe("CToken Oracle", async () => {
  const firstExchangeRateStored = utils.parseUnits("2", 26).toString();
  const secondExchangeRateStored = utils.parseUnits("2.1", 26).toString();
  const thirdExchangeRateStored = utils.parseUnits("2.2", 26).toString();

  it("TC-ctoken-oracle-01: cETH price is equal to ETH price * exchangeRateStored", async () => {
    const {paraspaceOracle, cETH, weth} = await loadFixture(testEnvFixture);
    const wethPrice = await paraspaceOracle.getAssetPrice(weth.address);
    const cETHExchangeRateStored = await cETH.exchangeRateStored();
    expect(cETHExchangeRateStored).to.be.eq(firstExchangeRateStored);
    expect(await paraspaceOracle.getAssetPrice(cETH.address)).to.be.eq(
      wethPrice.mul(cETHExchangeRateStored).div(WAD).div("10000000000")
    );

    expect(await cETH.setExchangeRateStored(secondExchangeRateStored));
    expect(await paraspaceOracle.getAssetPrice(cETH.address)).to.be.eq(
      wethPrice.mul(secondExchangeRateStored).div(WAD).div("10000000000")
    );

    expect(await cETH.setExchangeRateStored(thirdExchangeRateStored));
    expect(await paraspaceOracle.getAssetPrice(cETH.address)).to.be.eq(
      wethPrice.mul(thirdExchangeRateStored).div(WAD).div("10000000000")
    );
  });
});
