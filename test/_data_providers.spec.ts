import {expect} from "chai";
import {ZERO_ADDRESS} from "../helpers/constants";
import {
  convertToCurrencyDecimals,
  withSaveAndVerify,
} from "../helpers/contracts-helpers";
import {WalletBalanceProvider, WalletBalanceProvider__factory} from "../types";
import {
  borrowAndValidate,
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  getFirstSigner,
  getMockIncentivesController,
  getUiIncentiveDataProviderV3,
  getUniswapV3OracleWrapper,
} from "../helpers/contracts-getters";
import {ethers} from "ethers";
import {waitForTx} from "../helpers/misc-utils";
import {
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "./helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";
import {ERC20TokenContractId} from "../helpers/types";

const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

describe("UI Contracts Tests", () => {
  context("Wallet Balance Provider", () => {
    let walletBalanceProvider: WalletBalanceProvider;

    const fixture = async () => {
      const testEnv = await loadFixture(testEnvFixture);

      walletBalanceProvider = (await withSaveAndVerify(
        new WalletBalanceProvider__factory(await getFirstSigner()),
        "WalletBalanceProvider",
        [],
        false
      )) as WalletBalanceProvider;
      return testEnv;
    };

    it("TC-ui-wallet-balance-provider-01 Test can get user's balances from all reserves", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        addressesProvider,
        users: [user1],
        dai,
      } = testEnv;
      const amount = "1000";
      // mint token
      await mintAndValidate(dai, amount, user1);
      const [tokens, balances] =
        await walletBalanceProvider.getUserWalletBalances(
          addressesProvider.address,
          user1.address
        );

      expect(balances[tokens.indexOf(dai.address)]).to.eq(
        await convertToCurrencyDecimals(dai.address, amount)
      );
    });

    it("TC-ui-wallet-balance-provider-02 Test balance for inactive reserve is 0", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        addressesProvider,
        users: [user1],
        dai,
        configurator,
      } = testEnv;
      const amount = "1000";
      // mint token
      await mintAndValidate(dai, amount, user1);

      // deactivate DAI reserve
      await configurator.setReserveActive(dai.address, false);

      const [tokens, balances] =
        await walletBalanceProvider.getUserWalletBalances(
          addressesProvider.address,
          user1.address
        );

      expect(balances[tokens.indexOf(dai.address)]).to.eq(0);
    });

    it("TC-ui-wallet-balance-provider-03 Test can get user balance for a supplied token", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        users: [user1],
        dai,
        pDai,
      } = testEnv;
      const amount = "1000";
      // mint tokens and supply
      await supplyAndValidate(dai, amount, user1, true);
      const balance = await walletBalanceProvider.balanceOf(
        user1.address,
        pDai.address
      );

      expect(balance).to.eq(
        await convertToCurrencyDecimals(dai.address, amount)
      );
    });

    it("TC-ui-wallet-balance-provider-04 Test cannot get balance for an unsupported token", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        users: [user1],
      } = testEnv;

      await expect(
        walletBalanceProvider.balanceOf(user1.address, ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_TOKEN");
    });

    it("TC-ui-wallet-balance-provider-05 Test can get user's ETH balance", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        users: [user1],
      } = testEnv;
      const balance = await walletBalanceProvider.balanceOf(
        user1.address,
        ETH_ADDRESS
      );

      expect(balance).to.eq(await user1.signer.getBalance());
    });

    it("TC-ui-wallet-balance-provider-06 Test can get user balances in batch", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        users: [user1, user2],
        dai,
        usdc,
      } = testEnv;
      const amount1 = "1000";
      const amount2 = "2000";
      // mint tokens
      await mintAndValidate(dai, amount1, user1);
      await mintAndValidate(usdc, amount2, user2);
      const balances = await walletBalanceProvider.batchBalanceOf(
        [user1.address, user2.address],
        [dai.address, usdc.address]
      );

      // response should be in the form of [user1.dai, user1.usdc, user2.dai, user2.usdc]
      expect(balances[0]).to.eq(
        await convertToCurrencyDecimals(dai.address, amount1)
      );
      expect(balances[1]).to.eq(0);
      expect(balances[2]).to.eq(0);
      expect(balances[3]).to.eq(
        await convertToCurrencyDecimals(usdc.address, amount2)
      );
    });

    it("TC-ui-wallet-balance-provider-07 Test contract cannot receive ETH", async () => {
      const testEnv = await loadFixture(fixture);
      const {deployer} = testEnv;

      await expect(
        deployer.signer.sendTransaction({
          to: walletBalanceProvider.address,
          value: ethers.utils.parseEther("1.0"),
        })
      ).to.be.revertedWith("22");
    });
  });

  context("UI Pool Data Provider", () => {
    let testEnv;

    before("Load fixture", async () => {
      testEnv = await loadFixture(testEnvFixture);
    });

    it("TC-ui-pool-data-provider-01 Test can get list of reserves", async () => {
      const {addressesProvider, poolDataProvider, pool, configurator} = testEnv;
      const expectedReservesList = await pool
        .connect(configurator.signer)
        .getReservesList();

      expect(
        await poolDataProvider.getReservesList(addressesProvider.address)
      ).to.eql(expectedReservesList);
    });

    it("TC-ui-pool-data-provider-02 Test can get auction data", async () => {
      const {
        addressesProvider,
        users: [user1, user2, user3],
        dai,
        poolDataProvider,
        pool,
        configurator,
        bayc,
        nBAYC,
      } = testEnv;
      await supplyAndValidate(bayc, "1", user1, true);
      await supplyAndValidate(dai, "1000", user2, true);
      await borrowAndValidate(dai, "1000", user1);
      await changePriceAndValidate(bayc, "1");

      // start auction
      await waitForTx(
        await pool
          .connect(user3.signer)
          .startAuction(user1.address, bayc.address, 0)
      );

      const expectedAuctionData = await pool
        .connect(configurator.signer)
        .getAuctionData(nBAYC.address, 0);

      const [[auctionData]] = await poolDataProvider.getAuctionData(
        addressesProvider.address,
        [nBAYC.address],
        [["0"]]
      );
      expect(auctionData).to.eql(expectedAuctionData);
    });

    it("TC-ui-pool-data-provider-03 Test can get UniswapV3 LP token data [ @skip-on-coverage ]", async () => {
      const {
        users: [user1],
        dai,
        weth,
        nftPositionManager,
        poolDataProvider,
        addressesProvider,
      } = testEnv;

      const userDaiAmount = await convertToCurrencyDecimals(
        dai.address,
        "10000"
      );
      const userWethAmount = await convertToCurrencyDecimals(
        weth.address,
        "10"
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
      await mintNewPosition({
        nft: nft,
        token0: dai,
        token1: weth,
        fee: fee,
        user: user1,
        tickSpacing: tickSpacing,
        lowerPrice,
        upperPrice,
        token0Amount: userDaiAmount,
        token1Amount: userWethAmount,
      });
      expect(await nftPositionManager.balanceOf(user1.address)).to.eq(1);
      const tokenId = await nft.tokenOfOwnerByIndex(user1.address, 0);

      const uniV3Oracle = await getUniswapV3OracleWrapper();
      const positionData = await uniV3Oracle.getOnchainPositionData(tokenId);

      const data = await poolDataProvider.getUniswapV3LpTokenData(
        addressesProvider.address,
        nftPositionManager.address,
        tokenId
      );

      expect(data.token0).to.eql(positionData.token0);
      expect(data.token1).to.eql(positionData.token1);
      expect(data.feeRate).to.eql(positionData.fee);
      expect(data.positionTickLower).to.eql(positionData.tickLower);
      expect(data.positionTickUpper).to.eql(positionData.tickUpper);
      expect(data.currentTick).to.eql(positionData.currentTick);
      expect(data.liquidity).to.eql(positionData.liquidity);
    });
  });

  context("UI Incentives Data Provider", () => {
    let testEnv;
    let uiIncentiveDataProvider;

    before("Load fixture and contract", async () => {
      testEnv = await loadFixture(testEnvFixture);
      uiIncentiveDataProvider = await getUiIncentiveDataProviderV3();
    });

    it("TC-ui-incentives-data-provider-01 Test can get reserve incentive data", async () => {
      const {
        addressesProvider,
        users: [user1],
        dai,
        pool,
        configurator,
      } = testEnv;
      const reservesList = await pool
        .connect(configurator.signer)
        .getReservesList();

      const [data] = await uiIncentiveDataProvider.getFullReservesIncentiveData(
        addressesProvider.address,
        user1.address
      );
      expect(data.length).to.eq(reservesList.length);

      const [daiData] = data.filter((it) => it.underlyingAsset == dai.address);

      // get reserve data for DAI
      const expectedReserveData = await pool
        .connect(configurator.signer)
        .getReserveData(dai.address);

      expect(daiData.underlyingAsset).to.eq(dai.address);
      expect(daiData.aIncentiveData.tokenAddress).to.eq(
        expectedReserveData.xTokenAddress
      );
      expect(daiData.vIncentiveData.tokenAddress).to.eq(
        expectedReserveData.variableDebtTokenAddress
      );
      expect(daiData.aIncentiveData.incentiveControllerAddress).to.eq(
        (await getMockIncentivesController()).address
      );
    });

    it("TC-ui-incentives-data-provider-02 Test can get user reserves incentive data", async () => {
      const {
        addressesProvider,
        users: [user1],
        dai,
        pool,
        configurator,
      } = testEnv;
      const reservesList = await pool
        .connect(configurator.signer)
        .getReservesList();

      const data = await uiIncentiveDataProvider.getUserReservesIncentivesData(
        addressesProvider.address,
        user1.address
      );
      expect(data.length).to.eq(reservesList.length);

      const [daiData] = data.filter((it) => it.underlyingAsset == dai.address);

      // get reserve data for DAI
      const expectedReserveData = await pool
        .connect(configurator.signer)
        .getReserveData(dai.address);

      expect(daiData.underlyingAsset).to.eq(dai.address);
      expect(daiData.xTokenIncentivesUserData.tokenAddress).to.eq(
        expectedReserveData.xTokenAddress
      );
      expect(daiData.vTokenIncentivesUserData.tokenAddress).to.eq(
        expectedReserveData.variableDebtTokenAddress
      );
    });
  });

  context("Protocol Data Provider", () => {
    let testEnv;

    before("Load fixture", async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        dai,
        users: [user1, user2],
      } = testEnv;

      // user 1 and user 2 supply some DAI
      await supplyAndValidate(dai, "10000", user1, true);
      await supplyAndValidate(dai, "5000", user2, true);
      // user 1 borrows DAI
      await borrowAndValidate(dai, "2000", user1);
    });

    it("TC-protocol-data-provider-01 Test getReservesData()", async () => {
      const {protocolDataProvider, pool, dai} = testEnv;

      const expectedReserveData = await pool.getReserveData(dai.address);
      const actualData = await protocolDataProvider.getReserveData(dai.address);

      expect(actualData.accruedToTreasuryScaled).to.eq(
        expectedReserveData.accruedToTreasury
      );
      expect(actualData.liquidityRate).to.eq(
        expectedReserveData.currentLiquidityRate
      );
      expect(actualData.variableBorrowRate).to.eq(
        expectedReserveData.currentVariableBorrowRate
      );
      expect(actualData.liquidityIndex).to.eq(
        expectedReserveData.liquidityIndex
      );
      expect(actualData.variableBorrowIndex).to.eq(
        expectedReserveData.variableBorrowIndex
      );
      expect(actualData.lastUpdateTimestamp).to.eq(
        expectedReserveData.lastUpdateTimestamp
      );
    });

    it("TC-protocol-data-provider-02 Test getXTokenTotalSupply()", async () => {
      const {protocolDataProvider, dai, pDai} = testEnv;

      const expectedTotalSupply = await pDai.totalSupply();
      const actualData = await protocolDataProvider.getXTokenTotalSupply(
        dai.address
      );

      expect(actualData).to.eq(expectedTotalSupply);
    });

    it("TC-protocol-data-provider-03 Test getTotalDebt()", async () => {
      const {protocolDataProvider, variableDebtDai, dai} = testEnv;

      const expectedTotalDebt = await variableDebtDai.totalSupply();
      const actualData = await protocolDataProvider.getTotalDebt(dai.address);

      expect(actualData).to.eq(expectedTotalDebt);
    });

    it("TC-protocol-data-provider-04 Test getAllReservesTokens()", async () => {
      const {protocolDataProvider, dai} = testEnv;

      const reservesTokens = await protocolDataProvider.getAllReservesTokens();
      const daiAddress = reservesTokens.find(
        (token: {symbol: ERC20TokenContractId}) =>
          token.symbol === ERC20TokenContractId.DAI
      )[1];

      expect(dai.address).to.eq(daiAddress);
    });

    it("TC-protocol-data-provider-05 Test getAllXTokens()", async () => {
      const {protocolDataProvider, pDai} = testEnv;

      const xTokens = await protocolDataProvider.getAllXTokens();
      const pDaiAddress = xTokens.find(
        (token: {symbol: string}) => token.symbol === "pDAI"
      )[1];

      expect(pDai.address).to.eq(pDaiAddress);
    });

    it("TC-protocol-data-provider-06 Test getReserveConfigurationData()", async () => {
      const {protocolDataProvider, configurator, weth} = testEnv;

      // Set new configuration with active turned off
      await configurator.setReserveActive(weth.address, false);

      let updatedConfiguration =
        await protocolDataProvider.getReserveConfigurationData(weth.address);
      expect(updatedConfiguration.isActive).to.be.false;

      // restore
      await configurator.setReserveActive(weth.address, true);

      updatedConfiguration =
        await protocolDataProvider.getReserveConfigurationData(weth.address);
      expect(updatedConfiguration.isActive).to.be.true;
    });

    it("TC-protocol-data-provider-07 Test getReserveCaps()", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;

      const setBorrowCap = "3000000";
      const setSupplyCap = "6000000";
      await configurator.setBorrowCap(weth.address, setBorrowCap);
      await configurator.setSupplyCap(weth.address, setSupplyCap);

      const {borrowCap: newWethBorrowCap, supplyCap: newWethSupplyCap} =
        await protocolDataProvider.getReserveCaps(weth.address);

      expect(newWethSupplyCap).to.eq(setSupplyCap);
      expect(newWethBorrowCap).to.eq(setBorrowCap);
    });

    it("TC-protocol-data-provider-08 Test getSiloedBorrowing()", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;

      await configurator.setSiloedBorrowing(weth.address, true);

      let siloedBorrowing = await protocolDataProvider.getSiloedBorrowing(
        weth.address
      );

      expect(siloedBorrowing).to.be.true;

      await configurator.setSiloedBorrowing(weth.address, false);

      siloedBorrowing = await protocolDataProvider.getSiloedBorrowing(
        weth.address
      );
      expect(siloedBorrowing).to.be.false;
    });

    it("TC-protocol-data-provider-09 Test getLiquidationProtocolFee()", async () => {
      const {configurator, protocolDataProvider, weth} = testEnv;

      const setProtocolFee = "5000";
      await configurator.setLiquidationProtocolFee(
        weth.address,
        setProtocolFee
      );

      const protocolFee = await protocolDataProvider.getLiquidationProtocolFee(
        weth.address
      );

      expect(protocolFee).to.eq(setProtocolFee);
    });

    it("TC-protocol-data-provider-10 Test getUserReserveData()", async () => {
      const {
        protocolDataProvider,
        variableDebtDai,
        dai,
        users: [user1],
      } = testEnv;

      const userDaiData = await protocolDataProvider.getUserReserveData(
        dai.address,
        user1.address
      );

      expect(userDaiData.usageAsCollateralEnabled).to.be.true;
      expect(userDaiData.scaledXTokenBalance).to.be.gte(
        await convertToCurrencyDecimals(dai.address, "10000")
      ); // supplied amount
      expect(userDaiData.currentVariableDebt).to.be.eq(
        await variableDebtDai.balanceOf(user1.address)
      );
    });

    it("TC-protocol-data-provider-11 Test getReserveTokensAddresses()", async () => {
      const {protocolDataProvider, variableDebtDai, pDai, dai} = testEnv;

      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;

      expect(variableDebtDai.address).to.eq(daiVariableDebtTokenAddress);

      const daiPTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).xTokenAddress;

      expect(pDai.address).to.eq(daiPTokenAddress);
    });

    it("TC-protocol-data-provider-12 Test getStrategyAddresses()", async () => {
      const {protocolDataProvider, pool, dai} = testEnv;

      const {
        interestRateStrategyAddress: expectedInterestRateStrategyAddress,
        auctionStrategyAddress: expectedAuctionStrategyAddress,
      } = await pool.getReserveData(dai.address);

      const {interestRateStrategyAddress, auctionStrategyAddress} =
        await protocolDataProvider.getStrategyAddresses(dai.address);

      expect(interestRateStrategyAddress).to.eq(
        expectedInterestRateStrategyAddress
      );
      expect(auctionStrategyAddress).to.eq(expectedAuctionStrategyAddress);
    });
  });
});
