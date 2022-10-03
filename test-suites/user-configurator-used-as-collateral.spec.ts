import {expect} from "chai";
import {BigNumber} from "ethers";
import {makeSuite, TestEnv} from "./helpers/make-suite";
import {
  advanceBlock,
  evmRevert,
  evmSnapshot,
  waitForTx,
} from "../deploy/helpers/misc-utils";
import {parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {ProtocolErrors, RateMode} from "../deploy/helpers/types";

const isUsingAsCollateral = (conf, id) =>
  conf
    .div(BigNumber.from(2).pow(BigNumber.from(id).mul(2).add(1)))
    .and(1)
    .gt(0);

makeSuite(
  "UserConfigurator for ERC721: check user usedAsCollateral and collaterizedBalance status",
  (testEnv: TestEnv) => {
    let snap: string;
    beforeEach(async () => {
      snap = await evmSnapshot();
    });
    afterEach(async () => {
      await evmRevert(snap);
    });

    it("check by supply and withdraw", async () => {
      const {
        bayc,
        nBAYC,
        users: [user1],
        pool,
      } = testEnv;

      const baycData = await pool.getReserveData(bayc.address);

      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );
      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );

      await waitForTx(
        await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
      );

      await waitForTx(
        await pool
          .connect(user1.signer)
          .supplyERC721(
            bayc.address,
            [{tokenId: 0, useAsCollateral: false}],
            user1.address,
            "0"
          )
      );
      let userConfig = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );

      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);
      expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.false;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .supplyERC721(
            bayc.address,
            [{tokenId: 1, useAsCollateral: true}],
            user1.address,
            "0"
          )
      );
      userConfig = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );

      expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.true;
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(1);

      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(bayc.address, [1], user1.address)
      );
      userConfig = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );

      expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.false;
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);

      await waitForTx(
        await pool
          .connect(user1.signer)
          .withdrawERC721(bayc.address, [0], user1.address)
      );
      userConfig = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );

      expect(isUsingAsCollateral(userConfig, baycData.id)).to.be.false;
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);
    });

    it("check by supply and transfer", async () => {
      const {
        bayc,
        nBAYC,
        users: [user1, user2],
        pool,
      } = testEnv;

      const baycData = await pool.getReserveData(bayc.address);

      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );

      await waitForTx(
        await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
      );

      await waitForTx(
        await pool
          .connect(user1.signer)
          .supplyERC721(
            bayc.address,
            [{tokenId: 0, useAsCollateral: true}],
            user1.address,
            "0"
          )
      );
      let user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );

      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(1);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

      await waitForTx(
        await nBAYC
          .connect(user1.signer)
          .transferFrom(user1.address, user2.address, 0)
      );

      user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

      const user2Config = BigNumber.from(
        (await pool.getUserConfiguration(user2.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user2.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user2Config, baycData.id)).to.be.false;
    });

    it("check setUserUseERC721AsCollateral", async () => {
      const {
        bayc,
        nBAYC,
        users: [user1],
        pool,
      } = testEnv;

      const baycData = await pool.getReserveData(bayc.address);

      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );
      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );
      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );

      await waitForTx(
        await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
      );

      await waitForTx(
        await pool.connect(user1.signer).supplyERC721(
          bayc.address,
          [
            {tokenId: 0, useAsCollateral: false},
            {tokenId: 1, useAsCollateral: false},
            {tokenId: 2, useAsCollateral: false},
          ],
          user1.address,
          "0"
        )
      );
      let user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );

      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(bayc.address, [0, 1, 2], true)
      );
      user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(3);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(bayc.address, [0, 1], false)
      );
      user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(1);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

      await waitForTx(
        await pool
          .connect(user1.signer)
          .setUserUseERC721AsCollateral(bayc.address, [2], false)
      );
      user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;
    });

    it("check liquidation", async () => {
      const {
        weth,
        bayc,
        nBAYC,
        users: [user1, depositor, liquidator],
        pool,
        addressesProvider,
        oracle,
      } = testEnv;

      await waitForTx(await addressesProvider.setPriceOracle(oracle.address));
      await oracle.setAssetPrice(bayc.address, parseEther("40"));

      //1 depositor deposit 20 eth
      await weth.connect(depositor.signer)["mint(uint256)"](parseEther("20"));
      await weth
        .connect(depositor.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(depositor.signer)
        .supply(weth.address, parseEther("20"), depositor.address, 0);

      //2 user1 supply bayc and borrow 10 eth
      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );
      await waitForTx(
        await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
      );
      await waitForTx(
        await pool
          .connect(user1.signer)
          .supplyERC721(
            bayc.address,
            [{tokenId: 0, useAsCollateral: true}],
            user1.address,
            "0"
          )
      );
      await waitForTx(
        await pool
          .connect(user1.signer)
          .borrow(
            weth.address,
            parseEther("10"),
            RateMode.Variable,
            0,
            user1.address
          )
      );

      //3 bayc price drop
      await oracle.setAssetPrice(bayc.address, parseEther("10"));

      //4 user1 try to liquidate himself
      await weth.connect(user1.signer)["mint(uint256)"](parseEther("20"));
      await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);

      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .startAuction(user1.address, bayc.address, 0)
      );

      await expect(
        pool
          .connect(user1.signer)
          .liquidationERC721(
            bayc.address,
            weth.address,
            user1.address,
            0,
            parseEther("20"),
            true
          )
      ).to.be.revertedWith(ProtocolErrors.LIQUIDATOR_CAN_NOT_BE_SELF);

      //4 liquidator liquidate user1
      await weth.connect(liquidator.signer)["mint(uint256)"](parseEther("20"));
      await weth
        .connect(liquidator.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      const {startTime, tickLength} = await pool.getAuctionData(
        nBAYC.address,
        0
      );
      // price drops to 1 * floor price
      await advanceBlock(
        startTime.add(tickLength.mul(BigNumber.from(40))).toNumber()
      );
      await waitForTx(
        await pool
          .connect(liquidator.signer)
          .liquidationERC721(
            bayc.address,
            weth.address,
            user1.address,
            0,
            parseEther("20"),
            true,
            {gasLimit: 5000000}
          )
      );

      //5 check user1's config
      const baycData = await pool.getReserveData(bayc.address);
      const user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

      //6 check liquidator's config
      const liquidatorConfig = BigNumber.from(
        (await pool.getUserConfiguration(liquidator.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(liquidator.address)).to.be.equal(
        0
      );
      expect(isUsingAsCollateral(liquidatorConfig, baycData.id)).to.be.false;
    });

    it("special case for supply and transfer", async () => {
      const {
        bayc,
        nBAYC,
        users: [user1, user2],
        pool,
      } = testEnv;

      const baycData = await pool.getReserveData(bayc.address);

      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );
      await waitForTx(
        await bayc.connect(user1.signer)["mint(address)"](user1.address)
      );
      await waitForTx(
        await bayc.connect(user2.signer)["mint(address)"](user2.address)
      );

      await waitForTx(
        await bayc.connect(user1.signer).setApprovalForAll(pool.address, true)
      );
      await waitForTx(
        await bayc.connect(user2.signer).setApprovalForAll(pool.address, true)
      );

      await waitForTx(
        await pool.connect(user1.signer).supplyERC721(
          bayc.address,
          [
            {tokenId: 0, useAsCollateral: false},
            {tokenId: 1, useAsCollateral: true},
          ],
          user1.address,
          "0"
        )
      );
      await waitForTx(
        await pool
          .connect(user2.signer)
          .supplyERC721(
            bayc.address,
            [{tokenId: 2, useAsCollateral: false}],
            user2.address,
            "0"
          )
      );

      let user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(1);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.true;

      let user2Config = BigNumber.from(
        (await pool.getUserConfiguration(user2.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user2.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user2Config, baycData.id)).to.be.false;

      await waitForTx(
        await nBAYC
          .connect(user1.signer)
          .transferFrom(user1.address, user2.address, 1)
      );

      user1Config = BigNumber.from(
        (await pool.getUserConfiguration(user1.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user1.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user1Config, baycData.id)).to.be.false;

      user2Config = BigNumber.from(
        (await pool.getUserConfiguration(user2.address)).data
      );
      expect(await nBAYC.collaterizedBalanceOf(user2.address)).to.be.equal(0);
      expect(isUsingAsCollateral(user2Config, baycData.id)).to.be.false;
    });
  }
);
