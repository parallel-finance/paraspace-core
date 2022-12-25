import chai from "chai";
import {BigNumber, BigNumberish} from "ethers";
import {formatEther, parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT, PERCENTAGE_FACTOR, WAD} from "../../helpers/constants";
import {
  getAggregator,
  getParaSpaceOracle,
  getPToken,
  getPoolProxy,
  getPoolAddressesProvider,
  getProtocolDataProvider,
  getUiPoolDataProvider,
  getVariableDebtToken,
  getNonfungiblePositionManager,
  getUniswapV3OracleWrapper,
  getNToken,
} from "../../helpers/contracts-getters";
import {
  convertToCurrencyDecimals,
  getEthersSigners,
  isBorrowing,
  isUsingAsCollateral,
} from "../../helpers/contracts-helpers";
import {waitForTx} from "../../helpers/misc-utils";
import {
  ERC20,
  ERC721,
  INonfungiblePositionManager,
  IPool,
  MintableERC20,
  MintableERC721,
  NToken,
  StETHMocked,
  WETH9Mocked,
} from "../../types";
import {SignerWithAddress} from "./make-suite";
import {getUserPositions} from "./utils/positions";
import {convertFromCurrencyDecimals} from "./utils/helpers";
import "../helpers/utils/wadraymath";
import {XTokenType} from "../../helpers/types";
import {almostEqual} from "../helpers/uniswapv3-helper";

const {expect} = chai;
type SupportedAsset =
  | MintableERC20
  | MintableERC721
  | WETH9Mocked
  | StETHMocked
  | INonfungiblePositionManager;

function isERC20(token: SupportedAsset): token is MintableERC20 | WETH9Mocked {
  return "decimals" in token;
}

export const mintAndValidate = async (
  token: SupportedAsset,
  amount: string,
  user: SignerWithAddress
) => {
  const isNFT = !isERC20(token);
  const nftIdsToUse = isNFT ? [...Array(+amount).keys()] : null;
  const initialBalance = await token.balanceOf(user.address);

  const amountToMint = isNFT
    ? amount
    : await convertToCurrencyDecimals(token.address, amount);
  if (isNFT) {
    for (const i in nftIdsToUse) {
      await waitForTx(
        await token.connect(user.signer)["mint(address)"](user.address)
      );
      expect(await (token as ERC721).ownerOf(i)).to.be.equal(user.address);
    }
  } else {
    await waitForTx(
      await token
        .connect(user.signer)
        ["mint(address,uint256)"](user.address, amountToMint)
    );
  }
  // check user balance is the expected
  const balance = await token.balanceOf(user.address);
  expect(balance).to.be.equal(initialBalance.add(amountToMint));
};

export const supplyAndValidate = async (
  token: SupportedAsset,
  amount: string,
  user: SignerWithAddress,
  mintTokens?: boolean,
  mintAmount?: string
) => {
  const isNFT = !isERC20(token);
  const amountInBaseUnits = isNFT
    ? BigNumber.from(amount)
    : await convertToCurrencyDecimals(token.address, amount);
  const pool = await getPoolProxy();
  const protocolDataProvider = await getProtocolDataProvider();
  const paraSpaceOracle = await getParaSpaceOracle();
  const deployer = await getDeployer();
  const nftIdsToUse = isNFT ? [...Array(+amount).keys()] : null;

  if (mintTokens) {
    const amountToMint = mintAmount != null ? mintAmount : amount;
    await mintAndValidate(token, amountToMint, user);
  }

  // approve protocol to access user wallet
  await approveTnx(token, isNFT, pool, user);

  const pTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).xTokenAddress;
  const pToken = await getPToken(pTokenAddress);

  const assetPrice = await paraSpaceOracle
    .connect(deployer.signer)
    .getAssetPrice(token.address);
  const tokenBalanceBefore = await token.balanceOf(user.address);
  const pTokenBalanceBefore = await pToken.balanceOf(user.address);
  const totalCollateralBefore = (await pool.getUserAccountData(user.address))
    .totalCollateralBase;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const healthFactorBefore = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactorBefore = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getXTokenTotalSupply(
    token.address
  );

  // supply token
  if (isNFT) {
    for (let i = 0; i < +amount; i++) {
      await pool
        .connect(user.signer)
        .supplyERC721(
          token.address,
          [{tokenId: nftIdsToUse ? [i] : 0, useAsCollateral: true}],
          user.address,
          "0"
        );
    }
  } else {
    await waitForTx(
      await pool
        .connect(user.signer)
        .supply(token.address, amountInBaseUnits, user.address, "0")
    );
  }

  // check Token balance was subtracted the supplied amount
  const tokenBalance = await token.balanceOf(user.address);
  expect(tokenBalance).to.be.equal(tokenBalanceBefore.sub(amountInBaseUnits));

  // check pToken balance increased in the deposited amount
  const pTokenBalance = await pToken.balanceOf(user.address);
  expect(pTokenBalance).to.be.equal(pTokenBalanceBefore.add(amountInBaseUnits));

  // asset is used as collateral, so total collateral increases in supplied amount
  const totalCollateral = (await pool.getUserAccountData(user.address))
    .totalCollateralBase;
  const depositedAmountInBaseUnits = BigNumber.from(amount).mul(assetPrice);
  almostEqual(
    totalCollateral,
    totalCollateralBefore.add(depositedAmountInBaseUnits)
  );

  const ltv = (await pool.getUserAccountData(user.address)).ltv;
  assertAlmostEqual(ltv, await calculateExpectedLTV(user), 1);

  // available to borrow should increase in [supplied amount * token's LTV ratio]
  const ltvRatio = (
    await protocolDataProvider.getReserveConfigurationData(token.address)
  ).ltv;
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const expectedAvailableToBorrow = availableToBorrowBefore.add(
    depositedAmountInBaseUnits.percentMul(ltvRatio)
  );
  assertAlmostEqual(
    availableToBorrow,
    expectedAvailableToBorrow,
    expectedAvailableToBorrow.div(10000).mul(4)
  );

  // TVL must increase in supplied amount
  const tvl = await protocolDataProvider.getXTokenTotalSupply(token.address);
  assertAlmostEqual(tvl, tvlBefore.add(amountInBaseUnits));

  // health factor should improve - but only if user had some borrow position
  const totalDebt = (await pool.getUserAccountData(user.address)).totalDebtBase;
  const healthFactor = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactor = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  if (totalDebt > BigNumber.from(0)) {
    if (isNFT) {
      expect(erc721HealthFactor).to.be.gt(erc721HealthFactorBefore);
      expect(healthFactor).to.equal(healthFactorBefore);
    } else {
      expect(healthFactor).to.be.gt(healthFactorBefore);
      expect(erc721HealthFactor).to.be.gte(erc721HealthFactorBefore);
    }
  } else {
    expect(healthFactor).to.equal(healthFactorBefore);
    expect(erc721HealthFactor).to.equal(erc721HealthFactorBefore);
  }
  await assertHealthFactorCalculation(user);
};

