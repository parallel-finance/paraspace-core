import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {waitForTx} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {
  getAllTokens,
  getERC721PointsStaking,
  getMintableERC20,
  getMintableERC721,
  getNTokenDeGods,
  getProtocolDataProvider,
} from "../helpers/contracts-getters";
import {
  ERC721PointsStakingV2,
  MintableERC20,
  MintableERC721,
  NTokenDeGods,
} from "../types";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {parseEther} from "ethers/lib/utils";
import {ProtocolErrors} from "../helpers/types";

describe("NToken DeGods Test", () => {
  let testEnv: TestEnv;
  let PointStaking: ERC721PointsStakingV2;
  let DUST: MintableERC20;
  let DeGods: MintableERC721;
  let nDeGods: NTokenDeGods;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1],
      pool,
      poolAdmin,
    } = testEnv;

    PointStaking = await getERC721PointsStaking();
    const dustAddress = await PointStaking.stakeFeeToken();
    DUST = await getMintableERC20(dustAddress);
    const allTokens = await getAllTokens();
    const protocolDataProvider = await getProtocolDataProvider();
    DeGods = await getMintableERC721(allTokens.DEGODS.address);
    const nDeGodsAddress = (
      await protocolDataProvider.getReserveTokensAddresses(
        allTokens.DEGODS.address
      )
    ).xTokenAddress;
    nDeGods = await getNTokenDeGods(nDeGodsAddress);

    await waitForTx(
      await DeGods.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
    await waitForTx(
      await DUST.connect(user1.signer).approve(nDeGods.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await DUST.connect(poolAdmin.signer).approve(
        nDeGods.address,
        MAX_UINT_AMOUNT
      )
    );

    return testEnv;
  };

  it("user can supply and withdraw degods with staking if approve token transfer", async () => {
    const {
      users: [user1],
      pool,
    } = await loadFixture(fixture);
    await mintAndValidate(DeGods, "3", user1);
    await mintAndValidate(DUST, "12", user1);

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
    expect(await nDeGods.balanceOf(user1.address)).to.be.equal(0);

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        DeGods.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(3);
    expect(await nDeGods.balanceOf(user1.address)).to.be.equal(3);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(DeGods.address, [0, 1, 2], user1.address)
    );

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "12")
    );
  });

  it("user can supply and withdraw degods with staking if partial approve token transfer", async () => {
    const {
      users: [user1],
      pool,
    } = await loadFixture(fixture);
    await mintAndValidate(DeGods, "3", user1);
    await mintAndValidate(DUST, "6", user1);

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
    expect(await nDeGods.balanceOf(user1.address)).to.be.equal(0);

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        DeGods.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(1);
    expect(await nDeGods.balanceOf(user1.address)).to.be.equal(3);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(DeGods.address, [0, 1, 2], user1.address)
    );

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "4")
    );
  });

  it("user can supply and withdraw degods without staking if didn't approve token transfer", async () => {
    const {
      users: [user1],
      pool,
    } = await loadFixture(fixture);
    await mintAndValidate(DeGods, "3", user1);

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
    expect(await nDeGods.balanceOf(user1.address)).to.be.equal(0);

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        DeGods.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
    expect(await nDeGods.balanceOf(user1.address)).to.be.equal(3);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdrawERC721(DeGods.address, [0, 1, 2], user1.address)
    );

    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "0")
    );
  });

  it("ndegods with staking can be liquidated", async () => {
    const {
      users: [user1, user2],
      weth,
      pool,
    } = await loadFixture(fixture);
    await mintAndValidate(DeGods, "1", user1);
    await mintAndValidate(DUST, "4", user1);
    await supplyAndValidate(weth, "100", user2, true);

    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "0")
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          DeGods.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          "0"
        )
    );

    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "1")
    );

    await changePriceAndValidate(DeGods, "10");

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("2"), 0, user1.address)
    );

    await changePriceAndValidate(DeGods, "1");

    await waitForTx(
      await pool
        .connect(user2.signer)
        .startAuction(user1.address, DeGods.address, 0)
    );

    expect(await DeGods.balanceOf(user2.address)).to.be.equal(0);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .liquidateERC721(
          DeGods.address,
          user1.address,
          0,
          await convertToCurrencyDecimals(weth.address, "100"),
          false,
          {gasLimit: 5000000, value: parseEther("100")}
        )
    );
    expect(await DeGods.balanceOf(user2.address)).to.be.equal(1);
    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "4")
    );
  });

  it("ndegods without staking can be liquidated", async () => {
    const {
      users: [user1, user2],
      weth,
      pool,
    } = await loadFixture(fixture);
    await mintAndValidate(DeGods, "1", user1);
    await supplyAndValidate(weth, "100", user2, true);

    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "0")
    );

    await waitForTx(
      await pool
        .connect(user1.signer)
        .supplyERC721(
          DeGods.address,
          [{tokenId: 0, useAsCollateral: true}],
          user1.address,
          "0"
        )
    );

    await changePriceAndValidate(DeGods, "10");

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, parseEther("2"), 0, user1.address)
    );

    await changePriceAndValidate(DeGods, "1");

    await waitForTx(
      await pool
        .connect(user2.signer)
        .startAuction(user1.address, DeGods.address, 0)
    );

    await waitForTx(
      await pool
        .connect(user2.signer)
        .liquidateERC721(
          DeGods.address,
          user1.address,
          0,
          await convertToCurrencyDecimals(weth.address, "100"),
          false,
          {gasLimit: 5000000, value: parseEther("100")}
        )
    );
    expect(await DeGods.balanceOf(user2.address)).to.be.equal(1);
    expect(await DUST.balanceOf(ONE_ADDRESS)).to.be.equal(
      await convertToCurrencyDecimals(DUST.address, "0")
    );
  });

  it("only ntoken owner or pool admin can staking or withdraw from point staking", async () => {
    const {
      users: [user1, user2],
      pool,
      poolAdmin,
    } = await loadFixture(fixture);
    await mintAndValidate(DeGods, "3", user1);

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        DeGods.address,
        [
          {tokenId: 0, useAsCollateral: true},
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        "0"
      )
    );
    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);

    await mintAndValidate(DUST, "4", user1);
    await mintAndValidate(DUST, "4", poolAdmin);

    await waitForTx(await nDeGods.connect(user1.signer).pointStaking([0]));
    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(1);

    await waitForTx(await nDeGods.connect(poolAdmin.signer).pointStaking([1]));
    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(2);

    await expect(
      nDeGods.connect(user2.signer).pointStaking([2])
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ALLOWED);

    await expect(
      nDeGods.connect(user2.signer).withdrawFromStaking([0])
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ALLOWED);

    await waitForTx(
      await nDeGods.connect(user1.signer).withdrawFromStaking([0])
    );
    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(1);

    await waitForTx(
      await nDeGods.connect(poolAdmin.signer).withdrawFromStaking([1])
    );
    expect(await PointStaking.numStakedTokens(nDeGods.address)).to.be.equal(0);
  });
});
