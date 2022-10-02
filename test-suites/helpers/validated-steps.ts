import chai from "chai";
import {BigNumber, BigNumberish} from "ethers";
import {formatEther, parseEther} from "ethers/lib/utils";
import {MAX_UINT_AMOUNT} from "../../deploy/helpers/constants";
import {
  getAllMockedTokens,
  getMockAggregator,
  getParaSpaceOracle,
  getPToken,
  getPool,
  getPoolAddressesProvider,
  getProtocolDataProvider,
  getUiPoolDataProvider,
  getVariableDebtToken,
  getNToken,
} from "../../deploy/helpers/contracts-getters";
import {
  convertToCurrencyDecimals,
  getEthersSigners,
} from "../../deploy/helpers/contracts-helpers";
import {waitForTx} from "../../deploy/helpers/misc-utils";
import {ERC721TokenContractId, RateMode} from "../../deploy/helpers/types";
import {MintableERC20, MintableERC721, Pool} from "../../types";
import {SignerWithAddress} from "./make-suite";
import {getUserPositions} from "./utils/positions";
import {convertFromCurrencyDecimals} from "./utils/helpers";

const {expect} = chai;
const INTEREST_DELTA_ALLOWANCE = BigNumber.from(1000000000000000);

export const mintAndValidate = async (
  asset: string,
  amount: string,
  user: SignerWithAddress
) => {
  const uAsset = asset.toUpperCase();
  // eslint-disable-next-line
  const isNFT = (<any>Object).values(ERC721TokenContractId).includes(uAsset);
  const token = (await getAllMockedTokens())[uAsset];
  const nftIdsToUse = isNFT ? [...Array(+amount).keys()] : null;
  const initialBalance = await token.balanceOf(user.address);

  const amountToMint = isNFT
    ? amount
    : await convertToCurrencyDecimals(token.address, amount);
  if (isNFT) {
    for (const i in nftIdsToUse) {
      await waitForTx(
        await (token as MintableERC721)
          .connect(user.signer)
          ["mint(address)"](user.address)
      );
      expect(await (token as MintableERC721).ownerOf(i)).to.be.equal(
        user.address
      );
    }
  } else {
    await waitForTx(
      await (token as MintableERC20)
        .connect(user.signer)
        ["mint(address,uint256)"](user.address, amountToMint)
    );
  }
  // check user balance is the expected
  const balance = await token.balanceOf(user.address);
  expect(balance).to.be.equal(initialBalance.add(amountToMint));
};