export const borrowAndValidate = async (
  token: SupportedAsset,
  amount: string,
  user: SignerWithAddress
) => {
  const amountInBaseUnits = await convertToCurrencyDecimals(
    token.address,
    amount
  );
  const paraSpaceOracle = await getParaSpaceOracle();
  const pool = await getPoolProxy();
  const deployer = await getDeployer();

  // approve protocol to access user wallet
  await approveTnx(token, false, pool, user);

  const protocolDataProvider = await getProtocolDataProvider();
  const debtTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).variableDebtTokenAddress;
  const debtToken = await getVariableDebtToken(debtTokenAddress);

  const assetPrice = await paraSpaceOracle
    .connect(deployer.signer)
    .getAssetPrice(token.address);
  const tokenBalanceBefore = await token.balanceOf(user.address);
  const debtTokenBalanceBefore = await debtToken.balanceOf(user.address);
  const ltvBefore = (await pool.getUserAccountData(user.address)).ltv;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const healthFactorBefore = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactorBefore = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getXTokenTotalSupply(
    token.address
  );
  const totalDebtBefore = (await pool.getUserAccountData(user.address))
    .totalDebtBase;

  // borrow erc-20
  await waitForTx(
    await pool
      .connect(user.signer)
      .borrow(token.address, amountInBaseUnits, "0", user.address, {
        gasLimit: 5000000,
      })
  );

  // check Token balance increased in the borrowed amount
  const tokenBalance = await token.balanceOf(user.address);
  expect(tokenBalance).to.be.equal(tokenBalanceBefore.add(amountInBaseUnits));

  // check debtToken balance increased in borrowed amount
  const debtTokenBalance = await debtToken.balanceOf(user.address);
  assertAlmostEqual(
    debtTokenBalance,
    debtTokenBalanceBefore.add(amountInBaseUnits)
  );

  // LTV is based on my collateral, not on my borrow position
  const ltv = (await pool.getUserAccountData(user.address)).ltv;
  expect(ltv).to.equal(ltvBefore);

  // available to borrow should decrease in borrowed amount
  const borrowedAmountInBaseUnits = BigNumber.from(amount).mul(assetPrice);
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  assertAlmostEqual(
    availableToBorrow,
    availableToBorrowBefore.sub(borrowedAmountInBaseUnits)
  );

  // TVL should stay the same
  const tvl = await protocolDataProvider.getXTokenTotalSupply(token.address);
  assertAlmostEqual(tvl, tvlBefore);

  // total debt increased in the borrowed amount
  const totalDebt = (await pool.getUserAccountData(user.address)).totalDebtBase;
  assertAlmostEqual(totalDebt, totalDebtBefore.add(borrowedAmountInBaseUnits));

  // health factor should have worsen
  const healthFactor = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactor = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  expect(healthFactor).to.be.lt(healthFactorBefore);
  expect(erc721HealthFactor).to.be.lte(erc721HealthFactorBefore);

  await assertHealthFactorCalculation(user);
};

export const repayAndValidate = async (
  token: SupportedAsset,
  amount: string,
  user: SignerWithAddress
) => {
  const amountInBaseUnits = await convertToCurrencyDecimals(
    token.address,
    amount
  );
  const paraSpaceOracle = await getParaSpaceOracle();
  const pool = await getPoolProxy();
  const deployer = await getDeployer();

  // approve protocol to access user wallet
  await approveTnx(token, false, pool, user);

  const protocolDataProvider = await getProtocolDataProvider();
  const pTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).xTokenAddress;
  const pToken = await getPToken(pTokenAddress);
  const debtTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).variableDebtTokenAddress;
  const debtToken = await getVariableDebtToken(debtTokenAddress);

  const assetPrice = await paraSpaceOracle
    .connect(deployer.signer)
    .getAssetPrice(token.address);
  const tokenBalanceBefore = await token.balanceOf(user.address);
  const pTokenBalanceBefore = await pToken.balanceOf(user.address);
  const debtTokenBalanceBefore = await debtToken.balanceOf(user.address);
  const ltvBefore = (await pool.getUserAccountData(user.address)).ltv;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const healthFactorBefore = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactorBefore = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getXTokenTotalSupply(
    token.address
  );
  const totalDebtBefore = (await pool.getUserAccountData(user.address))
    .totalDebtBase;

  // repay erc-20
  await waitForTx(
    await pool
      .connect(user.signer)
      .repay(token.address, amountInBaseUnits, user.address)
  );

  // check Token balance decreased in the repaid amount
  const tokenBalance = await token.balanceOf(user.address);
  expect(tokenBalance).to.be.equal(tokenBalanceBefore.sub(amountInBaseUnits));

  // check pToken balance stays the same
  const pTokenBalance = await pToken.balanceOf(user.address);
  assertAlmostEqual(pTokenBalance, pTokenBalanceBefore);

  // check debtToken balance decreased in repaid amount
  const debtTokenBalance = await debtToken.balanceOf(user.address);
  assertAlmostEqual(
    debtTokenBalance,
    debtTokenBalanceBefore.sub(amountInBaseUnits)
  );

  // available to borrow should have increased, max in repaid amount
  const repaidAmountInBaseUnits = BigNumber.from(amount).mul(assetPrice);
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  expect(availableToBorrow).to.be.lte(
    availableToBorrowBefore.add(repaidAmountInBaseUnits)
  );

  // TVL should stay the same
  const tvl = await protocolDataProvider.getXTokenTotalSupply(token.address);
  assertAlmostEqual(tvl, tvlBefore);

  // LTV is based on my collateral, should stay the same
  const ltv = (await pool.getUserAccountData(user.address)).ltv;
  expect(ltv).to.equal(ltvBefore);

  // total debt decreased in the repaid amount
  const totalDebt = (await pool.getUserAccountData(user.address)).totalDebtBase;
  assertAlmostEqual(totalDebt, totalDebtBefore.sub(repaidAmountInBaseUnits));

  // health factor should have improved
  const healthFactor = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactor = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  expect(healthFactor).to.be.gt(healthFactorBefore);
  expect(erc721HealthFactor).to.be.gte(erc721HealthFactorBefore);
  await assertHealthFactorCalculation(user);
};

