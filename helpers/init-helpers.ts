import {
  eContractid,
  ERC20TokenContractId,
  ERC721TokenContractId,
  IReserveParams,
  NTokenContractId,
  tEthereumAddress,
} from "./types";
import {ProtocolDataProvider} from "../types";
import {chunk, waitForTx} from "./misc-utils";
import {
  getACLManager,
  getReservesSetupHelper,
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
  getPoolProxy,
  getProtocolDataProvider,
} from "./contracts-getters";
import {
  getContractAddressInDb,
  insertContractAddressInDb,
  dryRunEncodedData,
} from "./contracts-helpers";
import {BigNumber, BigNumberish} from "ethers";
import {DRY_RUN, GLOBAL_OVERRIDES} from "./hardhat-constants";
import {
  deployReserveInterestRateStrategy,
  deployDelegationAwarePTokenImpl,
  deployGenericPTokenImpl,
  deployGenericNTokenImpl,
  deployGenericVariableDebtToken,
  deployGenericMoonbirdNTokenImpl,
  deployUniswapV3NTokenImpl,
  deployReserveAuctionStrategy,
  deployPTokenStETH,
  deployPTokenAToken,
  deployNTokenBAYCImpl,
  deployNTokenMAYCImpl,
  deployATokenDebtToken,
  deployStETHDebtToken,
  deployPTokenSApe,
  deployApeCoinStaking,
  deployPTokenCApe,
  deployCApeDebtToken,
  deployNTokenBAKCImpl,
  deployPTokenAStETH,
  deployAStETHDebtToken,
  deployPYieldToken,
  deployReserveTimeLockStrategy,
  deployOtherdeedNTokenImpl,
  deployStakefishNTokenImpl,
  deployChromieSquiggleNTokenImpl,
  deployAutoYieldApeImplAndAssignItToProxy,
  deployAutoCompoundApeImplAndAssignItToProxy,
} from "./contracts-deployments";
import {ZERO_ADDRESS} from "./constants";

