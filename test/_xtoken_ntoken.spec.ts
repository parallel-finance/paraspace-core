import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {testEnvFixture} from "./helpers/setup-env";

describe("NToken general", async () => {
  it("TC-ntoken-01: NToken is ERC721 compatible", async () => {
    const {nBAYC, nMAYC, nDOODLE, nUniswapV3, nMOONBIRD} = await loadFixture(
      testEnvFixture
    );
    expect(await nBAYC.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nMAYC.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nDOODLE.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nUniswapV3.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await nMOONBIRD.supportsInterface("0x80ac58cd")).to.be.true;
  });
});