export const withdrawAndValidate = async (
  token: SupportedAsset,
  amount: string,
  user: SignerWithAddress,
  nftId?: number
) => {
  const isNFT = !isERC20(token);
  const amountInCurrencyUnits = isNFT
    ? BigNumber.from(amount)
    : await convertToCurrencyDecimals(token.address, amount);
  const amountInBaseUnits = isNFT ? BigNumber.from(amount) : parseEther(amount);

  const pool = await getPoolProxy();
  const deployer = await getDeployer();
  const paraSpaceOracle = await getParaSpaceOracle();

  const protocolDataProvider = await getProtocolDataProvider();
  const pTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).xTokenAddress;
  const pToken = await getPToken(pTokenAddress);
  const assetPrice =
    nftId != undefined && (await token.symbol()) == "UNI-V3-POS"
      ? await (await getUniswapV3OracleWrapper()).getTokenPrice(nftId)
      : await paraSpaceOracle
          .connect(deployer.signer)
          .getAssetPrice(token.address);
  const tokenBalanceBefore = await token.balanceOf(user.address);
  const pTokenBalanceBefore = await pToken.balanceOf(user.address);
  const ltvBefore = (await pool.getUserAccountData(user.address)).ltv;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const totalCollateralBefore = (await pool.getUserAccountData(user.address))
    .totalCollateralBase;
  const healthFactorBefore = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactorBefore = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getXTokenTotalSupply(
    token.address
  );
  const totalDebtBefore = (await pool.getUserAccountData(user.address))
    .totalDebtBase;

  // find out whether the asset is in collateral
  const wasCollateral = await isAssetInCollateral(user, token.address, nftId);

  // withdraw asset
  if (isNFT) {
    await waitForTx(
      await pool
        .connect(user.signer)
        .withdrawERC721(
          token.address,
          [nftId != null ? nftId : 0],
          user.address
        )
    );
  } else {
    await waitForTx(
      await pool
        .connect(user.signer)
        .withdraw(token.address, amountInCurrencyUnits, user.address)
    );
  }

  // check Token balance increased in the withdrawn amount
  const tokenBalance = await token.balanceOf(user.address);
  expect(tokenBalance).to.be.equal(
    tokenBalanceBefore.add(amountInCurrencyUnits)
  );

  // check pToken balance decreased in the withdrawn amount
  const pTokenBalance = await pToken.balanceOf(user.address);
  assertAlmostEqual(
    pTokenBalance,
    pTokenBalanceBefore.sub(amountInCurrencyUnits)
  );

  // TVL decreased in the withdrawn amount
  const tvl = await protocolDataProvider.getXTokenTotalSupply(token.address);
  assertAlmostEqual(tvl, tvlBefore.sub(amountInBaseUnits));

  // available to borrow decreased in [withdrawn amount * token's LTV ratio], but only if was collateral
  const withdrawnAmountInBaseUnits =
    (await token.symbol()) != "UNI-V3-POS"
      ? BigNumber.from(
          (+amountInBaseUnits * +formatEther(assetPrice)).toString()
        )
      : parseEther((+amountInBaseUnits * +formatEther(assetPrice)).toString());
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  if (wasCollateral) {
    const ltvRatio = (
      await protocolDataProvider.getReserveConfigurationData(token.address)
    ).ltv;
    assertAlmostEqual(
      availableToBorrow,
      availableToBorrowBefore.sub(
        withdrawnAmountInBaseUnits.mul(ltvRatio).div(10000)
      )
    );
  } else {
    assertAlmostEqual(availableToBorrow, availableToBorrowBefore);
  }

  // totalDebt should've stayed the same
  const totalDebt = (await pool.getUserAccountData(user.address)).totalDebtBase;
  assertAlmostEqual(totalDebt, totalDebtBefore);

  // LTV decreased, but only if asset was collateral
  const ltv = (await pool.getUserAccountData(user.address)).ltv;
  if (wasCollateral) {
    expect(ltv).to.be.equal(await calculateExpectedLTV(user));
  } else {
    expect(ltv).to.equal(ltvBefore);
  }

  // if asset was used as collateral, total collateral decreases in withdrawn amount
  const totalCollateral = (await pool.getUserAccountData(user.address))
    .totalCollateralBase;
  if (wasCollateral) {
    assertAlmostEqual(
      totalCollateral,
      totalCollateralBefore.sub(withdrawnAmountInBaseUnits)
    );
  } else {
    assertAlmostEqual(totalCollateral, totalCollateralBefore);
  }

  // health factor should have worsen, but only if was collateral and user had some borrow position
  const healthFactor = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactor = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  if (wasCollateral && totalDebt > BigNumber.from(0)) {
    expect(healthFactor).to.be.lt(healthFactorBefore);
    expect(erc721HealthFactor).to.be.lte(erc721HealthFactorBefore);
  } else {
    assertAlmostEqual(healthFactor, healthFactorBefore); // only slightly changed due to interests
    assertAlmostEqual(erc721HealthFactor, erc721HealthFactorBefore);
  }
  await assertHealthFactorCalculation(user);
};