export const initReservesByHelper = async (
  reserves: [string, IReserveParams][],
  tokenAddresses: {[symbol: string]: tEthereumAddress},
  xTokenNamePrefix: string,
  variableDebtTokenNamePrefix: string,
  symbolPrefix: string,
  admin: tEthereumAddress,
  treasuryAddress: tEthereumAddress,
  incentivesController: tEthereumAddress,
  hotWallet: tEthereumAddress,
  verify: boolean,
  delegationRegistryAddress: tEthereumAddress,
  genericPTokenImplAddress?: tEthereumAddress,
  genericNTokenImplAddress?: tEthereumAddress,
  genericVariableDebtTokenAddress?: tEthereumAddress,
  defaultReserveInterestRateStrategyAddress?: tEthereumAddress,
  defaultReserveAuctionStrategyAddress?: tEthereumAddress,
  defaultReserveTimeLockStrategyAddress?: tEthereumAddress,
  genericDelegationAwarePTokenImplAddress?: tEthereumAddress,
  poolAddressesProviderProxy?: tEthereumAddress,
  poolProxy?: tEthereumAddress,
  poolConfiguratorProxyAddress?: tEthereumAddress
): Promise<BigNumber> => {
  const gasUsage = BigNumber.from("0");

  const addressProvider = await getPoolAddressesProvider(
    poolAddressesProviderProxy
  );
  const pool = await getPoolProxy(poolProxy);
  // CHUNK CONFIGURATION
  const initChunks = 4;

  // Initialize variables for future reserves initialization
  const reserveTokens: string[] = [];
  const reserveInitDecimals: string[] = [];
  const reserveSymbols: string[] = [];

  const initInputParams: {
    xTokenImpl: string;
    assetType: BigNumberish;
    variableDebtTokenImpl: string;
    underlyingAssetDecimals: BigNumberish;
    interestRateStrategyAddress: string;
    auctionStrategyAddress: string;
    timeLockStrategyAddress: string;
    underlyingAsset: string;
    treasury: string;
    incentivesController: string;
    underlyingAssetName: string;
    xTokenName: string;
    xTokenSymbol: string;
    variableDebtTokenName: string;
    variableDebtTokenSymbol: string;
    params: string;
    atomicPricing?: boolean;
  }[] = [];

  const strategyAddresses: Record<string, tEthereumAddress> = {};
  const auctionStrategyAddresses: Record<string, tEthereumAddress> = {};
  const timeLockStrategyAddresses: Record<string, tEthereumAddress> = {};
  const strategyAddressPerAsset: Record<string, string> = {};
  const auctionStrategyAddressPerAsset: Record<string, string> = {};
  const timeLockStrategyAddressPerAsset: Record<string, string> = {};
  const xTokenType: Record<string, string> = {};
  let delegationAwarePTokenImplementationAddress =
    genericDelegationAwarePTokenImplAddress;
  let pTokenImplementationAddress = genericPTokenImplAddress;
  let pTokenStETHImplementationAddress = "";
  let pTokenATokenImplementationAddress = "";
  let pTokenAStETHImplementationAddress = "";
  let pTokenSApeImplementationAddress = "";
  let pTokenPsApeImplementationAddress = "";
  let pYieldTokenImplementationAddress = "";
  let nTokenImplementationAddress = genericNTokenImplAddress;
  let nTokenMoonBirdImplementationAddress = "";
  let nTokenUniSwapV3ImplementationAddress = "";
  let nTokenBAYCImplementationAddress = "";
  let nTokenMAYCImplementationAddress = "";
  let variableDebtTokenImplementationAddress = genericVariableDebtTokenAddress;
  let stETHVariableDebtTokenImplementationAddress = "";
  let astETHVariableDebtTokenImplementationAddress = "";
  let aTokenVariableDebtTokenImplementationAddress = "";
  let PsApeVariableDebtTokenImplementationAddress = "";
  let nTokenBAKCImplementationAddress = "";
  let nTokenOTHRImplementationAddress = "";
  let nTokenStakefishImplementationAddress = "";

  if (genericPTokenImplAddress) {
    await insertContractAddressInDb(
      eContractid.PTokenImpl,
      genericPTokenImplAddress,
      false
    );
  }
  if (genericNTokenImplAddress) {
    await insertContractAddressInDb(
      eContractid.NTokenImpl,
      genericNTokenImplAddress,
      false
    );
  }
  if (genericDelegationAwarePTokenImplAddress) {
    await insertContractAddressInDb(
      eContractid.DelegationAwarePTokenImpl,
      genericDelegationAwarePTokenImplAddress,
      false
    );
  }
  if (genericVariableDebtTokenAddress) {
    await insertContractAddressInDb(
      eContractid.VariableDebtTokenImpl,
      genericVariableDebtTokenAddress,
      false
    );
  }

  for (const [symbol, params] of reserves) {
    if (!tokenAddresses[symbol]) {
      console.log(
        `- Skipping init of ${symbol} due token address is not set at markets config`
      );
      continue;
    }
    const {
      strategy,
      auctionStrategy,
      timeLockStrategy,
      xTokenImpl,
      reserveDecimals,
    } = params;
    const {
      optimalUsageRatio,
      baseVariableBorrowRate,
      variableRateSlope1,
      variableRateSlope2,
    } = strategy;
    const {
      maxPriceMultiplier,
      minExpPriceMultiplier,
      minPriceMultiplier,
      stepLinear,
      stepExp,
      tickLength,
    } = auctionStrategy;
    const {
      minThreshold,
      midThreshold,
      minWaitTime,
      midWaitTime,
      maxWaitTime,
      poolPeriodWaitTime,
      poolPeriodLimit,
      period,
    } = timeLockStrategy;
    if (!strategyAddresses[strategy.name]) {
      // Strategy does not exist, create a new one
      if (strategy.name == "rateStrategyZero") {
        strategyAddresses[strategy.name] = ZERO_ADDRESS;
      } else if (defaultReserveInterestRateStrategyAddress) {
        strategyAddresses[strategy.name] =
          defaultReserveInterestRateStrategyAddress;
        insertContractAddressInDb(
          strategy.name,
          strategyAddresses[strategy.name],
          false
        );
      } else {
        strategyAddresses[strategy.name] = (
          await deployReserveInterestRateStrategy(
            strategy.name,
            [
              addressProvider.address,
              optimalUsageRatio,
              baseVariableBorrowRate,
              variableRateSlope1,
              variableRateSlope2,
            ],
            verify
          )
        ).address;
      }
    }
    if (!auctionStrategyAddresses[auctionStrategy.name]) {
      if (auctionStrategy.name == "auctionStrategyZero") {
        auctionStrategyAddresses[auctionStrategy.name] = ZERO_ADDRESS;
      } else if (defaultReserveAuctionStrategyAddress) {
        auctionStrategyAddresses[auctionStrategy.name] =
          defaultReserveAuctionStrategyAddress;
        await insertContractAddressInDb(
          auctionStrategy.name,
          auctionStrategyAddresses[auctionStrategy.name],
          false
        );
      } else {
        // Strategy does not exist, create a new one
        auctionStrategyAddresses[auctionStrategy.name] = (
          await deployReserveAuctionStrategy(
            auctionStrategy.name,
            [
              maxPriceMultiplier,
              minExpPriceMultiplier,
              minPriceMultiplier,
              stepLinear,
              stepExp,
              tickLength,
            ],
            verify
          )
        ).address;
      }
    }

    if (!timeLockStrategyAddresses[timeLockStrategy.name]) {
      if (timeLockStrategy.name == "timeLockStrategyZero") {
        timeLockStrategyAddresses[timeLockStrategy.name] = ZERO_ADDRESS;
      } else if (defaultReserveTimeLockStrategyAddress) {
        timeLockStrategyAddresses[timeLockStrategy.name] =
          defaultReserveTimeLockStrategyAddress;
        await insertContractAddressInDb(
          timeLockStrategy.name,
          timeLockStrategyAddresses[timeLockStrategy.name],
          false
        );
      } else {
        // Strategy does not exist, create a new one
        timeLockStrategyAddresses[timeLockStrategy.name] = (
          await deployReserveTimeLockStrategy(
            timeLockStrategy.name,
            pool.address,
            minThreshold,
            midThreshold,
            minWaitTime,
            midWaitTime,
            maxWaitTime,
            poolPeriodLimit,
            poolPeriodWaitTime,
            period,
            verify
          )
        ).address;
      }
    }

    strategyAddressPerAsset[symbol] = strategyAddresses[strategy.name];
    auctionStrategyAddressPerAsset[symbol] =
      auctionStrategyAddresses[auctionStrategy.name];
    timeLockStrategyAddressPerAsset[symbol] =
      timeLockStrategyAddresses[timeLockStrategy.name];
    console.log(
      "Strategy address for asset %s: %s",
      symbol,
      strategyAddressPerAsset[symbol]
    );
    console.log(
      "Auction strategy address for asset %s: %s",
      symbol,
      auctionStrategyAddressPerAsset[symbol]
    );
    console.log(
      "TimeLock strategy address for asset %s: %s",
      symbol,
      timeLockStrategyAddressPerAsset[symbol]
    );

    if (xTokenImpl === eContractid.DelegationAwarePTokenImpl) {
      xTokenType[symbol] = "delegation aware";
    } else if (
      [
        eContractid.NTokenImpl,
        eContractid.NTokenMoonBirdsImpl,
        eContractid.NTokenUniswapV3Impl,
        eContractid.NTokenBAYCImpl,
        eContractid.NTokenMAYCImpl,
        eContractid.NTokenBAKCImpl,
        eContractid.NTokenStakefishImpl,
      ].includes(xTokenImpl)
    ) {
      xTokenType[symbol] = "nft";
    } else {
      xTokenType[symbol] = "generic";
    }

    reserveInitDecimals.push(reserveDecimals);
    reserveTokens.push(tokenAddresses[symbol]);
    reserveSymbols.push(symbol);
  }

  for (let i = 0; i < reserveSymbols.length; i++) {
    initInputParams.push({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      xTokenImpl: "",
      variableDebtTokenImpl: "",
      assetType: xTokenType[reserveSymbols[i]] == "nft" ? 1 : 0,
      underlyingAssetDecimals: reserveInitDecimals[i],
      interestRateStrategyAddress: strategyAddressPerAsset[reserveSymbols[i]],
      auctionStrategyAddress: auctionStrategyAddressPerAsset[reserveSymbols[i]],
      timeLockStrategyAddress:
        timeLockStrategyAddressPerAsset[reserveSymbols[i]],
      underlyingAsset: reserveTokens[i],
      treasury: treasuryAddress,
      incentivesController,
      underlyingAssetName: reserveSymbols[i],
      xTokenName: `${xTokenNamePrefix} ${reserveSymbols[i]}`,
      xTokenSymbol:
        xTokenType[reserveSymbols[i]] === "nft"
          ? `n${symbolPrefix}${reserveSymbols[i]}`
          : `p${symbolPrefix}${reserveSymbols[i]}`,
      variableDebtTokenName: `${variableDebtTokenNamePrefix} ${symbolPrefix}${reserveSymbols[i]}`,
      variableDebtTokenSymbol: `vDebt${symbolPrefix}${reserveSymbols[i]}`,
      params: "0x10",
    });
  }

  // Deploy init reserves per chunks
  const chunkedSymbols = chunk(reserveSymbols, initChunks);
  const chunkedInitInputParams = chunk(initInputParams, initChunks);

  const configurator = await getPoolConfiguratorProxy(
    poolConfiguratorProxyAddress
  );
  //await waitForTx(await addressProvider.setPoolAdmin(admin));

  console.log(
    `- Reserves initialization in ${chunkedInitInputParams.length} txs`
  );
  for (
    let chunkIndex = 0;
    chunkIndex < chunkedInitInputParams.length;
    chunkIndex++
  ) {
    const inputs = chunkedInitInputParams[chunkIndex];

    for (let i = 0; i < inputs.length; i += 1) {
      let xTokenToUse = "";
      let variableDebtTokenToUse = "";
      const reserveSymbol = inputs[i].underlyingAssetName;
      console.log("IS ", reserveSymbol);

      if (xTokenType[reserveSymbol] === "generic") {
        if (reserveSymbol === ERC20TokenContractId.stETH) {
          if (!pTokenStETHImplementationAddress) {
            pTokenStETHImplementationAddress = (
              await deployPTokenStETH(pool.address, verify)
            ).address;
          }
          xTokenToUse = pTokenStETHImplementationAddress;
          if (!stETHVariableDebtTokenImplementationAddress) {
            stETHVariableDebtTokenImplementationAddress = (
              await deployStETHDebtToken(pool.address, verify)
            ).address;
          }
          variableDebtTokenToUse = stETHVariableDebtTokenImplementationAddress;
        } else if (
          reserveSymbol === ERC20TokenContractId.aWETH ||
          reserveSymbol === ERC20TokenContractId.awstETH
        ) {
          if (!pTokenATokenImplementationAddress) {
            pTokenATokenImplementationAddress = (
              await deployPTokenAToken(pool.address, verify)
            ).address;
          }
          xTokenToUse = pTokenATokenImplementationAddress;
          if (!aTokenVariableDebtTokenImplementationAddress) {
            aTokenVariableDebtTokenImplementationAddress = (
              await deployATokenDebtToken(pool.address, verify)
            ).address;
          }
          variableDebtTokenToUse = aTokenVariableDebtTokenImplementationAddress;
        } else if (reserveSymbol === ERC20TokenContractId.astETH) {
          if (!pTokenAStETHImplementationAddress) {
            pTokenAStETHImplementationAddress = (
              await deployPTokenAStETH(pool.address, verify)
            ).address;
          }
          xTokenToUse = pTokenAStETHImplementationAddress;
          if (!astETHVariableDebtTokenImplementationAddress) {
            astETHVariableDebtTokenImplementationAddress = (
              await deployAStETHDebtToken(pool.address, verify)
            ).address;
          }
          variableDebtTokenToUse = astETHVariableDebtTokenImplementationAddress;
        } else if (reserveSymbol === ERC20TokenContractId.sAPE) {
          if (!pTokenSApeImplementationAddress) {
            const protocolDataProvider = await getProtocolDataProvider();
            const allTokens = await protocolDataProvider.getAllXTokens();
            const nBAYC =
              // eslint-disable-next-line
              allTokens.find(
                (x) => x.symbol == NTokenContractId.nBAYC
              )!.tokenAddress;
            const nMAYC =
              // eslint-disable-next-line
              allTokens.find(
                (x) => x.symbol == NTokenContractId.nMAYC
              )!.tokenAddress;
            pTokenSApeImplementationAddress = (
              await deployPTokenSApe(pool.address, nBAYC, nMAYC, verify)
            ).address;
          }
          xTokenToUse = pTokenSApeImplementationAddress;
        } else if (reserveSymbol === ERC20TokenContractId.cAPE) {
          await deployAutoCompoundApeImplAndAssignItToProxy(verify);
          if (!pTokenPsApeImplementationAddress) {
            pTokenPsApeImplementationAddress = (
              await deployPTokenCApe(pool.address, verify)
            ).address;
          }
          xTokenToUse = pTokenPsApeImplementationAddress;
          if (!PsApeVariableDebtTokenImplementationAddress) {
            PsApeVariableDebtTokenImplementationAddress = (
              await deployCApeDebtToken(pool.address, verify)
            ).address;
          }
          variableDebtTokenToUse = PsApeVariableDebtTokenImplementationAddress;
        } else if (reserveSymbol === ERC20TokenContractId.yAPE) {
          await deployAutoYieldApeImplAndAssignItToProxy(verify);
          if (!pYieldTokenImplementationAddress) {
            pYieldTokenImplementationAddress = (
              await deployPYieldToken(pool.address, verify)
            ).address;
          }
          xTokenToUse = pYieldTokenImplementationAddress;
        }

        if (!xTokenToUse) {
          if (!pTokenImplementationAddress) {
            pTokenImplementationAddress = (
              await deployGenericPTokenImpl(pool.address, verify)
            ).address;
          }
          xTokenToUse = pTokenImplementationAddress;
        }
      } else if (xTokenType[reserveSymbol] === "nft") {
        if (reserveSymbol === ERC721TokenContractId.MOONBIRD) {
          if (!nTokenMoonBirdImplementationAddress) {
            nTokenMoonBirdImplementationAddress = (
              await deployGenericMoonbirdNTokenImpl(
                pool.address,
                delegationRegistryAddress,
                verify
              )
            ).address;
          }
          xTokenToUse = nTokenMoonBirdImplementationAddress;
        } else if (reserveSymbol === ERC721TokenContractId.UniswapV3) {
          if (!nTokenUniSwapV3ImplementationAddress) {
            nTokenUniSwapV3ImplementationAddress = (
              await deployUniswapV3NTokenImpl(
                pool.address,
                delegationRegistryAddress,
                verify
              )
            ).address;
          }
          xTokenToUse = nTokenUniSwapV3ImplementationAddress;
        } else if (reserveSymbol === ERC721TokenContractId.BAYC) {
          const apeCoinStaking =
            (await getContractAddressInDb(eContractid.ApeCoinStaking)) ||
            (await deployApeCoinStaking(verify)).address;

          if (!nTokenBAYCImplementationAddress) {
            nTokenBAYCImplementationAddress = (
              await deployNTokenBAYCImpl(
                apeCoinStaking,
                pool.address,
                delegationRegistryAddress,
                verify
              )
            ).address;
          }
          xTokenToUse = nTokenBAYCImplementationAddress;
        } else if (reserveSymbol === ERC721TokenContractId.MAYC) {
          const apeCoinStaking =
            (await getContractAddressInDb(eContractid.ApeCoinStaking)) ||
            (await deployApeCoinStaking(verify)).address;

          if (!nTokenMAYCImplementationAddress) {
            nTokenMAYCImplementationAddress = (
              await deployNTokenMAYCImpl(
                apeCoinStaking,
                pool.address,
                delegationRegistryAddress,
                verify
              )
            ).address;
          }
          xTokenToUse = nTokenMAYCImplementationAddress;
        } else if (reserveSymbol === ERC721TokenContractId.BAKC) {
          if (!nTokenBAKCImplementationAddress) {
            const apeCoinStaking =
              (await getContractAddressInDb(eContractid.ApeCoinStaking)) ||
              (await deployApeCoinStaking(verify)).address;
            const protocolDataProvider = await getProtocolDataProvider();
            const allTokens = await protocolDataProvider.getAllXTokens();
            const nBAYC =
              // eslint-disable-next-line
              allTokens.find(
                (x) => x.symbol == NTokenContractId.nBAYC
              )!.tokenAddress;
            const nMAYC =
              // eslint-disable-next-line
              allTokens.find(
                (x) => x.symbol == NTokenContractId.nMAYC
              )!.tokenAddress;
            nTokenBAKCImplementationAddress = (
              await deployNTokenBAKCImpl(
                pool.address,
                apeCoinStaking,
                nBAYC,
                nMAYC,
                delegationRegistryAddress,
                verify
              )
            ).address;
          }
          xTokenToUse = nTokenBAKCImplementationAddress;
        } else if (reserveSymbol == ERC721TokenContractId.OTHR) {
          nTokenOTHRImplementationAddress = (
            await deployOtherdeedNTokenImpl(
              pool.address,
              hotWallet,
              delegationRegistryAddress,
              verify
            )
          ).address;

          xTokenToUse = nTokenOTHRImplementationAddress;
        } else if (reserveSymbol == ERC721TokenContractId.SFVLDR) {
          nTokenStakefishImplementationAddress = (
            await deployStakefishNTokenImpl(
              pool.address,
              delegationRegistryAddress,
              verify
            )
          ).address;

          xTokenToUse = nTokenStakefishImplementationAddress;
        } else if (reserveSymbol == ERC721TokenContractId.BLOCKS) {
          xTokenToUse = (
            await deployChromieSquiggleNTokenImpl(
              pool.address,
              delegationRegistryAddress,
              0,
              20, //set 20 in test environment for easy test. should be 9763 in mainnet
              verify
            )
          ).address;
        }

        if (!xTokenToUse) {
          if (!nTokenImplementationAddress) {
            nTokenImplementationAddress = (
              await deployGenericNTokenImpl(
                pool.address,
                false,
                delegationRegistryAddress,
                verify
              )
            ).address;
          }
          xTokenToUse = nTokenImplementationAddress;
        }
      } else {
        if (!delegationAwarePTokenImplementationAddress) {
          delegationAwarePTokenImplementationAddress = (
            await deployDelegationAwarePTokenImpl(pool.address, verify)
          ).address;
        }
        xTokenToUse = delegationAwarePTokenImplementationAddress;
      }

      if (!variableDebtTokenToUse) {
        if (!variableDebtTokenImplementationAddress) {
          variableDebtTokenImplementationAddress = await await (
            await deployGenericVariableDebtToken(pool.address, verify)
          ).address;
        }
        variableDebtTokenToUse = variableDebtTokenImplementationAddress;
      }

      inputs[i].xTokenImpl = xTokenToUse;
      inputs[i].variableDebtTokenImpl = variableDebtTokenToUse;
    }

    console.log(
      `  - Reserve ready for: ${chunkedSymbols[chunkIndex].join(", ")}`
    );

    if (DRY_RUN) {
      const encodedData = configurator.interface.encodeFunctionData(
        "initReserves",
        [inputs]
      );
      await dryRunEncodedData(configurator.address, encodedData);
    } else {
      const tx = await waitForTx(
        await configurator.initReserves(inputs, GLOBAL_OVERRIDES)
      );

      console.log("    * gasUsed", tx.gasUsed.toString());
    }
  }

  return gasUsage; // Deprecated
};

