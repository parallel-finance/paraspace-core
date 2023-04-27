import {expect} from "chai";
import {waitForTx} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {MintableERC721, NTokenChromieSquiggle} from "../types";
import {
  getAllTokens,
  getMintableERC721,
  getNTokenChromieSquiggle,
  getProtocolDataProvider,
} from "../helpers/contracts-getters";
import {mintAndValidate} from "./helpers/validated-steps";
import {ProtocolErrors} from "../helpers/types";

describe("Test Chromie Squiggle nToken", () => {
  let testEnv: TestEnv;
  let chromieSquiggle: MintableERC721;
  let nChromieSquiggle: NTokenChromieSquiggle;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const allTokens = await getAllTokens();
    const protocolDataProvider = await getProtocolDataProvider();
    chromieSquiggle = await getMintableERC721(allTokens.BLOCKS.address);
    const nChromieSquiggleAddress = (
      await protocolDataProvider.getReserveTokensAddresses(
        allTokens.BLOCKS.address
      )
    ).xTokenAddress;
    nChromieSquiggle = await getNTokenChromieSquiggle(nChromieSquiggleAddress);

    return testEnv;
  };

  it("User can supply and withdraw tokenID within the range", async () => {
    const {
      users: [user1],
      pool,
    } = await loadFixture(fixture);

    await mintAndValidate(chromieSquiggle, "3", user1);

    await waitForTx(
      await chromieSquiggle
        .connect(user1.signer)
        .setApprovalForAll(pool.address, true)
    );

    expect(await nChromieSquiggle.balanceOf(user1.address)).to.be.equal(0);

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        chromieSquiggle.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );

    expect(await nChromieSquiggle.balanceOf(user1.address)).to.be.equal(3);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(chromieSquiggle.address, [0, 1, 2], user1.address)
    );

    expect(await nChromieSquiggle.balanceOf(user1.address)).to.be.equal(0);
  });

  it("User cannot supply tokenID not within the range", async () => {
    const {
      users: [user1, user2],
      pool,
    } = await loadFixture(fixture);

    await waitForTx(
      await chromieSquiggle
        .connect(user1.signer)
        ["mint(uint256,address)"](21, user1.address)
    );
    await waitForTx(
      await chromieSquiggle
        .connect(user1.signer)
        ["mint(uint256,address)"](1, user2.address)
    );

    expect(await chromieSquiggle.ownerOf(21)).to.be.equal(user2.address);

    await waitForTx(
      await chromieSquiggle
        .connect(user2.signer)
        .setApprovalForAll(pool.address, true)
    );

    expect(await nChromieSquiggle.balanceOf(user1.address)).to.be.equal(0);

    await expect(
      pool
        .connect(user2.signer)
        .supplyERC721(
          chromieSquiggle.address,
          [{tokenId: 21, useAsCollateral: true}],
          user1.address,
          "0"
        )
    ).to.be.revertedWith(ProtocolErrors.INVALID_TOKEN_ID);
  });
});