export interface LiquidationValidationData {
  borrower: SignerWithAddress;
  isAuctioned: boolean;
  collateralToken: SupportedAsset;
  liquidationToken: SupportedAsset;
  collateralReserveId: BigNumberish;
  liquidationReserveId: BigNumberish;
  receiveXToken: boolean;
  isNFT: boolean;
  liquidationAmount: BigNumber;
  availableToBorrow: BigNumber;
  erc721HealthFactor: BigNumber;
  healthFactor: BigNumber;
  totalCollateral: BigNumber;
  totalDebt: BigNumber;
  collateralTokenTVL: BigNumber;
  liquidatorCollateralTokenBalance: BigNumber;
  liquidatorCollateralXTokenBalance: BigNumber;
  liquidatorLiquidationAssetBalance: BigNumber;
  liquidatorLiquidationAssetPTokenBalance: BigNumber;
  borrowerCollateralTokenBalance: BigNumber;
  borrowerCollateralXTokenBalance: BigNumber;
  borrowerLiquidationTokenBalance: BigNumber;
  borrowerLiquidationDebtTokenBalance: BigNumber;
  borrowerLiquidationPTokenBalance: BigNumber;
  liquidationThreshold: BigNumber;
  borrowerConfig: BigNumber;
  liquidationBonus: BigNumber;
  liquidationProtocolFeePercentage: BigNumber;
  hasMoreCollateral: boolean;
  ltv: BigNumber;
  liquidationAssetPrice: BigNumber;
  collateralAssetAuctionPrice: BigNumber;
  collateralAssetPrice: BigNumber;
  collateralAssetUnit: BigNumber;
  liquidationAssetUnit: BigNumber;
}

const checkBeforeLiquidation = async (before: LiquidationValidationData) => {
  // upon liquidation, user should not be available to borrow more
  expect(before.availableToBorrow).to.equal(0);
  if (before.isNFT) {
    const recoveryHealthFactor = await (
      await getPoolProxy()
    ).AUCTION_RECOVERY_HEALTH_FACTOR();
    // upon NFT liquidation, NFT health factor should be below RECOVERY_HF
    expect(before.erc721HealthFactor).to.be.lt(recoveryHealthFactor);
  } else {
    // upon liquidation, health factor should be below 1
    expect(before.healthFactor).to.be.lt(parseEther("1"));
    // for ERC20, the asset used for liquidation must be borrowed by borrower
  }
};

const checkAfterLiquidationERC20 = async (
  before: LiquidationValidationData,
  after: LiquidationValidationData
) => {
  const maxDebtThatCouldBeCovered = before.liquidationAmount.gte(
    before.borrowerLiquidationDebtTokenBalance
  )
    ? before.borrowerLiquidationDebtTokenBalance
    : before.liquidationAmount;

  const closeFactor =
    before.healthFactor > parseEther("0.95")
      ? BigNumber.from("5000")
      : BigNumber.from("10000");

  const maxCollateralAmountThatCouldBeLiquidated = maxDebtThatCouldBeCovered
    .percentMul(closeFactor)
    .mul(before.liquidationAssetPrice)
    .mul(before.collateralAssetUnit)
    .div(before.collateralAssetPrice.mul(before.liquidationAssetUnit))
    .percentMul(before.liquidationBonus);

  const collateralAmountToLiquidateWithBonus =
    maxCollateralAmountThatCouldBeLiquidated.lte(
      before.borrowerCollateralXTokenBalance
    )
      ? maxCollateralAmountThatCouldBeLiquidated
      : before.borrowerCollateralXTokenBalance;

  const liquidationAmountToBeUsed = collateralAmountToLiquidateWithBonus
    .mul(before.collateralAssetPrice)
    .mul(before.liquidationAssetUnit)
    .div(before.liquidationAssetPrice.mul(before.collateralAssetUnit))
    .percentDiv(before.liquidationBonus);

  // protocol fee % is taken from the bonus
  const liquidationBonus = collateralAmountToLiquidateWithBonus.sub(
    collateralAmountToLiquidateWithBonus.percentDiv(before.liquidationBonus)
  );
  const liquidationProtocolFee = before.liquidationProtocolFeePercentage.gt(0)
    ? liquidationBonus.percentMul(before.liquidationProtocolFeePercentage)
    : BigNumber.from(0);

  if (
    liquidationAmountToBeUsed.gte(before.borrowerLiquidationDebtTokenBalance)
  ) {
    expect(isBorrowing(before.borrowerConfig, before.liquidationReserveId)).to
      .be.true;
    expect(isBorrowing(after.borrowerConfig, after.liquidationReserveId)).to.be
      .false;
  }

  if (
    collateralAmountToLiquidateWithBonus.gte(
      before.borrowerCollateralXTokenBalance
    )
  ) {
    expect(
      isUsingAsCollateral(before.borrowerConfig, before.collateralReserveId)
    ).to.be.true;
    expect(isUsingAsCollateral(after.borrowerConfig, after.collateralReserveId))
      .to.be.false;
  }

  // borrower's liquidated token balance in wallet is the same
  expect(after.borrowerCollateralTokenBalance).equal(
    before.borrowerCollateralTokenBalance
  );

  // borrower's collateral balance is subtracted collateralAmountToLiquidateWithBonus
  assertAlmostEqual(
    after.borrowerCollateralXTokenBalance,
    before.borrowerCollateralXTokenBalance.sub(
      collateralAmountToLiquidateWithBonus
    ),
    BigNumber.from(liquidationAmountToBeUsed).div(10000).mul(2) // allow 0.002% interest error
  );

  // borrower debtToken balance is subtracted liquidationAmountToBeUsed
  assertAlmostEqual(
    after.borrowerLiquidationDebtTokenBalance,
    before.borrowerLiquidationDebtTokenBalance.sub(liquidationAmountToBeUsed),
    BigNumber.from(liquidationAmountToBeUsed).div(10000).mul(2) // allow 0.002% interest error
  );

  if (before.receiveXToken) {
    // liquidator's liquidation token balance is subtracted the amount used
    assertAlmostEqual(
      after.liquidatorLiquidationAssetBalance,
      before.liquidatorLiquidationAssetBalance.sub(liquidationAmountToBeUsed)
    );
    // liquidator's collateral pToken balance is incremented in collateralAmountToLiquidateWithBonus
    //NOTE: no liquidation protocol fee for now
    assertAlmostEqual(
      after.liquidatorCollateralXTokenBalance,
      before.liquidatorCollateralXTokenBalance.add(
        collateralAmountToLiquidateWithBonus.sub(liquidationProtocolFee)
      ),
      BigNumber.from(collateralAmountToLiquidateWithBonus).div(10000).mul(2) // allow 0.002% interest error
    );
    // Collateral token TVL stays the same
    assertAlmostEqual(after.collateralTokenTVL, before.collateralTokenTVL);
  } else {
    if (
      (await before.liquidationToken.address) ==
      (await before.collateralToken.address)
    ) {
      assertAlmostEqual(
        after.liquidatorCollateralTokenBalance,
        before.liquidatorCollateralTokenBalance.add(
          liquidationBonus.sub(liquidationProtocolFee)
        )
      );
    } else {
      assertAlmostEqual(
        after.liquidatorCollateralTokenBalance,
        before.liquidatorCollateralTokenBalance.add(
          collateralAmountToLiquidateWithBonus.sub(liquidationProtocolFee)
        )
      );
    }

    // Collateral token TVL decreased in collateralAmountToLiquidateWithBonus
    assertAlmostEqual(
      after.collateralTokenTVL,
      before.collateralTokenTVL.sub(collateralAmountToLiquidateWithBonus)
    );
  }

  // liquidator's liquidation pToken balance stays the same
  assertAlmostEqual(
    after.liquidatorLiquidationAssetPTokenBalance,
    before.liquidatorLiquidationAssetPTokenBalance
  );

  assertAlmostEqual(after.ltv, await calculateExpectedLTV(after.borrower), 1);

  // borrower's total collateral is decremented in collateralAmountToLiquidateWithBonus
  assertAlmostEqual(
    after.totalCollateral,
    before.totalCollateral.sub(
      collateralAmountToLiquidateWithBonus.wadMul(before.collateralAssetPrice)
    )
  );

  // if there's no more collateral, then health factor should be 0
  if (!after.hasMoreCollateral) {
    expect(after.erc721HealthFactor).to.equal(0);
    expect(after.healthFactor).to.equal(0);
  }
  await assertHealthFactorCalculation(after.borrower);

  // After being liquidated, borrower's available to borrow should now increase, unless health factor is still below 1
  if (after.healthFactor.lt(parseEther("1"))) {
    expect(after.availableToBorrow).to.equal(0);
  } else {
    expect(after.availableToBorrow).to.be.gte(before.availableToBorrow);
  }

  // Borrower's total debt is decremented in the repaid amount
  assertAlmostEqual(
    after.totalDebt,
    before.totalDebt.sub(
      liquidationAmountToBeUsed.wadMul(before.liquidationAssetPrice)
    )
  );
};