export const configureReservesByHelper = async (
  reserves: [string, IReserveParams][],
  tokenAddresses: {[symbol: string]: tEthereumAddress},
  helpers: ProtocolDataProvider,
  admin: tEthereumAddress,
  poolAddressesProviderProxyAddress?: tEthereumAddress,
  aclManagerAddress?: tEthereumAddress,
  reservesSetupHelperAddress?: tEthereumAddress
) => {
  const addressProvider = await getPoolAddressesProvider(
    poolAddressesProviderProxyAddress
  );
  const aclManager = await getACLManager(aclManagerAddress);
  const reservesSetupHelper = await getReservesSetupHelper(
    reservesSetupHelperAddress
  );

  const tokens: string[] = [];
  const symbols: string[] = [];

  const inputParams: {
    asset: string;
    baseLTV: BigNumberish;
    liquidationProtocolFeePercentage: BigNumberish;
    liquidationThreshold: BigNumberish;
    liquidationBonus: BigNumberish;
    reserveFactor: BigNumberish;
    borrowCap: BigNumberish;
    supplyCap: BigNumberish;
    borrowingEnabled: boolean;
  }[] = [];

  for (const [
    assetSymbol,
    {
      baseLTVAsCollateral,
      liquidationBonus,
      liquidationProtocolFeePercentage,
      liquidationThreshold,
      reserveFactor,
      borrowCap,
      supplyCap,
      borrowingEnabled,
    },
  ] of reserves) {
    if (!tokenAddresses[assetSymbol]) {
      console.log(
        `- Skipping config for ${assetSymbol} due token address is not set at markets config`
      );
      continue;
    }
    if (baseLTVAsCollateral === "-1") continue;

    const assetAddressIndex = Object.keys(tokenAddresses).findIndex(
      (value) => value === assetSymbol
    );
    const [, tokenAddress] = (
      Object.entries(tokenAddresses) as [string, string][]
    )[assetAddressIndex];
    const {usageAsCollateralEnabled: alreadyEnabled} =
      await helpers.getReserveConfigurationData(tokenAddress);

    if (alreadyEnabled) {
      console.log(
        `- Reserve ${assetSymbol} is already enabled as collateral, skipping`
      );
      continue;
    }
    // Push data
    console.log(assetSymbol, tokenAddress);
    inputParams.push({
      asset: tokenAddress,
      baseLTV: baseLTVAsCollateral,
      liquidationProtocolFeePercentage,
      liquidationThreshold,
      liquidationBonus,
      reserveFactor,
      borrowCap,
      supplyCap,
      borrowingEnabled: borrowingEnabled,
    });

    tokens.push(tokenAddress);
    symbols.push(assetSymbol);
  }
  if (tokens.length) {
    // Add reservesSetupHelper as temporal admin
    if (DRY_RUN) {
      const encodedData = aclManager.interface.encodeFunctionData(
        "addPoolAdmin",
        [reservesSetupHelper.address]
      );
      await dryRunEncodedData(aclManager.address, encodedData);
    } else {
      await waitForTx(
        await aclManager.addPoolAdmin(
          reservesSetupHelper.address,
          GLOBAL_OVERRIDES
        )
      );
    }

    // Deploy init per chunks
    const enableChunks = 20;
    const chunkedSymbols = chunk(symbols, enableChunks);
    const chunkedInputParams = chunk(inputParams, enableChunks);
    const poolConfiguratorAddress = await addressProvider.getPoolConfigurator();

    console.log(`- Configure reserves in ${chunkedInputParams.length} txs`);
    for (
      let chunkIndex = 0;
      chunkIndex < chunkedInputParams.length;
      chunkIndex++
    ) {
      if (DRY_RUN) {
        const encodedData = reservesSetupHelper.interface.encodeFunctionData(
          "configureReserves",
          [poolConfiguratorAddress, chunkedInputParams[chunkIndex]]
        );
        await dryRunEncodedData(reservesSetupHelper.address, encodedData);
      } else {
        await waitForTx(
          await reservesSetupHelper.configureReserves(
            poolConfiguratorAddress,
            chunkedInputParams[chunkIndex],
            GLOBAL_OVERRIDES
          )
        );
      }
      console.log(`  - Init for: ${chunkedSymbols[chunkIndex].join(", ")}`);
    }
    // Remove reservesSetupHelper as admin
    if (DRY_RUN) {
      const encodedData = aclManager.interface.encodeFunctionData(
        "removePoolAdmin",
        [reservesSetupHelper.address]
      );
      await dryRunEncodedData(aclManager.address, encodedData);
    } else {
      await waitForTx(
        await aclManager.removePoolAdmin(
          reservesSetupHelper.address,
          GLOBAL_OVERRIDES
        )
      );
    }
  }
};
