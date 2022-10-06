import {expect} from "chai";
import {makeSuite, revertHead, setSnapshot} from "./helpers/make-suite";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {
  createNewPool,
  mintNewPosition,
  fund,
  approveTo,
} from "../deploy/helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {
  getPoolConfiguratorProxy,
  getUniswapV3Gateway,
} from "../deploy/helpers/contracts-getters";

makeSuite("Atomic tokens limit", (testEnv) => {
  describe("token limit behaviour", () => {
    before(async () => {
      await setSnapshot();
    });
    after(async () => {
      await revertHead();
    });

    it("Should allow supplying atomic tokens within limit [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        nUniswapV3,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "100000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "100"
      );
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

      const uniswapV3Gateway = (await getUniswapV3Gateway()).connect(
        user1.signer
      );

      await nft.setApprovalForAll(uniswapV3Gateway.address, true);

      const poolConfigurator = await getPoolConfiguratorProxy();

      await waitForTx(await poolConfigurator.setMaxAtomicTokensAllowed(2));

      await uniswapV3Gateway.supplyUniswapV3(
        [
          {tokenId: 1, useAsCollateral: true},
          {tokenId: 2, useAsCollateral: true},
        ],
        user1.address,
        {
          gasLimit: 12_450_000,
        }
      );

      expect(await nUniswapV3.balanceOf(user1.address)).to.eq(2);
    });

    it("Should not allow supplying atomic tokens outside of limit [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
      } = testEnv;
      const uniswapV3Gateway = (await getUniswapV3Gateway()).connect(
        user1.signer
      );

      expect(
        uniswapV3Gateway.supplyUniswapV3(
          [
            {tokenId: 3, useAsCollateral: true},
            {tokenId: 4, useAsCollateral: true},
          ],
          user1.address,
          {
            gasLimit: 12_450_000,
          }
        )
      ).to.be.reverted;
    });

    it("Should allow trasnfering atomic tokens within of limit [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, user2],
        nUniswapV3,
      } = testEnv;
      (await getUniswapV3Gateway()).connect(user1.signer);

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
      expect(await nUniswapV3.balanceOf(user2.address)).to.be.eq(1);
    });

    it("Should not allow trasnfering atomic tokens outside of limit [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, user2],
        nUniswapV3,
      } = testEnv;
      const uniswapV3Gateway = (await getUniswapV3Gateway()).connect(
        user1.signer
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

      await uniswapV3Gateway.supplyUniswapV3(
        [
          {tokenId: 3, useAsCollateral: true},
          {tokenId: 4, useAsCollateral: true},
        ],
        user1.address,
        {
          gasLimit: 12_450_000,
        }
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
      ).to.be.reverted;
    });

    it("withdrawing atomic token should decrease the atomic token counter [ @skip-on-coverage ]", async () => {
      const {
        users: [user1, user2],
        nftPositionManager,
        nUniswapV3,
        pool,
      } = testEnv;
      (await getUniswapV3Gateway()).connect(user1.signer);

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
});