const checkAfterLiquidateERC721 = async (
  before: LiquidationValidationData,
  after: LiquidationValidationData
) => {
  // auction should've ended
  expect(after.isAuctioned).to.be.false;

  // since we just do dutch auction + collateral swap so there is not discount
  const discountedNFTPriceInLiquidationAsset =
    before.collateralAssetAuctionPrice
      .wadDiv(before.liquidationAssetPrice)
      .percentDiv(before.liquidationBonus);
  // borrower's collateral token balance in wallet is the same
  expect(after.borrowerCollateralTokenBalance).equal(
    before.borrowerCollateralTokenBalance
  );

  // borrower looses the NFT in collateral
  expect(after.borrowerCollateralXTokenBalance).to.eq(
    before.borrowerCollateralXTokenBalance.sub(1)
  );

  // none of the borrower's has been repaid
  // all liquidationAmount will result into borrower's supplies
  const excessFundsInLiquidationAssetUnits =
    discountedNFTPriceInLiquidationAsset;

  // borrower liquidation token balance is the same
  assertAlmostEqual(
    after.borrowerLiquidationTokenBalance,
    before.borrowerLiquidationTokenBalance
  );
  // borrower liquidation debt token balance is not decreased because no repay happened
  assertAlmostEqual(
    after.borrowerLiquidationDebtTokenBalance,
    before.borrowerLiquidationDebtTokenBalance
  );
  expect(
    await isAssetInCollateral(after.borrower, after.liquidationToken.address)
  ).to.be.true;

  // supply to the protocol on behalf of the borrower
  // borrower liquidation pToken balance is incremented with the excess
  assertAlmostEqual(
    after.borrowerLiquidationPTokenBalance,
    before.borrowerLiquidationPTokenBalance.add(
      excessFundsInLiquidationAssetUnits
    )
  );

  expect(
    await isAssetInCollateral(after.borrower, after.liquidationToken.address)
  ).to.be.true;

  if (before.receiveXToken) {
    // liquidator's collateral token balance stays the same
    expect(after.liquidatorCollateralTokenBalance).to.eq(
      before.liquidatorCollateralTokenBalance
    );
    // liquidator's pToken balance adds the NFT
    expect(after.liquidatorCollateralXTokenBalance).to.eq(
      before.liquidatorCollateralXTokenBalance.add(1)
    );
    // Collateral token TVL stays the same
    assertAlmostEqual(after.collateralTokenTVL, before.collateralTokenTVL);
  } else {
    // liquidator's collateral token balance is incremented in 1 (gets the NFT)
    expect(after.liquidatorCollateralTokenBalance).to.eq(
      before.liquidatorCollateralTokenBalance.add(1)
    );
    // liquidator's collateral pToken balance stays the same
    assertAlmostEqual(
      after.liquidatorCollateralXTokenBalance,
      before.liquidatorCollateralXTokenBalance
    );
    // Collateral token TVL is subtracted the liquidated NFT
    expect(after.collateralTokenTVL).to.equal(before.collateralTokenTVL.sub(1));
  }

  expect(after.ltv).to.be.equal(await calculateExpectedLTV(after.borrower));

  // if there's no more collateral, then health factor should be 0
  if (!after.hasMoreCollateral) {
    expect(after.erc721HealthFactor).to.equal(0);
    expect(after.healthFactor).to.equal(0);
  }
  await assertHealthFactorCalculation(after.borrower);

  // After being liquidated, borrower's available to borrow should now increase, unless health factor is still below 1
  if (after.healthFactor.lt(parseEther("1"))) {
    expect(after.availableToBorrow).to.equal(0);
  } else {
    expect(after.availableToBorrow).to.be.gt(before.availableToBorrow);
  }

  assertAlmostEqual(
    after.totalCollateral
      .sub(
        before.collateralAssetAuctionPrice.percentDiv(before.liquidationBonus)
      )
      .add(before.collateralAssetPrice),
    before.totalCollateral
  );

  // total debt should stay the same
  assertAlmostEqual(after.totalDebt, before.totalDebt);
};

