import {getParaSpaceConfig, waitForTx} from "../../helpers/misc-utils";
import {
  deployDelegationAwarePTokenImpl,
  deployGenericPTokenImpl,
  deployPTokenAToken,
  deployPTokenSApe,
  deployPTokenStETH,
} from "../../helpers/contracts-deployments";
import {
  getPoolAddressesProvider,
  getPoolConfiguratorProxy,
  getProtocolDataProvider,
  getPToken,
} from "../../helpers/contracts-getters";
import {NTokenContractId, XTokenType} from "../../helpers/types";

import dotenv from "dotenv";
import {DRY_RUN, GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {printEncodedData} from "../../helpers/contracts-helpers";

dotenv.config();

export const upgradePToken = async (verify = false) => {
  const addressesProvider = await getPoolAddressesProvider();
  const paraSpaceConfig = getParaSpaceConfig();
  const poolAddress = await addressesProvider.getPool();
  const poolConfiguratorProxy = await getPoolConfiguratorProxy(
    await addressesProvider.getPoolConfigurator()
  );
  const protocolDataProvider = await getProtocolDataProvider();
  const allXTokens = await protocolDataProvider.getAllXTokens();
  let pTokenImplementationAddress = "";
  let pTokenDelegationAwareImplementationAddress = "";
  let pTokenStETHImplementationAddress = "";
  let pTokenSApeImplementationAddress = "";
  let pTokenATokenImplementationAddress = "";
  let newImpl = "";

  for (let i = 0; i < allXTokens.length; i++) {
    const token = allXTokens[i];
    const pToken = await getPToken(token.tokenAddress);
    const name = await pToken.name();
    const symbol = await pToken.symbol();
    const asset = await pToken.UNDERLYING_ASSET_ADDRESS();
    const xTokenType = await pToken.getXTokenType();
    if (
      ![
        XTokenType.PToken,
        XTokenType.DelegationAwarePToken,
        XTokenType.PTokenStETH,
        XTokenType.PTokenSApe,
        XTokenType.PTokenAToken,
      ].includes(xTokenType)
    ) {
      continue;
    }
    const treasury = paraSpaceConfig.Treasury;
    const incentivesController = paraSpaceConfig.IncentivesController;

    if (xTokenType == XTokenType.PTokenAToken) {
      if (!pTokenATokenImplementationAddress) {
        console.log("deploy PTokenAToken implementation");
        pTokenATokenImplementationAddress = (
          await deployPTokenAToken(poolAddress, verify)
        ).address;
      }
      newImpl = pTokenATokenImplementationAddress;
    } else if (xTokenType == XTokenType.PTokenSApe) {
      if (!pTokenSApeImplementationAddress) {
        console.log("deploy PTokenSApe implementation");
        const nBAYC =
          // eslint-disable-next-line
          allXTokens.find(
            (x) => x.symbol == NTokenContractId.nBAYC
          )!.tokenAddress;
        const nMAYC =
          // eslint-disable-next-line
          allXTokens.find(
            (x) => x.symbol == NTokenContractId.nMAYC
          )!.tokenAddress;
        pTokenSApeImplementationAddress = (
          await deployPTokenSApe(poolAddress, nBAYC, nMAYC, verify)
        ).address;
      }
      newImpl = pTokenSApeImplementationAddress;
    } else if (xTokenType == XTokenType.PTokenStETH) {
      if (!pTokenStETHImplementationAddress) {
        console.log("deploy PTokenStETH implementation");
        pTokenStETHImplementationAddress = (
          await deployPTokenStETH(poolAddress, verify)
        ).address;
      }
      newImpl = pTokenStETHImplementationAddress;
    } else if (xTokenType == XTokenType.DelegationAwarePToken) {
      if (!pTokenDelegationAwareImplementationAddress) {
        console.log("deploy PTokenDelegationAware implementation");
        pTokenDelegationAwareImplementationAddress = (
          await deployDelegationAwarePTokenImpl(poolAddress, verify)
        ).address;
      }
      newImpl = pTokenDelegationAwareImplementationAddress;
    } else if (xTokenType == XTokenType.PToken) {
      if (!pTokenImplementationAddress) {
        console.log("deploy PToken implementation");
        pTokenImplementationAddress = (
          await deployGenericPTokenImpl(poolAddress, verify)
        ).address;
      }
      newImpl = pTokenImplementationAddress;
    } else {
      continue;
    }

    const oldRevision = (await pToken.PTOKEN_REVISION()).toNumber();
    const newRevision = (
      await (await getPToken(newImpl)).PTOKEN_REVISION()
    ).toNumber();

    if (oldRevision == newRevision) {
      continue;
    }

    console.log(
      `upgrading ${token.symbol}'s version from v${oldRevision} to v${newRevision}`
    );
    const updateInput = {
      asset: asset,
      treasury: treasury,
      incentivesController: incentivesController,
      name: name,
      symbol: symbol,
      implementation: newImpl,
      params: "0x10",
    };
    if (DRY_RUN) {
      const encodedData = poolConfiguratorProxy.interface.encodeFunctionData(
        "updatePToken",
        [updateInput]
      );
      await printEncodedData(poolConfiguratorProxy.address, encodedData);
    } else {
      await waitForTx(
        await poolConfiguratorProxy.updatePToken(updateInput, GLOBAL_OVERRIDES)
      );
    }
  }

  console.log("upgraded all ptoken implementation.\n");
};
