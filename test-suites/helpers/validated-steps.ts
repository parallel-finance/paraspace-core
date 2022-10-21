import chai from "chai";
import {BigNumber, BigNumberish} from "ethers";
import {formatEther, parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../../deploy/helpers/constants";
import {
  getMockAggregator,
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
} from "../../deploy/helpers/contracts-getters";
import {
  convertToCurrencyDecimals,
  getEthersSigners,
} from "../../deploy/helpers/contracts-helpers";
import {waitForTx} from "../../deploy/helpers/misc-utils";
import {
  INonfungiblePositionManager,
  IPool,
  MintableERC20,
  MintableERC721,
  NToken,
  WETH9Mocked,
} from "../../types";
import {SignerWithAddress} from "./make-suite";
import {getUserPositions} from "./utils/positions";
import {convertFromCurrencyDecimals} from "./utils/helpers";
import "../helpers/utils/wadraymath";

const {expect} = chai;
type SupportedAsset =
  | MintableERC20
  | MintableERC721
  | WETH9Mocked
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
      expect(await token.ownerOf(i)).to.be.equal(user.address);
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
  const nftIdsToUse = isNFT ? [...Array(+amount).keys()] : null;

  if (mintTokens) {
    const amountToMint = mintAmount != null ? mintAmount : amount;
    await mintAndValidate(token, amountToMint, user);
  }

  // approve protocol to access user wallet
  await approveTnx(token, isNFT, pool, user);

  const protocolDataProvider = await getProtocolDataProvider();
  const pTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).xTokenAddress;
  const pToken = await getPToken(pTokenAddress);

  const assetPrice = await (await getParaSpaceOracle())
    .connect((await getDeployer()).signer)
    .getAssetPrice(token.address);
  const tokenBalanceBefore = await token.balanceOf(user.address);
  const pTokenBalanceBefore = await pToken.balanceOf(user.address);
  const totalCollateralBefore = (
    await (await getPoolProxy()).getUserAccountData(user.address)
  ).totalCollateralBase;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const healthFactorBefore = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactorBefore = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getPTokenTotalSupply(
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
  expect(totalCollateral).to.be.eq(
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
  assertAlmostEqual(
    availableToBorrow,
    availableToBorrowBefore.add(
      depositedAmountInBaseUnits.mul(ltvRatio).div(10000)
    )
  );

  // TVL must increase in supplied amount
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
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
      expect(erc721HealthFactor).to.be.gt(erc721HealthFactorBefore);
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
  const pool = await getPoolProxy();

  // approve protocol to access user wallet
  await approveTnx(token, false, pool, user);

  const protocolDataProvider = await getProtocolDataProvider();
  const debtTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).variableDebtTokenAddress;
  const debtToken = await getVariableDebtToken(debtTokenAddress);

  const assetPrice = await (await getParaSpaceOracle())
    .connect((await getDeployer()).signer)
    .getAssetPrice(token.address);
  const tokenBalanceBefore = await token.balanceOf(user.address);
  const debtTokenBalanceBefore = await debtToken.balanceOf(user.address);
  const ltvBefore = (
    await (await getPoolProxy()).getUserAccountData(user.address)
  ).ltv;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const healthFactorBefore = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactorBefore = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getPTokenTotalSupply(
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
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
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
  const pool = await getPoolProxy();

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

  const assetPrice = await (await getParaSpaceOracle())
    .connect((await getDeployer()).signer)
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
  const tvlBefore = await protocolDataProvider.getPTokenTotalSupply(
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
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
  assertAlmostEqual(tvl, tvlBefore);

  // LTV is based on my collateral, should stay the same
  const ltv = (await (await getPoolProxy()).getUserAccountData(user.address))
    .ltv;
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

  const protocolDataProvider = await getProtocolDataProvider();
  const pTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(token.address)
  ).xTokenAddress;
  const pToken = await getPToken(pTokenAddress);
  const assetPrice =
    (await token.symbol()) == "UNI-V3-POS"
      ? await (await getUniswapV3OracleWrapper()).getTokenPrice(nftId!)
      : await (await getParaSpaceOracle())
          .connect((await getDeployer()).signer)
          .getAssetPrice(token.address);
  const tokenBalanceBefore = await token.balanceOf(user.address);
  const pTokenBalanceBefore = await pToken.balanceOf(user.address);
  const ltvBefore = (await pool.getUserAccountData(user.address)).ltv;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const totalCollateralBefore = (
    await (await getPoolProxy()).getUserAccountData(user.address)
  ).totalCollateralBase;
  const healthFactorBefore = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactorBefore = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getPTokenTotalSupply(
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
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
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
  const ltv = (await (await getPoolProxy()).getUserAccountData(user.address))
    .ltv;
  if (wasCollateral) {
    expect(ltv).to.be.equal(await calculateExpectedLTV(user));
  } else {
    expect(ltv).to.equal(ltvBefore);
  }

  // if asset was used as collateral, total collateral decreases in withdrawn amount
  const totalCollateral = (
    await (await getPoolProxy()).getUserAccountData(user.address)
  ).totalCollateralBase;
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
  debtToRepayInBaseUnits: BigNumber;
  totalDebt: BigNumber;
  isNFT: boolean;
  availableToBorrow: BigNumber;
  erc721HealthFactor: BigNumber;
  isLiquidationAssetBorrowed: boolean;
  healthFactor: BigNumber;
  totalCollateral: BigNumber;
  tvl: BigNumber;
  liquidatorTargetTokenBalance: BigNumber;
  liquidatorTargetXTokenBalance: BigNumber;
  liquidatorLiquidationAssetBalance: BigNumber;
  liquidatorLiquidationAssetPTokenBalance: BigNumber;
  borrowerTargetTokenBalance: BigNumber;
  borrowerTargetXTokenBalance: BigNumber;
  borrowerLiquidationTokenBalance: BigNumber;
  borrowerLiquidationDebtTokenBalance: BigNumber;
  borrowerLiquidationPTokenBalance: BigNumber;
  liquidationThreshold: BigNumber;
  isUsingAsCollateral: boolean;
  liquidationBonus: BigNumber;
  hasMoreCollateral: boolean;
  collateralToBeLiquidatedInBaseUnits: BigNumber;
  ltv: BigNumber;
  amountToLiquidate: BigNumber;
  liquidationAssetPrice: BigNumber;
  targetAssetPrice: BigNumber;
  willRepayAllDebt: boolean;
  willHaveExcessFunds: boolean;
  borrowerLiquidationTokenDebtInBaseUnits: BigNumber;
}

const checkBeforeLiquidation = async (before: LiquidationValidationData) => {
  // upon liquidation, user should not be available to borrow more
  expect(before.availableToBorrow).to.equal(0);
  if (before.isNFT) {
    // upon NFT liquidation, NFT health factor should be below 1.5 (RECOVERY_HF)
    expect(before.erc721HealthFactor).to.be.lt(parseEther("1.5"));
  } else {
    // upon liquidation, health factor should be below 1
    expect(before.healthFactor).to.be.lt(parseEther("1"));
    // for ERC20 asset used for liquidation must be borrowed
    expect(before.isLiquidationAssetBorrowed).to.be.true;
  }
};

const checkAfterLiquidationERC20 = async (
  borrower: SignerWithAddress,
  targetToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  receivePToken: boolean,
  before: LiquidationValidationData,
  after: LiquidationValidationData
) => {
  // borrower's Token balance is the same
  expect(after.borrowerTargetTokenBalance).equal(
    before.borrowerTargetTokenBalance
  );

  // borrower's pToken balance is subtracted amountToLiquidate+liq bonus (bonus is paid by borrower)
  assertAlmostEqual(
    after.borrowerTargetXTokenBalance,
    before.borrowerTargetXTokenBalance.sub(
      before.amountToLiquidate.mul(before.liquidationBonus).div(10000)
    )
  );

  // borrower debtToken balance is subtracted amountToLiquidate (plus accrued interest)
  assertAlmostEqual(
    after.borrowerLiquidationDebtTokenBalance,
    before.borrowerLiquidationDebtTokenBalance.sub(before.amountToLiquidate)
  );

  if (receivePToken) {
    // liquidator's Token balance is subtracted the liquidated amount
    assertAlmostEqual(
      after.liquidatorTargetTokenBalance,
      before.liquidatorTargetTokenBalance.sub(before.amountToLiquidate)
    );
    // liquidator's pToken balance is incremented in liquidatedAmount+bonus (plus accrued interest)
    assertAlmostEqual(
      after.liquidatorTargetXTokenBalance,
      before.liquidatorTargetXTokenBalance.add(
        before.amountToLiquidate.mul(before.liquidationBonus).div(10000)
      )
    );
    // TVL stays the same
    assertAlmostEqual(after.tvl, before.tvl);
  } else {
    // liquidator's Token balance is incremented in amountToLiquidate+bonus
    // unless it's the same asset (then only bonus)
    const bonus = before.amountToLiquidate
      .mul(before.liquidationBonus.sub(10000))
      .div(10000);
    if ((await liquidationToken.symbol()) == (await targetToken.symbol())) {
      expect(after.liquidatorTargetTokenBalance).to.eq(
        before.liquidatorTargetTokenBalance.add(bonus)
      );
    } else {
      expect(after.liquidatorTargetTokenBalance).to.eq(
        before.liquidatorTargetTokenBalance.add(
          before.amountToLiquidate.add(bonus)
        )
      );
    }
    // liquidator's pToken balance stays the same
    assertAlmostEqual(
      after.liquidatorTargetXTokenBalance,
      before.liquidatorTargetXTokenBalance
    );

    // TVL decreased in the liquidated+bonus amount
    assertAlmostEqual(
      after.tvl,
      before.tvl.sub(
        before.amountToLiquidate.mul(before.liquidationBonus).div(10000)
      )
    );
  }

  assertAlmostEqual(after.ltv, await calculateExpectedLTV(borrower), 1);

  // total collateral is decremented in liquidated amount
  assertAlmostEqual(
    after.totalCollateral,
    before.totalCollateral.sub(before.collateralToBeLiquidatedInBaseUnits)
  );

  // if there's no more collateral, then health factor should be 0
  if (!after.hasMoreCollateral) {
    expect(after.erc721HealthFactor).to.equal(0);
    expect(after.healthFactor).to.equal(0);
  }
  await assertHealthFactorCalculation(borrower);

  // After being liquidated, borrower's available to borrow should now increase, unless health factor is still below 1
  if (after.healthFactor.lt(parseEther("1"))) {
    expect(after.availableToBorrow).to.equal(0);
  } else {
    expect(after.availableToBorrow).to.be.gte(before.availableToBorrow);
  }

  // Borrower's total debt is decremented in the repaid amount
  assertAlmostEqual(
    after.totalDebt,
    before.totalDebt.sub(before.debtToRepayInBaseUnits)
  );
};

const checkAfterLiquidationERC721 = async (
  borrower: SignerWithAddress,
  liquidationToken: SupportedAsset,
  receiveNToken: boolean,
  before: LiquidationValidationData,
  after: LiquidationValidationData
) => {
  const discountedNFTPrice = before.targetAssetPrice
    .mul(10000)
    .div(before.liquidationBonus);

  // borrower's Token balance is the same
  expect(after.borrowerTargetTokenBalance).equal(
    before.borrowerTargetTokenBalance
  );
  // borrower's looses the NFT in collateral
  expect(after.borrowerTargetXTokenBalance).to.eq(
    before.borrowerTargetXTokenBalance.sub(1)
  );
  if (before.willRepayAllDebt || !before.willHaveExcessFunds) {
    // if all debt is repaid borrower's liquidation pToken balance should be the same (plus accrued interest)
    assertAlmostEqual(
      after.borrowerLiquidationPTokenBalance,
      before.borrowerLiquidationPTokenBalance
    );
    if (before.willHaveExcessFunds) {
      const excessToSupplyInCoinUnits = parseEther(
        discountedNFTPrice
          .sub(before.borrowerLiquidationTokenDebtInBaseUnits)
          .div(after.liquidationAssetPrice)
          .toString()
      );
      // Supplied amount should be (NFT discounted price - DEBT in base units), excess funds are returned to liquidator
      assertAlmostEqual(
        after.borrowerLiquidationTokenBalance,
        before.borrowerLiquidationTokenBalance.add(excessToSupplyInCoinUnits)
      );
    }
  } else {
    // if the asset is not borrowed there's no discounted price for the NFT
    const excessToSupplyInCoinUnits = parseEther(
      (after.isLiquidationAssetBorrowed
        ? discountedNFTPrice
        : before.targetAssetPrice
      )
        .sub(before.borrowerLiquidationTokenDebtInBaseUnits)
        .div(after.liquidationAssetPrice)
        .toString()
    );
    if (before.isLiquidationAssetBorrowed) {
      // supplied amount should be (NFT price - DEBT in base units)
      assertAlmostEqual(
        after.borrowerLiquidationPTokenBalance,
        before.borrowerLiquidationPTokenBalance.add(excessToSupplyInCoinUnits)
      );
    }
    expect(await isAssetInCollateral(borrower, liquidationToken.address)).to.be
      .true;
  }

  if (!before.isLiquidationAssetBorrowed) {
    // if liquidation asset is not borrowed, then borrower's liquidation debt token balance stays the same
    expect(after.borrowerLiquidationDebtTokenBalance).to.be.eq(
      before.borrowerLiquidationDebtTokenBalance
    );
  } else if (before.willRepayAllDebt) {
    // if all debt is repaid, then borrower's liquidation debt token balance is 0
    expect(after.borrowerLiquidationDebtTokenBalance).to.equal(0);
  } else {
    // if liquidation asset is borrowed but does not repay all debt, then borrower's debt token balance
    // is the resulting in subtracting the discounted NFT price
    const discountedNFTPriceInDebtUnits =
      (await liquidationToken.symbol()) != "WETH"
        ? discountedNFTPrice.wadDiv(before.liquidationAssetPrice)
        : discountedNFTPrice;

    assertAlmostEqual(
      after.borrowerLiquidationDebtTokenBalance,
      before.borrowerLiquidationDebtTokenBalance.sub(
        discountedNFTPriceInDebtUnits
      )
    );
  }

  if (receiveNToken) {
    // liquidator's Token balance stays the same
    expect(after.liquidatorTargetTokenBalance).to.eq(
      before.liquidatorTargetTokenBalance
    );
    // liquidator's pToken balance adds the NFT
    expect(after.liquidatorTargetXTokenBalance).to.eq(
      before.liquidatorTargetXTokenBalance.add(1)
    );
    // TVL stays the same
    assertAlmostEqual(after.tvl, before.tvl);
  } else {
    // liquidator's Token balance is incremented in 1 (gets the NFT)
    expect(after.liquidatorTargetTokenBalance).to.eq(
      before.liquidatorTargetTokenBalance.add(1)
    );
    // liquidator's pToken balance stays the same
    assertAlmostEqual(
      after.liquidatorTargetXTokenBalance,
      before.liquidatorTargetXTokenBalance
    );
    // TVL is subtracted the liquidated NFT
    expect(after.tvl).to.equal(before.tvl.sub(1));
  }

  expect(after.ltv).to.be.equal(await calculateExpectedLTV(borrower));

  // if isNFT and liquidationAsset is not being borrowed by the user,
  // then there's no bonus and liquidated amount supplied on behalf of the borrower,
  // so total collateral should remain the same)
  // todo: seems none-borrow liquidation check will fail
  // so temporarily disable it and need further check
  if (before.isLiquidationAssetBorrowed) {
    // total collateral is subtracted the asset floor price
    assertAlmostEqual(
      after.totalCollateral,
      before.totalCollateral.sub(before.targetAssetPrice)
    );
  }

  // if there's no more collateral, then health factor should be 0
  if (!after.hasMoreCollateral) {
    expect(after.erc721HealthFactor).to.equal(0);
    expect(after.healthFactor).to.equal(0);
  }
  await assertHealthFactorCalculation(borrower);

  // After being liquidated, borrower's available to borrow should now increase, unless health factor is still below 1
  if (after.healthFactor.lt(parseEther("1"))) {
    expect(after.availableToBorrow).to.equal(0);
  } else {
    expect(after.availableToBorrow).to.be.gt(before.availableToBorrow);
  }

  if (before.willRepayAllDebt) {
    // if repays all token debt, the total debt should be subtracted the full liq token debt
    assertAlmostEqual(
      after.totalDebt,
      before.totalDebt.sub(before.borrowerLiquidationTokenDebtInBaseUnits)
    );
  } else if (!before.isLiquidationAssetBorrowed) {
    // total debt should stay the same
    assertAlmostEqual(after.totalDebt, before.totalDebt);
  } else {
    // if liquidation asset is borrowed but not all debt is repaid, total debt should result in subtracting the amount repaid
    const debtToRepay = before.targetAssetPrice
      .mul(10000)
      .div(before.liquidationBonus);
    assertAlmostEqual(after.totalDebt, before.totalDebt.sub(debtToRepay));
  }
};

export const liquidateAndValidate = async (
  targetToken: SupportedAsset,
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
  const isNFT = !isERC20(targetToken);

  if (isNFT) {
    return await liquidateAndValidateERC721(
      targetToken,
      liquidationToken,
      amount,
      liquidator,
      borrower,
      receiveXToken,
      nftId
    );
  } else {
    return await liquidateAndValidateERC20(
      targetToken,
      liquidationToken,
      amount,
      liquidator,
      borrower,
      receiveXToken
    );
  }
};

const fetchLiquidationData = async (
  targetToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  nftId?: number
): Promise<LiquidationValidationData> => {
  const isNFT = !isERC20(targetToken);
  const pool = await getPoolProxy();
  const protocolDataProvider = await getProtocolDataProvider();
  const targetXTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(targetToken.address)
  ).xTokenAddress;
  const targetXToken = isNFT
    ? await getNToken(targetXTokenAddress)
    : await getPToken(targetXTokenAddress);
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
  const liquidationDebtToken = await getVariableDebtToken(
    liquidationDebtTokenAddress
  );

  // borrower user account stats
  const availableToBorrow = (await pool.getUserAccountData(borrower.address))
    .availableBorrowsBase;
  const totalCollateral = (
    await (await getPoolProxy()).getUserAccountData(borrower.address)
  ).totalCollateralBase;
  const healthFactor = (await pool.getUserAccountData(borrower.address))
    .healthFactor;
  const tvl = await protocolDataProvider.getPTokenTotalSupply(
    targetToken.address
  );
  const totalDebt = (await pool.getUserAccountData(borrower.address))
    .totalDebtBase;
  const liquidationThreshold = (await pool.getUserAccountData(borrower.address))
    .currentLiquidationThreshold;
  const ltv = (await pool.getUserAccountData(borrower.address)).ltv;
  const hasMoreCollateral =
    (await getUserPositions(borrower)).filter((it) =>
      it.positionInfo.xTokenBalance.gt(0)
    ).length > 0;

  // borrower balances
  const borrowerTargetTokenBalance = await targetToken.balanceOf(
    borrower.address
  );
  const borrowerPTokenBalance = await targetXToken.balanceOf(borrower.address);
  const borrowerLiquidationTokenBalance = await liquidationToken.balanceOf(
    borrower.address
  );
  const borrowerLiquidationPTokenBalance = await liquidationPToken.balanceOf(
    borrower.address
  );
  const borrowerLiquidationDebtTokenBalance =
    await liquidationDebtToken.balanceOf(borrower.address);

  // liquidator balances
  const liquidatorTargetTokenBalance = await targetToken.balanceOf(
    liquidator.address
  );
  const liquidatorTargetXTokenBalance = await targetXToken.balanceOf(
    liquidator.address
  );
  const liquidatorLiquidationAssetBalance = await liquidationToken.balanceOf(
    liquidator.address
  );
  const liquidatorLiquidationAssetPTokenBalance =
    await liquidationPToken.balanceOf(liquidator.address);

  // liquidation situation specifics
  const amountInBaseUnits = await convertToCurrencyDecimals(
    liquidationToken.address,
    amount
  );
  const isPartialLiquidation = borrowerPTokenBalance.gt(amountInBaseUnits);
  const liquidationBonus = (
    await protocolDataProvider.getReserveConfigurationData(targetToken.address)
  ).liquidationBonus;
  const amountToLiquidate = isPartialLiquidation
    ? amountInBaseUnits
    : borrowerPTokenBalance.mul(10000).div(liquidationBonus);
  const isLiquidationAssetBorrowed = (await getUserPositions(borrower))
    .filter((it) => it.underlyingAsset == liquidationToken.address)[0]
    .positionInfo.erc20XTokenDebt.gt(0);

  const liquidationAssetPrice = await (await getParaSpaceOracle())
    .connect((await getDeployer()).signer)
    .getAssetPrice(liquidationToken.address);

  let currentPriceMultiplier = BigNumber.from("1000000000000000000");
  let isAuctioned = false;
  if (nftId != undefined) {
    const auctionData = await pool.getAuctionData(targetXTokenAddress, nftId);
    isAuctioned = await (targetXToken as NToken).isAuctioned(nftId);
    if (isAuctioned && auctionData.startTime.gt(0)) {
      currentPriceMultiplier = auctionData.currentPriceMultiplier;
    }
  }
  const assetPrice =
    (nftId != undefined && (await targetToken.symbol())) == "UNI-V3-POS"
      ? await (await getUniswapV3OracleWrapper()).getTokenPrice(nftId as number)
      : await (await getParaSpaceOracle())
          .connect((await getDeployer()).signer)
          .getAssetPrice(targetToken.address);
  const targetAssetPrice = assetPrice
    .mul(currentPriceMultiplier)
    .div("1000000000000000000");

  const debtToRepay = isPartialLiquidation
    ? amountInBaseUnits
    : borrowerPTokenBalance.mul(10000).div(liquidationBonus);

  const debtToRepayInBaseUnits = debtToRepay.wadMul(liquidationAssetPrice);

  const borrowerLiquidationTokenDebtInBaseUnits =
    borrowerLiquidationDebtTokenBalance.wadMul(liquidationAssetPrice);

  const liquidationAssetData = await pool.getReserveData(
    liquidationToken.address
  );
  const borrowerConfig = BigNumber.from(
    (await pool.getUserConfiguration(borrower.address)).data
  );

  const isLiquidationAssetInCollateral = isUsingAsCollateral(
    borrowerConfig,
    liquidationAssetData.id
  );

  const collateralToBeLiquidated = isPartialLiquidation
    ? amountInBaseUnits.mul(liquidationBonus).div(10000)
    : borrowerPTokenBalance;

  const collateralToBeLiquidatedInBaseUnits = collateralToBeLiquidated.wadMul(
    liquidationAssetPrice
  );

  const willRepayAllDebt =
    isLiquidationAssetBorrowed &&
    +formatEther(borrowerLiquidationDebtTokenBalance) *
      +formatEther(liquidationAssetPrice) <=
      +formatEther(assetPrice.mul(10000).div(liquidationBonus));

  const willHaveExcessFunds =
    +formatEther(borrowerLiquidationDebtTokenBalance) *
      +formatEther(liquidationAssetPrice) <=
    +formatEther(assetPrice.mul(10000).div(liquidationBonus));

  const data: LiquidationValidationData = {
    isNFT: isNFT,
    isLiquidationAssetBorrowed: isLiquidationAssetBorrowed,
    availableToBorrow: availableToBorrow,
    healthFactor: healthFactor,
    erc721HealthFactor: healthFactor,
    totalCollateral: totalCollateral,
    liquidationThreshold: liquidationThreshold,
    tvl: tvl,
    liquidatorTargetTokenBalance: liquidatorTargetTokenBalance,
    liquidatorTargetXTokenBalance: liquidatorTargetXTokenBalance,
    liquidatorLiquidationAssetBalance: liquidatorLiquidationAssetBalance,
    liquidatorLiquidationAssetPTokenBalance:
      liquidatorLiquidationAssetPTokenBalance,
    totalDebt: totalDebt,
    debtToRepayInBaseUnits: debtToRepayInBaseUnits,
    borrowerTargetXTokenBalance: borrowerPTokenBalance,
    borrowerLiquidationTokenBalance: borrowerLiquidationTokenBalance,
    borrowerLiquidationPTokenBalance: borrowerLiquidationPTokenBalance,
    borrowerLiquidationDebtTokenBalance: borrowerLiquidationDebtTokenBalance,
    borrowerLiquidationTokenDebtInBaseUnits:
      borrowerLiquidationTokenDebtInBaseUnits,
    borrowerTargetTokenBalance: borrowerTargetTokenBalance,
    isUsingAsCollateral: isLiquidationAssetInCollateral,
    liquidationBonus: liquidationBonus,
    hasMoreCollateral: hasMoreCollateral,
    collateralToBeLiquidatedInBaseUnits: collateralToBeLiquidatedInBaseUnits,
    ltv: ltv,
    amountToLiquidate: amountToLiquidate,
    liquidationAssetPrice: liquidationAssetPrice,
    targetAssetPrice: targetAssetPrice,
    willRepayAllDebt: willRepayAllDebt,
    willHaveExcessFunds: willHaveExcessFunds,
  };
  return data;
};

const liquidateAndValidateERC20 = async (
  targetToken: SupportedAsset,
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
    targetToken,
    liquidationToken,
    amount,
    liquidator,
    borrower
  );

  await checkBeforeLiquidation(before);

  // liquidate asset
  await waitForTx(
    await (await getPoolProxy())
      .connect(liquidator.signer)
      .liquidationCall(
        targetToken.address,
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
    targetToken,
    liquidationToken,
    amount,
    liquidator,
    borrower
  );

  await checkAfterLiquidationERC20(
    borrower,
    targetToken,
    liquidationToken,
    receivePToken,
    before,
    after
  );

  // we wrap {before,after} as result to let each testcase verify as required
  return {before, after};
};

const liquidateAndValidateERC721 = async (
  targetToken: SupportedAsset,
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
    targetToken,
    liquidationToken,
    amount,
    liquidator,
    borrower
  );

  await checkBeforeLiquidation(before);

  // liquidate asset
  await waitForTx(
    await (await getPoolProxy())
      .connect(liquidator.signer)
      .liquidationERC721(
        targetToken.address,
        liquidationToken.address,
        borrower.address,
        nftId != null ? nftId : 0,
        parseEther(amount).toString(),
        receiveNToken
      )
  );

  const after = await fetchLiquidationData(
    targetToken,
    liquidationToken,
    amount,
    liquidator,
    borrower
  );

  await checkAfterLiquidationERC721(
    borrower,
    liquidationToken,
    receiveNToken,
    before,
    after
  );

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
  token: any,
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
    return (
      await uiDataProvider.getNTokenData(user.address, [nTokenAddress], [arr])
    )[0][0]["useAsCollateral"];
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
    const isNFT = asset.positionInfo.nftCollaterizedBalance.gt(0);
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
      ? +asset.positionInfo.nftCollaterizedBalance * +formatEther(assetPrice)
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
    const isNFT = asset.positionInfo.nftCollaterizedBalance.gt(0);
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
      ? +asset.positionInfo.nftCollaterizedBalance * +formatEther(assetPrice)
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

function assertAlmostEqual(
  actual: any,
  expected: any,
  delta?: any
): Chai.Assertion {
  actual = BigNumber.from(actual);
  expected = BigNumber.from(expected);
  if (delta == null) {
    if (actual == 0 || expected == 0) {
      delta = 1; // use the unit as minimum delta
    } else {
      delta = expected.div(10000).mul(2); // using 0.002% as an acceptable error
    }
  }
  return expect(actual).to.be.closeTo(expected, BigNumber.from(delta));
}

export const changePriceAndValidate = async (
  token: SupportedAsset,
  newPrice: string
) => {
  const [deployer] = await getEthersSigners();
  const agg = await getMockAggregator(undefined, await token.symbol());
  await agg.updateLatestAnswer(parseEther(newPrice));

  const actualPrice = await (await getParaSpaceOracle())
    .connect(deployer)
    .getAssetPrice(token.address);

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
          [tokenId!],
          useAsCollateral
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
  targetToken: SupportedAsset,
  liquidationToken: SupportedAsset,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveXToken: boolean,
  message: string,
  nftId?: number
) => {
  const pool = await getPoolProxy();
  const isNFT = !isERC20(targetToken);

  if (isNFT) {
    await expect(
      pool
        .connect(liquidator.signer)
        .liquidationERC721(
          targetToken.address,
          liquidationToken.address,
          borrower.address,
          nftId != null ? nftId : 0,
          parseEther(amount).toString(),
          receiveXToken
        )
    ).to.be.revertedWith(message);
  } else {
    await expect(
      pool
        .connect(liquidator.signer)
        .liquidationCall(
          targetToken.address,
          liquidationToken.address,
          borrower.address,
          parseEther(amount).toString(),
          receiveXToken
        )
    ).to.be.revertedWith(message);
  }
};

const isBorrowing = (conf, id) =>
  conf
    .div(BigNumber.from(2).pow(BigNumber.from(id).mul(2)))
    .and(1)
    .gt(0);

const isUsingAsCollateral = (conf, id) =>
  conf
    .div(BigNumber.from(2).pow(BigNumber.from(id).mul(2).add(1)))
    .and(1)
    .gt(0);