export const liquidateAndValidate = async (
  collateralToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveXToken: boolean,
  nftId?: number
): Promise<{
  before: LiquidationValidationData;
  after: LiquidationValidationData;
}> => {
  const isNFT = !isERC20(collateralToken);

  if (isNFT) {
    const poolAddressesProvider = await getPoolAddressesProvider();
    expect(liquidationToken.address).to.be.eq(
      await poolAddressesProvider.getWETH()
    );
    return await liquidateAndValidateERC721(
      collateralToken,
      liquidationToken,
      amount,
      liquidator,
      borrower,
      receiveXToken,
      nftId
    );
  } else {
    return await liquidateAndValidateERC20(
      collateralToken,
      liquidationToken,
      amount,
      liquidator,
      borrower,
      receiveXToken
    );
  }
};

const fetchLiquidationData = async (
  collateralToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveXToken: boolean,
  nftId?: number
): Promise<LiquidationValidationData> => {
  const isNFT = !isERC20(collateralToken);
  const pool = await getPoolProxy();
  const protocolDataProvider = await getProtocolDataProvider();

  const collateralXTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(
      collateralToken.address
    )
  ).xTokenAddress;
  const collateralReserveId = (
    await pool.getReserveData(collateralToken.address)
  ).id;
  const collateralXToken = isNFT
    ? await getNToken(collateralXTokenAddress)
    : await getPToken(collateralXTokenAddress);
  const liquidationPTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(
      liquidationToken.address
    )
  ).xTokenAddress;
  const liquidationPToken = await getPToken(liquidationPTokenAddress);
  const liquidationDebtTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(
      liquidationToken.address
    )
  ).variableDebtTokenAddress;
  const liquidationReserveId = (
    await pool.getReserveData(liquidationToken.address)
  ).id;
  const liquidationDebtToken = await getVariableDebtToken(
    liquidationDebtTokenAddress
  );

  const paraSpaceOracle = await getParaSpaceOracle();
  const borrowerAccountData = await pool.getUserAccountData(borrower.address);

  // borrower user account stats
  const availableToBorrow = borrowerAccountData.availableBorrowsBase;
  const totalCollateral = borrowerAccountData.totalCollateralBase;
  const healthFactor = borrowerAccountData.healthFactor;
  const collateralTokenTVL = await protocolDataProvider.getXTokenTotalSupply(
    collateralToken.address
  );
  const totalDebt = borrowerAccountData.totalDebtBase;
  const liquidationThreshold = borrowerAccountData.currentLiquidationThreshold;
  const ltv = borrowerAccountData.ltv;
  const hasMoreCollateral =
    (await getUserPositions(borrower)).filter((it) =>
      it.positionInfo.xTokenBalance.gt(0)
    ).length > 0;
  const collateralAssetUnit = isERC20(collateralToken)
    ? BigNumber.from(10).pow(await (collateralToken as ERC20).decimals())
    : BigNumber.from(1);
  const liquidationAssetUnit = BigNumber.from(10).pow(
    await (liquidationToken as ERC20).decimals()
  );

  // borrower balances
  const borrowerCollateralTokenBalance = await collateralToken.balanceOf(
    borrower.address
  );
  const borrowerCollateralXTokenBalance = await collateralXToken.balanceOf(
    borrower.address
  );
  const borrowerLiquidationTokenBalance = await liquidationToken.balanceOf(
    borrower.address
  );
  const borrowerLiquidationPTokenBalance = await liquidationPToken.balanceOf(
    borrower.address
  );
  const borrowerLiquidationDebtTokenBalance =
    await liquidationDebtToken.balanceOf(borrower.address);

  // liquidator balances
  const liquidatorCollateralTokenBalance = await collateralToken.balanceOf(
    liquidator.address
  );
  const liquidatorCollateralXTokenBalance = await collateralXToken.balanceOf(
    liquidator.address
  );
  const liquidatorLiquidationAssetBalance = await liquidationToken.balanceOf(
    liquidator.address
  );
  const liquidatorLiquidationAssetPTokenBalance =
    await liquidationPToken.balanceOf(liquidator.address);

  // liquidation scope
  const liquidationAmountInTokenUnits = await convertToCurrencyDecimals(
    liquidationToken.address,
    amount
  );

  const liquidationAssetPrice = await paraSpaceOracle
    .connect((await getDeployer()).signer)
    .getAssetPrice(liquidationToken.address);

  let currentPriceMultiplier = BigNumber.from(WAD);
  let isAuctioned = false;
  if (nftId != undefined) {
    const auctionData = await pool.getAuctionData(
      collateralXTokenAddress,
      nftId
    );
    isAuctioned = await (collateralXToken as NToken).isAuctioned(nftId);
    if (isAuctioned) {
      currentPriceMultiplier = auctionData.currentPriceMultiplier;
    }
  }
  const collateralAssetPrice =
    nftId != undefined &&
    (await collateralXToken.getXTokenType()) == XTokenType.NTokenUniswapV3
      ? await (await getUniswapV3OracleWrapper()).getTokenPrice(nftId as number)
      : await paraSpaceOracle.getAssetPrice(collateralToken.address);

  const collateralAssetAuctionPrice = collateralAssetPrice.wadMul(
    currentPriceMultiplier
  );
  const liquidationBonus =
    !isNFT || !isAuctioned
      ? (
          await protocolDataProvider.getReserveConfigurationData(
            collateralToken.address
          )
        ).liquidationBonus
      : BigNumber.from(PERCENTAGE_FACTOR);
  const liquidationProtocolFeePercentage =
    await protocolDataProvider.getLiquidationProtocolFee(
      collateralToken.address
    );

  const borrowerConfig = BigNumber.from(
    (await pool.getUserConfiguration(borrower.address)).data
  );

  const data: LiquidationValidationData = {
    isNFT: isNFT,
    isAuctioned: isAuctioned,
    borrower: borrower,
    collateralToken: collateralToken,
    liquidationToken: liquidationToken,
    collateralReserveId: collateralReserveId,
    liquidationReserveId: liquidationReserveId,
    receiveXToken: receiveXToken,
    liquidationAmount: liquidationAmountInTokenUnits,
    availableToBorrow: availableToBorrow,
    healthFactor: healthFactor,
    erc721HealthFactor: healthFactor,
    totalCollateral: totalCollateral,
    liquidationThreshold: liquidationThreshold,
    collateralTokenTVL: collateralTokenTVL,
    liquidatorCollateralTokenBalance: liquidatorCollateralTokenBalance,
    liquidatorCollateralXTokenBalance: liquidatorCollateralXTokenBalance,
    liquidatorLiquidationAssetBalance: liquidatorLiquidationAssetBalance,
    liquidatorLiquidationAssetPTokenBalance:
      liquidatorLiquidationAssetPTokenBalance,
    totalDebt: totalDebt,
    borrowerCollateralXTokenBalance: borrowerCollateralXTokenBalance,
    borrowerLiquidationTokenBalance: borrowerLiquidationTokenBalance,
    borrowerLiquidationPTokenBalance: borrowerLiquidationPTokenBalance,
    borrowerLiquidationDebtTokenBalance: borrowerLiquidationDebtTokenBalance,
    borrowerCollateralTokenBalance: borrowerCollateralTokenBalance,
    borrowerConfig: borrowerConfig,
    liquidationBonus: liquidationBonus,
    hasMoreCollateral: hasMoreCollateral,
    ltv: ltv,
    liquidationProtocolFeePercentage: liquidationProtocolFeePercentage,
    liquidationAssetPrice: liquidationAssetPrice,
    collateralAssetAuctionPrice: collateralAssetAuctionPrice,
    collateralAssetPrice: collateralAssetPrice,
    collateralAssetUnit: collateralAssetUnit,
    liquidationAssetUnit: liquidationAssetUnit,
  };
  return data;
};

