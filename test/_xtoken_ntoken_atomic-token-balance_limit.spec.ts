import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {waitForTx} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {
  createNewPool,
  mintNewPosition,
  fund,
  approveTo,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {ProtocolErrors} from "../helpers/types";

describe("Atomic tokens balance limit test", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {
      users: [user1],
      dai,
      weth,
      nftPositionManager,
      nUniswapV3,
      pool,
    } = testEnv;

    const userDaiAmount = await convertToCurrencyDecimals(
      dai.address,
      "100000"
    );
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "100");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = nftPositionManager.connect(user1.signer);
    await approveTo({
      target: nftPositionManager.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: nftPositionManager.address,
      token: weth,
      user: user1,
    });
    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1, 1000);
    const lowerPrice = encodeSqrtRatioX96(1, 10000);
    const upperPrice = encodeSqrtRatioX96(1, 100);
    await createNewPool({
      positionManager: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });
    for (let index = 0; index < 8; index++) {
      await mintNewPosition({
        nft: nft,
        token0: dai,
        token1: weth,
        fee: fee,
        user: user1,
        tickSpacing: tickSpacing,
        lowerPrice,
        upperPrice,
        token0Amount: userDaiAmount.div(10),
        token1Amount: userWethAmount.div(10),
      });
    }

    await nft.setApprovalForAll(pool.address, true);

    await waitForTx(await nUniswapV3.setBalanceLimit(2));
  });
  const {NTOKEN_BALANCE_EXCEEDED} = ProtocolErrors;

  it("Should allow supplying atomic tokens within limit [ @skip-on-coverage ]", async () => {
    const {
      users: [user1],
      nftPositionManager,
      nUniswapV3,
      pool,
    } = testEnv;

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        nftPositionManager.address,
        [
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        0,
        {
          gasLimit: 12_450_000,
        }
      )
    );

    expect(await nUniswapV3.balanceOf(user1.address)).to.eq(2);
  });

  it("Should not allow supplying atomic tokens outside of limit [ @skip-on-coverage ]", async () => {
    const {
      nftPositionManager,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool.connect(user1.signer).supplyERC721(
        nftPositionManager.address,
        [
          {tokenId: 3, useAsCollateral: true},
          {tokenId: 4, useAsCollateral: true},
        ],
        user1.address,
        0,
        {
          gasLimit: 12_450_000,
        }
      )
    ).to.be.revertedWith(NTOKEN_BALANCE_EXCEEDED);
  });

  it("Should allow transferring atomic tokens within of limit [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, user2],
      nUniswapV3,
    } = testEnv;

    await waitForTx(
      await nUniswapV3
        .connect(user1.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user1.address,
          user2.address,
          1,
          {
            gasLimit: 12_450_000,
          }
        )
    );
    await waitForTx(
      await nUniswapV3
        .connect(user1.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user1.address,
          user2.address,
          2,
          {
            gasLimit: 12_450_000,
          }
        )
    );

    expect(await nUniswapV3.balanceOf(user2.address)).to.be.eq(2);
  });

  it("Should not allow transferring atomic tokens outside of limit [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, user2],
      nUniswapV3,
      pool,
      nftPositionManager,
    } = testEnv;

    await waitForTx(
      await pool.connect(user1.signer).supplyERC721(
        nftPositionManager.address,
        [
          {tokenId: 3, useAsCollateral: true},
          {tokenId: 4, useAsCollateral: true},
        ],
        user1.address,
        0,
        {
          gasLimit: 12_450_000,
        }
      )
    );

    expect(
      nUniswapV3
        .connect(user1.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user1.address,
          user2.address,
          3,
          {
            gasLimit: 12_450_000,
          }
        )
    ).to.be.revertedWith(NTOKEN_BALANCE_EXCEEDED);
  });

  it("withdrawing atomic token should decrease the atomic token counter [ @skip-on-coverage ]", async () => {
    const {
      users: [user1, user2],
      nftPositionManager,
      nUniswapV3,
      pool,
    } = testEnv;

    await waitForTx(
      await pool
        .connect(user2.signer)
        .withdrawERC721(nftPositionManager.address, [2], user2.address, {
          gasLimit: 12_450_000,
        })
    );

    expect(await nUniswapV3.balanceOf(user2.address)).to.be.eq(1);

    await waitForTx(
      await nUniswapV3
        .connect(user1.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user1.address,
          user2.address,
          3,
          {
            gasLimit: 12_450_000,
          }
        )
    );

    expect(await nUniswapV3.balanceOf(user2.address)).to.be.eq(2);
  });

  it("should allow supplying unlimited non-atomic tokens [ @skip-on-coverage ]", async () => {
    const {
      bayc,
      users: [user1],
      pool,
    } = testEnv;

    await waitForTx(
      await bayc
        .connect(user1.signer)
        ["mint(uint256,address)"](10, user1.address)
    );

    await waitForTx(
      await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );

    await pool.connect(user1.signer).supplyERC721(
      bayc.address,
      [
        {tokenId: 1, useAsCollateral: true},
        {tokenId: 2, useAsCollateral: true},
        {tokenId: 3, useAsCollateral: true},
        {tokenId: 4, useAsCollateral: true},
      ],
      user1.address,
      "0"
    );
  });
});