export const supplyAndValidate = async (
  asset: string,
  amount: string,
  user: SignerWithAddress,
  mintTokens?: boolean,
  mintAmount?: string
) => {
  const uAsset = asset.toUpperCase();
  // eslint-disable-next-line
  const isNFT = (<any>Object).values(ERC721TokenContractId).includes(uAsset);
  const token = (await getAllMockedTokens())[uAsset];
  const amountInBaseUnits = isNFT
    ? BigNumber.from(amount)
    : await convertToCurrencyDecimals(token.address, amount);
  const pool = await getPool();
  const nftIdsToUse = isNFT ? [...Array(+amount).keys()] : null;

  if (mintTokens) {
    const amountToMint = mintAmount != null ? mintAmount : amount;
    await mintAndValidate(asset, amountToMint, user);
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
    await (await getPool()).getUserAccountData(user.address)
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
    // eslint-disable-next-line
    for (let i = 0; i < nftIdsToUse!.length; i++) {
      await pool
        .connect(user.signer)
        .supplyERC721(
          token.address,
          [{tokenId: nftIdsToUse ? [i] : 0, useAsCollateral: true}],
          user.address,
          "0",
          {gasLimit: 5000000}
        );
    }
  } else {
    await waitForTx(
      await pool
        .connect(user.signer)
        .supply(token.address, amountInBaseUnits, user.address, "0", {
          gasLimit: 5000000,
        })
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
  expect(ltv).to.be.equal(await calculateExpectedLTV(user));

  // available to borrow should increase in [supplied amount * token's LTV ratio]
  const ltvRatio = (
    await protocolDataProvider.getReserveConfigurationData(token.address)
  ).ltv;
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  assertIsPrettyCloseTo(
    availableToBorrow,
    availableToBorrowBefore.add(
      depositedAmountInBaseUnits.mul(ltvRatio).div(10000)
    )
  );

  // TVL must increase in supplied amount
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
  expect(tvl).to.be.closeTo(
    tvlBefore.add(amountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

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
  asset: string,
  amount: string,
  user: SignerWithAddress
) => {
  const uAsset = asset.toUpperCase();
  const token = (await getAllMockedTokens())[uAsset];
  const amountInBaseUnits = await convertToCurrencyDecimals(
    token.address,
    amount
  );
  const pool = await getPool();

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
  const ltvBefore = (await (await getPool()).getUserAccountData(user.address))
    .ltv;
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
      .borrow(
        token.address,
        amountInBaseUnits,
        RateMode.Variable,
        "0",
        user.address
      )
  );

  // check Token balance increased in the borrowed amount
  const tokenBalance = await token.balanceOf(user.address);
  expect(tokenBalance).to.be.equal(tokenBalanceBefore.add(amountInBaseUnits));

  // check debtToken balance increased in deposited amount
  const debtTokenBalance = await debtToken.balanceOf(user.address);
  expect(debtTokenBalance).to.be.closeTo(
    debtTokenBalanceBefore.add(amountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

  // LTV is based on my collateral, not on my borrow position
  const ltv = (await pool.getUserAccountData(user.address)).ltv;
  expect(ltv).to.equal(ltvBefore);

  // available to borrow should decrease in borrowed amount
  const borrowedAmountInBaseUnits = BigNumber.from(amount).mul(assetPrice);
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  expect(availableToBorrow).to.be.closeTo(
    availableToBorrowBefore.sub(borrowedAmountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

  // TVL should stay the same
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
  expect(tvl).to.be.closeTo(tvlBefore, INTEREST_DELTA_ALLOWANCE);

  // total debt increased in the borrowed amount
  const totalDebt = (await pool.getUserAccountData(user.address)).totalDebtBase;
  expect(totalDebt).to.be.closeTo(
    totalDebtBefore.add(borrowedAmountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

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
  asset: string,
  amount: string,
  user: SignerWithAddress
) => {
  const uAsset = asset.toUpperCase();
  const token = (await getAllMockedTokens())[uAsset];
  const amountInBaseUnits = await convertToCurrencyDecimals(
    token.address,
    amount
  );
  const pool = await getPool();

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
      .repay(
        token.address,
        amountInBaseUnits,
        RateMode.Variable,
        user.address,
        false
      )
  );

  // check Token balance decreased in the repaid amount
  const tokenBalance = await token.balanceOf(user.address);
  expect(tokenBalance).to.be.equal(tokenBalanceBefore.sub(amountInBaseUnits));

  // check pToken balance stays the same
  const pTokenBalance = await pToken.balanceOf(user.address);
  expect(pTokenBalance).to.be.closeTo(
    pTokenBalanceBefore,
    INTEREST_DELTA_ALLOWANCE
  );

  // check debtToken balance decreased in repaid amount
  const debtTokenBalance = await debtToken.balanceOf(user.address);
  expect(debtTokenBalance).to.be.closeTo(
    debtTokenBalanceBefore.sub(amountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

  // available to borrow should increased in repaid amount
  const repaidAmountInBaseUnits = BigNumber.from(amount).mul(assetPrice);
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  expect(availableToBorrow).to.be.closeTo(
    availableToBorrowBefore.add(repaidAmountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

  // TVL should stay the same
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
  expect(tvl).to.be.closeTo(tvlBefore, INTEREST_DELTA_ALLOWANCE);

  // LTV is based on my collateral, should stay the same
  const ltv = (await (await getPool()).getUserAccountData(user.address)).ltv;
  expect(ltv).to.equal(ltvBefore);

  // total debt decreased in the repaid amount
  const totalDebt = (await pool.getUserAccountData(user.address)).totalDebtBase;
  expect(totalDebt).to.be.closeTo(
    totalDebtBefore.sub(repaidAmountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

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
  asset: string,
  amount: string,
  user: SignerWithAddress,
  nftId?: number
) => {
  const uAsset = asset.toUpperCase();
  // eslint-disable-next-line
  const isNFT = (<any>Object).values(ERC721TokenContractId).includes(uAsset);
  const token = (await getAllMockedTokens())[uAsset];
  const amountInBaseUnits = isNFT
    ? BigNumber.from(amount)
    : await convertToCurrencyDecimals(token.address, amount);
  const pool = await getPool();

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
  const ltvBefore = (await pool.getUserAccountData(user.address)).ltv;
  const availableToBorrowBefore = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  const totalCollateralBefore = (
    await (await getPool()).getUserAccountData(user.address)
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
  if (wasCollateral) {
    throw Error("Cannot withdraw asset in collateral");
  }

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
        .withdraw(token.address, amountInBaseUnits, user.address)
    );
  }

  // check Token balance increased in the withdrawn amount
  const tokenBalance = await token.balanceOf(user.address);
  expect(tokenBalance).to.be.equal(tokenBalanceBefore.add(amountInBaseUnits));

  // check pToken balance decreased in the withdrawn amount
  const pTokenBalance = await pToken.balanceOf(user.address);
  expect(pTokenBalance).to.be.closeTo(
    pTokenBalanceBefore.sub(amountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

  // TVL decreased in the withdrawn amount
  const tvl = await protocolDataProvider.getPTokenTotalSupply(token.address);
  expect(tvl).to.be.closeTo(
    tvlBefore.sub(amountInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

  // available to borrow decreased in [withdrawn amount * token's LTV ratio], but only if was collateral
  const withdrawnAmountInBaseUnits = BigNumber.from(amount).mul(assetPrice);
  const availableToBorrow = (await pool.getUserAccountData(user.address))
    .availableBorrowsBase;
  if (wasCollateral) {
    const ltvRatio = (
      await protocolDataProvider.getReserveConfigurationData(token.address)
    ).ltv;
    expect(availableToBorrow).to.be.equal(
      availableToBorrowBefore.sub(
        withdrawnAmountInBaseUnits
          .mul(BigNumber.from(ltvRatio))
          .div(BigNumber.from(10000))
      )
    );
  } else {
    expect(availableToBorrow).to.closeTo(
      availableToBorrowBefore,
      INTEREST_DELTA_ALLOWANCE
    );
  }

  // totalDebt should've stayed the same
  const totalDebt = (await pool.getUserAccountData(user.address)).totalDebtBase;
  expect(totalDebt).to.closeTo(totalDebtBefore, INTEREST_DELTA_ALLOWANCE);

  // LTV decreased, but only if asset was collateral
  const ltv = (await (await getPool()).getUserAccountData(user.address)).ltv;
  if (wasCollateral) {
    expect(ltv).to.be.equal(await calculateExpectedLTV(user));
  } else {
    expect(ltv).to.equal(ltvBefore);
  }

  // if asset was used as collateral, total collateral decreases in withdrawn amount
  const totalCollateral = (
    await (await getPool()).getUserAccountData(user.address)
  ).totalCollateralBase;
  if (wasCollateral) {
    expect(totalCollateral).to.be.eq(
      totalCollateralBefore.sub(withdrawnAmountInBaseUnits)
    );
  } else {
    expect(totalCollateral).to.be.closeTo(
      totalCollateralBefore,
      INTEREST_DELTA_ALLOWANCE
    );
  }

  // health factor should have worsen, but only if was collateral and user had some borrow position
  const healthFactor = (await pool.getUserAccountData(user.address))
    .healthFactor;
  const erc721HealthFactor = (await pool.getUserAccountData(user.address))
    .erc721HealthFactor;
  if (wasCollateral && totalDebt > BigNumber.from(0)) {
    expect(erc721HealthFactor).to.be.lt(erc721HealthFactorBefore);
    expect(healthFactor).to.be.lt(healthFactorBefore);
  } else {
    assertIsPrettyCloseTo(healthFactor, healthFactorBefore); // only slightly changed due to interests
    assertIsPrettyCloseTo(erc721HealthFactor, erc721HealthFactorBefore);
  }
  await assertHealthFactorCalculation(user);
};

export const liquidateAndValidate = async (
  targetAsset: string,
  liquidationAsset: string,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveXToken: boolean,
  nftId?: number
) => {
  // eslint-disable-next-line
  const isNFT = Object.values(ERC721TokenContractId).includes(
    targetAsset.toUpperCase() as ERC721TokenContractId
  );

  if (isNFT) {
    await liquidateAndValidateERC721(
      targetAsset,
      liquidationAsset,
      amount,
      liquidator,
      borrower,
      receiveXToken,
      nftId
    );
  } else {
    await liquidateAndValidateERC20(
      targetAsset,
      liquidationAsset,
      amount,
      liquidator,
      borrower,
      receiveXToken
    );
  }
};

const liquidateAndValidateERC20 = async (
  targetAsset: string,
  liquidationAsset: string,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receivePToken: boolean
) => {
  const uTargetAsset = targetAsset.toUpperCase();
  const uLiquidationAsset = liquidationAsset.toUpperCase();
  const targetToken = (await getAllMockedTokens())[uTargetAsset];
  const liquidationToken = (await getAllMockedTokens())[uLiquidationAsset];
  const pool = await getPool();
  const protocolDataProvider = await getProtocolDataProvider();
  const targetPTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(targetToken.address)
  ).xTokenAddress;
  const targetPToken = await getPToken(targetPTokenAddress);

  const liquidationAssetPrice = await (await getParaSpaceOracle())
    .connect((await getDeployer()).signer)
    .getAssetPrice(liquidationToken.address);
  const availableToBorrowBefore = (
    await pool.getUserAccountData(borrower.address)
  ).availableBorrowsBase;
  const totalCollateralBefore = (
    await (await getPool()).getUserAccountData(borrower.address)
  ).totalCollateralBase;
  const healthFactorBefore = (await pool.getUserAccountData(borrower.address))
    .healthFactor;
  const tvlBefore = await protocolDataProvider.getPTokenTotalSupply(
    targetToken.address
  );
  const totalDebtBefore = (await pool.getUserAccountData(borrower.address))
    .totalDebtBase;

  const borrowerTokenBalanceBefore = await targetToken.balanceOf(
    borrower.address
  );
  const borrowerPTokenBalanceBefore = await targetPToken.balanceOf(
    borrower.address
  );
  const liquidatorTokenBalanceBefore = await targetToken.balanceOf(
    liquidator.address
  );
  const liquidatorPTokenBalanceBefore = await targetPToken.balanceOf(
    liquidator.address
  );

  const amountInBaseUnits = await convertToCurrencyDecimals(
    liquidationToken.address,
    amount
  );
  const isPartialLiquidation =
    borrowerPTokenBalanceBefore.gt(amountInBaseUnits);
  const liquidationBonus = (
    await protocolDataProvider.getReserveConfigurationData(targetToken.address)
  ).liquidationBonus;
  const amountToLiquidate = isPartialLiquidation
    ? amountInBaseUnits
    : borrowerPTokenBalanceBefore.mul(10000).div(liquidationBonus);
  const isLiquidationAssetBorrowed = (await getUserPositions(borrower))
    .filter((it) => it.underlyingAsset == liquidationToken.address)[0]
    .positionInfo.erc20XTokenDebt.gt(0);

  const liquidationDebtTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(
      liquidationToken.address
    )
  ).variableDebtTokenAddress;
  const liquidationDebtToken = await getVariableDebtToken(
    liquidationDebtTokenAddress
  );
  const borrowerLiquidationDebtTokenBalanceBefore =
    await liquidationDebtToken.balanceOf(borrower.address);

  // target asset must be in collateral
  const wasCollateral = await isAssetInCollateral(
    borrower,
    targetToken.address
  );
  expect(wasCollateral).to.be.true;

  // asset used for liquidation must be borrowed
  expect(isLiquidationAssetBorrowed).to.be.true;
  // upon liquidation, user should not be available to borrow more
  expect(availableToBorrowBefore).to.equal(0);
  // upon liquidation, health factor should be below 1
  expect(healthFactorBefore).to.be.lt(parseEther("1"));

  // liquidate asset
  await waitForTx(
    await pool
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

  const borrowerTokenBalance = await targetToken.balanceOf(borrower.address);
  const borrowerPTokenBalance = await targetPToken.balanceOf(borrower.address);
  const borrowerLiquidationDebtTokenBalance =
    await liquidationDebtToken.balanceOf(borrower.address);
  const liquidatorTokenBalance = await targetToken.balanceOf(
    liquidator.address
  );
  const liquidatorPTokenBalance = await targetPToken.balanceOf(
    liquidator.address
  );

  // borrower's Token balance is the same
  expect(borrowerTokenBalance).equal(borrowerTokenBalanceBefore);

  // borrower's pToken balance is subtracted amountToLiquidate+bonus
  expect(borrowerPTokenBalance).to.be.closeTo(
    borrowerPTokenBalanceBefore.sub(
      amountToLiquidate.mul(liquidationBonus).div(10000)
    ),
    INTEREST_DELTA_ALLOWANCE
  );

  // borrower debtToken balance is subtracted amountToLiquidate (plus maybe some accrued interest)
  expect(borrowerLiquidationDebtTokenBalance).to.be.closeTo(
    borrowerLiquidationDebtTokenBalanceBefore.sub(amountToLiquidate),
    INTEREST_DELTA_ALLOWANCE
  );

  const tvl = await protocolDataProvider.getPTokenTotalSupply(
    targetToken.address
  );

  if (receivePToken) {
    // liquidator's Token balance is subtracted the liquidated amount
    expect(liquidatorTokenBalance).closeTo(
      liquidatorTokenBalanceBefore.sub(amountToLiquidate),
      INTEREST_DELTA_ALLOWANCE
    );
    // liquidator's pToken balance is incremented in liquidatedAmount+bonus (plus maybe some accrued interest)
    expect(liquidatorPTokenBalance).closeTo(
      liquidatorPTokenBalanceBefore.add(
        amountToLiquidate.mul(liquidationBonus).div(10000)
      ),
      INTEREST_DELTA_ALLOWANCE
    );

    // TVL stays the same
    expect(tvl).to.be.closeTo(tvlBefore, INTEREST_DELTA_ALLOWANCE);
  } else {
    // liquidator's Token balance is incremented in amountToLiquidate+bonus
    // unless it's the same asset (then only bonus)
    const bonus = amountToLiquidate.mul(liquidationBonus.sub(10000)).div(10000);
    if (liquidationAsset == targetAsset) {
      expect(liquidatorTokenBalance).to.eq(
        liquidatorTokenBalanceBefore.add(bonus)
      );
    } else {
      expect(liquidatorTokenBalance).to.eq(
        liquidatorTokenBalanceBefore.add(amountToLiquidate.add(bonus))
      );
    }
    // liquidator's pToken balance stays the same
    expect(liquidatorPTokenBalance).closeTo(
      liquidatorPTokenBalanceBefore,
      INTEREST_DELTA_ALLOWANCE
    );

    // TVL decreased in the liquidated+bonus amount
    expect(tvl).to.be.closeTo(
      tvlBefore.sub(amountToLiquidate.mul(liquidationBonus).div(10000)),
      INTEREST_DELTA_ALLOWANCE
    );
  }

  const ltv = (await pool.getUserAccountData(borrower.address)).ltv;
  expect(ltv).to.be.equal(await calculateExpectedLTV(borrower));

  const totalCollateral = (await pool.getUserAccountData(borrower.address))
    .totalCollateralBase;

  const collateralLiquidated = isPartialLiquidation
    ? amountInBaseUnits.mul(liquidationBonus).div(10000)
    : borrowerPTokenBalanceBefore;
  const collateralLiquidatedInBaseUnits = parseEther(
    (
      +formatEther(collateralLiquidated) * +formatEther(liquidationAssetPrice)
    ).toString()
  );
  expect(totalCollateral).to.be.closeTo(
    totalCollateralBefore.sub(collateralLiquidatedInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );

  const healthFactor = (await pool.getUserAccountData(borrower.address))
    .healthFactor;
  const erc721HealthFactor = (await pool.getUserAccountData(borrower.address))
    .erc721HealthFactor;
  const hasMoreCollateral =
    (await getUserPositions(borrower)).filter((it) =>
      it.positionInfo.xTokenBalance.gt(0)
    ).length > 0;
  // if there's no more collateral, then health factor should be 0
  if (!hasMoreCollateral) {
    expect(erc721HealthFactor).to.equal(0);
    expect(healthFactor).to.equal(0);
  }
  await assertHealthFactorCalculation(borrower);

  // After being liquidated, borrower's available to borrow should now increase, unless health factor is still below 1
  const availableToBorrow = (await pool.getUserAccountData(borrower.address))
    .availableBorrowsBase;
  if (healthFactor.lt(parseEther("1"))) {
    expect(availableToBorrow).to.equal(0);
  } else {
    expect(availableToBorrow).to.be.gt(availableToBorrowBefore);
  }

  const totalDebt = (await pool.getUserAccountData(borrower.address))
    .totalDebtBase;
  // total debt decreased in the liquidated amount (in base units)
  const debtToRepay = isPartialLiquidation
    ? amountInBaseUnits
    : borrowerPTokenBalanceBefore.mul(10000).div(liquidationBonus);
  const debtToRepayInBaseUnits = parseEther(
    (+formatEther(debtToRepay) * +formatEther(liquidationAssetPrice)).toString()
  );
  expect(totalDebt).to.be.closeTo(
    totalDebtBefore.sub(debtToRepayInBaseUnits),
    INTEREST_DELTA_ALLOWANCE
  );
};

const liquidateAndValidateERC721 = async (
  targetAsset: string,
  liquidationAsset: string,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveNToken: boolean,
  nftId?: number
) => {
  const uTargetAsset = targetAsset.toUpperCase();
  const uLiquidationAsset = liquidationAsset.toUpperCase();
  const targetToken = (await getAllMockedTokens())[uTargetAsset];
  const liquidationToken = (await getAllMockedTokens())[uLiquidationAsset];
  const pool = await getPool();
  const protocolDataProvider = await getProtocolDataProvider();
  const targetNTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(targetToken.address)
  ).xTokenAddress;
  const targetNToken = await getNToken(targetNTokenAddress);
  let currentPriceMultiplier = BigNumber.from("1000000000000000000");
  let isAuctioned = false;
  if (nftId != undefined) {
    const auctionData = await pool.getAuctionData(targetNTokenAddress, nftId);
    isAuctioned = await targetNToken.isAuctioned(nftId);
    if (isAuctioned && auctionData.startTime.gt(0)) {
      currentPriceMultiplier = auctionData.currentPriceMultiplier;
    }
  }
  const liquidationPTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(
      liquidationToken.address
    )
  ).xTokenAddress;
  const liquidationPToken = await getPToken(liquidationPTokenAddress);
  const originalPrice = await (await getParaSpaceOracle())
    .connect((await getDeployer()).signer)
    .getAssetPrice(targetToken.address);

  const assetPrice = originalPrice
    .mul(currentPriceMultiplier)
    .div("1000000000000000000");
  const auctionExcessFunds = assetPrice.sub(originalPrice);

  const liquidationAssetPrice = await (await getParaSpaceOracle())
    .connect((await getDeployer()).signer)
    .getAssetPrice(liquidationToken.address);
  const availableToBorrowBefore = (
    await pool.getUserAccountData(borrower.address)
  ).availableBorrowsBase;
  const totalCollateralBefore = (
    await (await getPool()).getUserAccountData(borrower.address)
  ).totalCollateralBase;
  const erc721HealthFactorBefore = (
    await pool.getUserAccountData(borrower.address)
  ).erc721HealthFactor;
  const tvlBefore = await protocolDataProvider.getPTokenTotalSupply(
    targetToken.address
  );
  const totalDebtBefore = (await pool.getUserAccountData(borrower.address))
    .totalDebtBase;

  const borrowerTokenBalanceBefore = await targetToken.balanceOf(
    borrower.address
  );
  const borrowerPTokenBalanceBefore = await targetNToken.balanceOf(
    borrower.address
  );
  const borrowerLiquidationTokenBalanceBefore =
    await liquidationToken.balanceOf(borrower.address);
  const borrowerLiquidationPTokenBalanceBefore =
    await liquidationPToken.balanceOf(borrower.address);
  const liquidatorTokenBalanceBefore = await targetToken.balanceOf(
    liquidator.address
  );
  const liquidatorPTokenBalanceBefore = await targetNToken.balanceOf(
    liquidator.address
  );

  const isLiquidationAssetBorrowed = (await getUserPositions(borrower))
    .filter((it) => it.underlyingAsset == liquidationToken.address)[0]
    .positionInfo.erc20XTokenDebt.gt(0);

  const originalLiquidationBonus = (
    await protocolDataProvider.getReserveConfigurationData(targetToken.address)
  ).liquidationBonus;

  const liquidationBonus =
    !isLiquidationAssetBorrowed || isAuctioned
      ? BigNumber.from(10000)
      : originalLiquidationBonus;

  const discountedNFTPrice = assetPrice.mul(10000).div(liquidationBonus);

  const debtLiquidationTokenAddress = (
    await protocolDataProvider.getReserveTokensAddresses(
      liquidationToken.address
    )
  ).variableDebtTokenAddress;
  const liquidationDebtToken = await getVariableDebtToken(
    debtLiquidationTokenAddress
  );
  const borrowerLiquidationDebtTokenBalanceBefore =
    await liquidationDebtToken.balanceOf(borrower.address);

  const isAllDebtRepaid =
    isLiquidationAssetBorrowed &&
    +formatEther(borrowerLiquidationDebtTokenBalanceBefore) *
      +formatEther(liquidationAssetPrice) <=
      +formatEther(discountedNFTPrice);
  const willHaveExcessFunds =
    +formatEther(borrowerLiquidationDebtTokenBalanceBefore) *
      +formatEther(liquidationAssetPrice) <=
    +formatEther(discountedNFTPrice);

  // target asset must be in collateral
  const wasCollateral = await isAssetInCollateral(
    borrower,
    targetToken.address
  );
  expect(wasCollateral).to.be.true;

  // upon NFT liquidation, NFT health factor should be below 1
  expect(erc721HealthFactorBefore).to.be.lt(parseEther("1"));

  // upon liquidation, user should not be available to borrow more
  expect(availableToBorrowBefore).to.equal(0);

  // liquidate asset
  await waitForTx(
    await pool
      .connect(liquidator.signer)
      .liquidationERC721(
        targetToken.address,
        liquidationToken.address,
        borrower.address,
        nftId != null ? nftId : 0,
        parseEther(amount).toString(),
        receiveNToken,
        {
          gasLimit: 5000000,
        }
      )
  );

  const borrowerTokenBalance = await targetToken.balanceOf(borrower.address);
  const borrowerLiquidationTokenBalance = await liquidationToken.balanceOf(
    borrower.address
  );
  const borrowerLiquidationPTokenBalance = await liquidationPToken.balanceOf(
    borrower.address
  );
  const borrowerPTokenBalance = await targetNToken.balanceOf(borrower.address);
  const borrowerLiquidationDebtTokenBalance =
    await liquidationDebtToken.balanceOf(borrower.address);
  const liquidatorTokenBalance = await targetToken.balanceOf(
    liquidator.address
  );
  const liquidatorPTokenBalance = await targetNToken.balanceOf(
    liquidator.address
  );

  // borrower's Token balance is the same
  expect(borrowerTokenBalance).equal(borrowerTokenBalanceBefore);
  const tokenDebtInBaseUnits = parseEther(
    (
      +formatEther(borrowerLiquidationDebtTokenBalanceBefore) *
      +formatEther(liquidationAssetPrice)
    ).toString()
  );

  // borrower's looses the NFT in collateral
  expect(borrowerPTokenBalance).to.eq(borrowerPTokenBalanceBefore.sub(1));
  if (isAllDebtRepaid || !willHaveExcessFunds) {
    expect(borrowerLiquidationPTokenBalance).to.be.closeTo(
      borrowerLiquidationPTokenBalanceBefore,
      INTEREST_DELTA_ALLOWANCE
    );
    if (willHaveExcessFunds) {
      const excessToSupplyInCoinUnits = parseEther(
        discountedNFTPrice
          .sub(tokenDebtInBaseUnits)
          .div(liquidationAssetPrice)
          .toString()
      );
      // Supplied amount should be (NFT discounted price - DEBT in base units)
      assertIsPrettyCloseTo(
        borrowerLiquidationTokenBalance,
        borrowerLiquidationTokenBalanceBefore.add(excessToSupplyInCoinUnits)
      );
    }
  } else {
    // if the asset is not borrowed there's no discounted price for the NFT
    const excessToSupplyInCoinUnits = parseEther(
      discountedNFTPrice
        .sub(tokenDebtInBaseUnits)
        .div(liquidationAssetPrice)
        .toString()
    );
    // supplied amount should be (NFT price - DEBT in base units)
    assertIsPrettyCloseTo(
      borrowerLiquidationPTokenBalance,
      borrowerLiquidationPTokenBalanceBefore.add(excessToSupplyInCoinUnits)
    );
    expect(await isAssetInCollateral(borrower, liquidationToken.address)).to.be
      .true;
  }

  if (!isLiquidationAssetBorrowed) {
    expect(borrowerLiquidationDebtTokenBalance).to.be.eq(
      borrowerLiquidationDebtTokenBalanceBefore
    );
  } else if (isAllDebtRepaid) {
    expect(borrowerLiquidationDebtTokenBalance).to.equal(0);
  } else {
    const discountedNFTPriceInDebtUnits = parseEther(
      discountedNFTPrice.div(liquidationAssetPrice).toString()
    );
    assertIsPrettyCloseTo(
      borrowerLiquidationDebtTokenBalance,
      borrowerLiquidationDebtTokenBalanceBefore.sub(
        discountedNFTPriceInDebtUnits
      )
    );
  }

  const tvl = await protocolDataProvider.getPTokenTotalSupply(
    targetToken.address
  );
  if (receiveNToken) {
    // liquidator's Token balance stays the same
    expect(liquidatorTokenBalance).to.eq(liquidatorTokenBalanceBefore);
    // liquidator's pToken balance adds the NFT
    expect(liquidatorPTokenBalance).to.eq(liquidatorPTokenBalanceBefore.add(1));
    // TVL stays the same
    expect(tvl).to.be.closeTo(tvlBefore, INTEREST_DELTA_ALLOWANCE);
  } else {
    // liquidator's Token balance is incremented in 1 (gets the NFT)
    expect(liquidatorTokenBalance).to.eq(liquidatorTokenBalanceBefore.add(1));
    // liquidator's pToken balance stays the same
    expect(liquidatorPTokenBalance).closeTo(
      liquidatorPTokenBalanceBefore,
      INTEREST_DELTA_ALLOWANCE
    );
    // TVL is subtracted the liquidated NFT
    expect(tvl).to.equal(tvlBefore.sub(1));
  }

  const ltv = (await pool.getUserAccountData(borrower.address)).ltv;
  expect(ltv).to.be.equal(await calculateExpectedLTV(borrower));

  const totalCollateral = (await pool.getUserAccountData(borrower.address))
    .totalCollateralBase;

  // if isNFT and liquidationAsset is not being borrowed by the user,
  // then there's no bonus and liquidated amount supplied on behalf of the borrower,
  // so total collateral should remain the same)
  if (!isLiquidationAssetBorrowed) {
    expect(totalCollateral).to.be.closeTo(
      totalCollateralBefore.add(auctionExcessFunds),
      INTEREST_DELTA_ALLOWANCE
    );
  } else {
    expect(totalCollateral).to.be.closeTo(
      totalCollateralBefore.sub(assetPrice),
      INTEREST_DELTA_ALLOWANCE
    );
  }

  const healthFactor = (await pool.getUserAccountData(borrower.address))
    .healthFactor;
  const erc721HealthFactor = (await pool.getUserAccountData(borrower.address))
    .erc721HealthFactor;
  const hasMoreCollateral =
    (await getUserPositions(borrower)).filter((it) =>
      it.positionInfo.xTokenBalance.gt(0)
    ).length > 0;
  // if there's no more collateral, then health factor should be 0
  if (!hasMoreCollateral) {
    expect(erc721HealthFactor).to.equal(0);
    expect(healthFactor).to.equal(0);
  }
  await assertHealthFactorCalculation(borrower);

  // After being liquidated, borrower's available to borrow should now increase, unless health factor is still below 1
  const availableToBorrow = (await pool.getUserAccountData(borrower.address))
    .availableBorrowsBase;
  if (healthFactor.lt(parseEther("1"))) {
    expect(availableToBorrow).to.equal(0);
  } else {
    expect(availableToBorrow).to.be.gt(availableToBorrowBefore);
  }

  const totalDebt = (await pool.getUserAccountData(borrower.address))
    .totalDebtBase;
  if (isAllDebtRepaid) {
    expect(totalDebt).to.be.closeTo(
      totalDebtBefore.sub(tokenDebtInBaseUnits),
      INTEREST_DELTA_ALLOWANCE
    );
  } else if (!isLiquidationAssetBorrowed) {
    // total debt should stay the same
    expect(totalDebt).to.closeTo(totalDebtBefore, INTEREST_DELTA_ALLOWANCE);
  } else {
    const debtToRepay = assetPrice.mul(10000).div(liquidationBonus);
    expect(totalDebt).to.be.closeTo(
      totalDebtBefore.sub(debtToRepay),
      INTEREST_DELTA_ALLOWANCE
    );
  }
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
  // eslint-disable-next-line
  token: any,
  isNFT: boolean,
  pool: Pool,
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

async function calculateExpectedLTV(user: SignerWithAddress) {
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

  // 4. divide weighted sum by the accumulated total collateral
  const roundedLtv =
    Math.round((weightedAmountAccumulator / collateralAccumulator) * 1000) /
    1000; // round last 4 decimals for .9999 case
  return Math.trunc(roundedLtv);
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

    // 3. fetch LiquidationThreshold of each asset
    const liqThreshold = (
      await (
        await getUiPoolDataProvider()
      ).getReservesData((await getPoolAddressesProvider()).address)
    )[0].filter((it) => it.underlyingAsset == asset.underlyingAsset)[0]
      .reserveLiquidationThreshold;

    weightedlTAccumulator += (+liqThreshold / 10000) * valueInCollateral;
  }
  const avgLiqThreshold = weightedlTAccumulator / collateralAccumulator;

  // 4. get total debt
  const totalDebt = (await (await getPool()).getUserAccountData(user.address))
    .totalDebtBase;

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
  const contractHF = (await (await getPool()).getUserAccountData(user.address))
    .healthFactor;
  const calculatedHF = await calculateHealthFactor(user);

  assertIsPrettyCloseTo(contractHF, calculatedHF);
}

function assertIsPrettyCloseTo(
  actual: BigNumberish,
  expected: BigNumberish,
  delta?: BigNumberish
): Chai.Assertion {
  actual = BigNumber.from(actual);
  expected = BigNumber.from(expected);
  if (delta == null) {
    delta = expected.div(10000).mul(2); // using 0.002% as an acceptable error
  }
  return expect(actual).to.be.closeTo(expected, BigNumber.from(delta));
}

export const changePriceAndValidate = async (
  asset: string,
  newPrice: string
) => {
  const token = (await getAllMockedTokens())[asset.toUpperCase()];
  const [deployer] = await getEthersSigners();

  const agg = await getMockAggregator(undefined, asset);
  await agg.updateLatestAnswer(parseEther(newPrice));

  const actualPrice = await (await getParaSpaceOracle())
    .connect(deployer)
    .getAssetPrice(token.address);

  expect(parseEther(newPrice)).to.eq(actualPrice);
};

export const switchCollateralAndValidate = async (
  user: SignerWithAddress,
  asset: string,
  useAsCollateral: boolean,
  tokenId?: BigNumberish
) => {
  const isNFT = Object.values(ERC721TokenContractId).includes(
    asset.toUpperCase() as ERC721TokenContractId
  );
  const token = (await getAllMockedTokens())[asset.toUpperCase()];

  if (isNFT) {
    await waitForTx(
      await (await getPool())
        .connect(user.signer)
        .setUserUseERC721AsCollateral(
          token.address,
          [tokenId as BigNumberish],
          useAsCollateral
        )
    );
  } else {
    await waitForTx(
      await (await getPool())
        .connect(user.signer)
        .setUserUseReserveAsCollateral(token.address, useAsCollateral)
    );
  }

  const isCollateral = await isAssetInCollateral(user, token.address, tokenId);
  expect(isCollateral).to.equal(useAsCollateral);
};

export const liquidateAndValidateReverted = async (
  targetAsset: string,
  liquidationAsset: string,
  amount: string,
  liquidator: SignerWithAddress,
  borrower: SignerWithAddress,
  receiveXToken: boolean,
  nftId?: number
) => {
  const targetToken = (await getAllMockedTokens())[targetAsset.toUpperCase()];
  const liquidationToken = (await getAllMockedTokens())[
    liquidationAsset.toUpperCase()
  ];
  const pool = await getPool();
  const isNFT = Object.values(ERC721TokenContractId).includes(
    targetAsset.toUpperCase() as ERC721TokenContractId
  );

  if (isNFT) {
    expect(
      pool
        .connect(liquidator.signer)
        .liquidationERC721(
          targetToken.address,
          liquidationToken.address,
          borrower.address,
          nftId != null ? nftId : 0,
          parseEther(amount).toString(),
          receiveXToken,
          {
            gasLimit: 5000000,
          }
        )
    ).to.be.reverted;
  } else {
    expect(
      pool
        .connect(liquidator.signer)
        .liquidationCall(
          targetToken.address,
          liquidationToken.address,
          borrower.address,
          parseEther(amount).toString(),
          receiveXToken,
          {
            gasLimit: 5000000,
          }
        )
    ).to.be.reverted;
  }
};