const liquidateAndValidateERC20 = async (
  collateralToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receivePToken: boolean
): Promise<{
  before: LiquidationValidationData;
  after: LiquidationValidationData;
}> => {
  const before = await fetchLiquidationData(
    collateralToken,
    liquidationToken,
    amount,
    liquidator,
    borrower,
    receivePToken
  );

  await checkBeforeLiquidation(before);

  // liquidate asset
  await waitForTx(
    await (await getPoolProxy())
      .connect(liquidator.signer)
      .liquidateERC20(
        collateralToken.address,
        liquidationToken.address,
        borrower.address,
        parseEther(amount).toString(),
        receivePToken,
        {
          gasLimit: 5000000,
        }
      )
  );

  const after = await fetchLiquidationData(
    collateralToken,
    liquidationToken,
    amount,
    liquidator,
    borrower,
    receivePToken
  );

  await checkAfterLiquidationERC20(before, after);

  // we wrap {before,after} as result to let each testcase verify as required
  return {before, after};
};

const liquidateAndValidateERC721 = async (
  collateralToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveNToken: boolean,
  nftId?: number
): Promise<{
  before: LiquidationValidationData;
  after: LiquidationValidationData;
}> => {
  const before = await fetchLiquidationData(
    collateralToken,
    liquidationToken,
    amount,
    liquidator,
    borrower,
    receiveNToken,
    nftId
  );

  await checkBeforeLiquidation(before);

  // liquidate asset
  await waitForTx(
    await (await getPoolProxy())
      .connect(liquidator.signer)
      .liquidateERC721(
        collateralToken.address,
        borrower.address,
        nftId != null ? nftId : 0,
        parseEther(amount).toString(),
        receiveNToken,
        {
          gasLimit: 5000000,
        }
      )
  );

  const after = await fetchLiquidationData(
    collateralToken,
    liquidationToken,
    amount,
    liquidator,
    borrower,
    receiveNToken,
    nftId
  );

  await checkAfterLiquidateERC721(before, after);

  return {before, after};
};

async function getDeployer(): Promise<SignerWithAddress> {
  const [_deployer] = await getEthersSigners();
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };
  return deployer;
}

async function approveTnx(
  token: SupportedAsset,
  isNFT: boolean,
  pool: IPool,
  user: SignerWithAddress
) {
  if (isNFT) {
    await waitForTx(
      await (token as MintableERC721)
        .connect(user.signer)
        .setApprovalForAll(pool.address, true)
    );
  } else {
    await waitForTx(
      await (token as MintableERC20)
        .connect(user.signer)
        .approve(pool.address, MAX_UINT_AMOUNT)
    );
  }
}

export async function isAssetInCollateral(
  user: SignerWithAddress,
  assetAddress: string,
  nftId?: BigNumberish
) {
  if (nftId != null) {
    const uiDataProvider = await getUiPoolDataProvider();
    const nTokenAddress = (
      await (
        await getProtocolDataProvider()
      ).getReserveTokensAddresses(assetAddress)
    ).xTokenAddress;
    const arr = new Array(100).fill(nftId); // workaround to avoid getNTokenData to fail due to missing elements
    return (await uiDataProvider.getNTokenData([nTokenAddress], [arr]))[0][0][
      "useAsCollateral"
    ];
  } else {
    return (await getUserPositions(user)).filter(
      (it) => it.underlyingAsset == assetAddress
    )[0].positionInfo.collateralEnable;
  }
}

export async function calculateExpectedLTV(user: SignerWithAddress) {
  // 1. find all assets in collateral
  const assetsInCollateral = (await getUserPositions(user)).filter(
    (it) => it.positionInfo.collateralEnable == true
  );

  let collateralAccumulator = 0;
  let weightedAmountAccumulator = 0;
  for (const asset of assetsInCollateral) {
    const isNFT = asset.positionInfo.nftCollateralizedBalance.gt(0);
    const assetPrice = await (await getParaSpaceOracle())
      .connect((await getDeployer()).signer)
      .getAssetPrice(asset.underlyingAsset);

    const pTokenAddress = (
      await (
        await getProtocolDataProvider()
      ).getReserveTokensAddresses(asset.underlyingAsset)
    ).xTokenAddress;
    const pToken = await getPToken(pTokenAddress);
    const pTokenBalance = await pToken.balanceOf(user.address);

    // 2. get base units amount for those assets
    const valueInCollateral = isNFT
      ? +asset.positionInfo.nftCollateralizedBalance * +formatEther(assetPrice)
      : +(await convertFromCurrencyDecimals(
          asset.underlyingAsset,
          pTokenBalance.toString()
        )) * +formatEther(assetPrice);
    collateralAccumulator += valueInCollateral;

    // 3. fetch LTV of each asset
    const assetLTV = (
      await (
        await getUiPoolDataProvider()
      ).getReservesData((await getPoolAddressesProvider()).address)
    )[0].filter((it) => it.underlyingAsset == asset.underlyingAsset)[0]
      .baseLTVasCollateral;
    weightedAmountAccumulator += valueInCollateral * +assetLTV;
  }

  if (collateralAccumulator > 0) {
    // 4. divide weighted sum by the accumulated total collateral
    const roundedLtv =
      Math.round((weightedAmountAccumulator / collateralAccumulator) * 1000) /
      1000; // round last 4 decimals for .9999 case
    return Math.trunc(roundedLtv);
  } else {
    return 0;
  }
}

export async function calculateHealthFactor(user: SignerWithAddress) {
  // 1. find all assets in collateral
  const assetsInCollateral = (await getUserPositions(user)).filter(
    (it) => it.positionInfo.collateralEnable == true
  );
  let collateralAccumulator = 0;
  let weightedlTAccumulator = 0;
  for (const asset of assetsInCollateral) {
    const isNFT = asset.positionInfo.nftCollateralizedBalance.gt(0);
    let assetPrice: BigNumber;
    // TODO(ivan.solomonoff): would need a mechanism to know the token ids in collateral, to fetch their price
    if (
      asset.underlyingAsset == (await getNonfungiblePositionManager()).address
    ) {
      return (await (await getPoolProxy()).getUserAccountData(user.address))
        .healthFactor;
    } else {
      assetPrice = await (await getParaSpaceOracle())
        .connect((await getDeployer()).signer)
        .getAssetPrice(asset.underlyingAsset);
    }
    const pTokenAddress = (
      await (
        await getProtocolDataProvider()
      ).getReserveTokensAddresses(asset.underlyingAsset)
    ).xTokenAddress;
    const pToken = await getPToken(pTokenAddress);
    const pTokenBalance = await pToken.balanceOf(user.address);

    // 2. get base units amount for those assets
    const valueInCollateral = isNFT
      ? +asset.positionInfo.nftCollateralizedBalance * +formatEther(assetPrice)
      : +(await convertFromCurrencyDecimals(
          asset.underlyingAsset,
          pTokenBalance.toString()
        )) * +formatEther(assetPrice);
    collateralAccumulator += valueInCollateral;

    // 3. fetch LiquidationThreshold of each asset
    const liqThreshold = (
      await (
        await getUiPoolDataProvider()
      ).getReservesData((await getPoolAddressesProvider()).address)
    )[0].filter((it) => it.underlyingAsset == asset.underlyingAsset)[0]
      .reserveLiquidationThreshold;

    weightedlTAccumulator += (+liqThreshold / 10000) * valueInCollateral;
  }
  const avgLiqThreshold =
    collateralAccumulator > 0
      ? weightedlTAccumulator / collateralAccumulator
      : 0;

  // 4. get total debt
  const totalDebt = (
    await (await getPoolProxy()).getUserAccountData(user.address)
  ).totalDebtBase;

  // 5. do HF formula
  const result =
    (collateralAccumulator * avgLiqThreshold) / +formatEther(totalDebt);

  try {
    return parseEther(result.toString());
  } catch (e) {
    return MAX_UINT_AMOUNT;
  }
}

export async function assertHealthFactorCalculation(user: SignerWithAddress) {
  const contractHF = (
    await (await getPoolProxy()).getUserAccountData(user.address)
  ).healthFactor;
  const calculatedHF = await calculateHealthFactor(user);

  assertAlmostEqual(contractHF, calculatedHF);
}

export function assertAlmostEqual(
  actual: BigNumberish,
  expected: BigNumberish,
  delta?: BigNumberish
): Chai.Assertion {
  if (delta == null) {
    if (actual == 0 || expected == 0) {
      delta = 1; // use the unit as minimum delta
    } else {
      delta = BigNumber.from(expected).div(10000).mul(2); // using 0.002% as an acceptable error
    }
  }
  return expect(BigNumber.from(actual)).to.be.closeTo(
    BigNumber.from(expected),
    BigNumber.from(delta)
  );
}

export const changePriceAndValidate = async (
  token: SupportedAsset,
  newPrice: string
) => {
  const [deployer] = await getEthersSigners();
  const agg = await getAggregator(undefined, await token.symbol());
  await agg.updateLatestAnswer(parseEther(newPrice));

  const actualPrice = await (await getParaSpaceOracle())
    .connect(deployer)
    .getAssetPrice(token.address);

  expect(parseEther(newPrice)).to.eq(actualPrice);
};

export const changeSApePriceAndValidate = async (
  tokenAddress: string,
  newPrice: string
) => {
  const [deployer] = await getEthersSigners();
  const agg = await getAggregator(undefined, "sAPE");
  await agg.updateLatestAnswer(parseEther(newPrice));

  const actualPrice = await (await getParaSpaceOracle())
    .connect(deployer)
    .getAssetPrice(tokenAddress);

  expect(parseEther(newPrice)).to.eq(actualPrice);
};

export const switchCollateralAndValidate = async (
  user: SignerWithAddress,
  token: SupportedAsset,
  useAsCollateral: boolean,
  tokenId?: BigNumberish
) => {
  const isNFT = !isERC20(token);

  if (isNFT) {
    await waitForTx(
      await (await getPoolProxy())
        .connect(user.signer)
        .setUserUseERC721AsCollateral(
          token.address,
          [tokenId as number],
          useAsCollateral,
          {gasLimit: 5000000}
        )
    );
  } else {
    await waitForTx(
      await (await getPoolProxy())
        .connect(user.signer)
        .setUserUseERC20AsCollateral(token.address, useAsCollateral)
    );
  }

  const isCollateral = await isAssetInCollateral(user, token.address, tokenId);
  // check token was successfully removed from collateral
  expect(isCollateral).to.equal(useAsCollateral);
};

export const liquidateAndValidateReverted = async (
  collateralToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveXToken: boolean,
  message: string,
  nftId?: number
) => {
  const pool = await getPoolProxy();
  const isNFT = !isERC20(collateralToken);

  if (isNFT) {
    await expect(
      pool
        .connect(liquidator.signer)
        .liquidateERC721(
          collateralToken.address,
          borrower.address,
          nftId != null ? nftId : 0,
          parseEther(amount).toString(),
          receiveXToken,
          {
            gasLimit: 5000000,
          }
        )
    ).to.be.revertedWith(message);
  } else {
    await expect(
      pool
        .connect(liquidator.signer)
        .liquidateERC20(
          collateralToken.address,
          liquidationToken.address,
          borrower.address,
          parseEther(amount).toString(),
          receiveXToken,
          {
            gasLimit: 5000000,
          }
        )
    ).to.be.revertedWith(message);
  }
};
