import {waitForTx} from "../../../helpers/misc-utils";
import {deployPoolComponents} from "../../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getPoolAddressesProvider,
} from "../../../helpers/contracts-getters";

import dotenv from "dotenv";
import {ZERO_ADDRESS} from "../../../helpers/constants";
import {upgradePToken} from "./upgrade_ptoken";
import {upgradeNToken} from "./upgrade_ntoken";
import {ETHERSCAN_VERIFICATION} from "../../../helpers/hardhat-constants";

dotenv.config();

export const upgradeAll = async () => {
  await upgradePool();
  await upgradePToken();
  await upgradeNToken();
  console.log("upgrade all finished!");
};

export const upgradePool = async () => {
  const addressesProvider = await getPoolAddressesProvider();
  console.time("deploy PoolComponent");
  const {
    poolCore,
    poolParameters,
    poolMarketplace,
    poolApeStaking,
    poolCoreSelectors,
    poolParametersSelectors,
    poolMarketplaceSelectors,
    poolApeStakingSelectors,
  } = await deployPoolComponents(
    addressesProvider.address,
    ETHERSCAN_VERIFICATION
  );
  console.timeEnd("deploy PoolComponent");

  console.time("upgrade PoolCore");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      [
        {
          implAddress: poolCore.address,
          action: 1,
          functionSelectors: poolCoreSelectors,
        },
      ],
      ZERO_ADDRESS,
      "0x"
    )
  );
  console.timeEnd("upgrade PoolCore");

  console.time("upgrade PoolParameters");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      [
        {
          implAddress: poolParameters.address,
          action: 1, //replace
          functionSelectors: poolParametersSelectors,
        },
      ],
      ZERO_ADDRESS,
      "0x"
    )
  );
  console.timeEnd("upgrade PoolParameters");

  console.time("upgrade PoolMarketplace");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      [
        {
          implAddress: poolMarketplace.address,
          action: 1,
          functionSelectors: poolMarketplaceSelectors,
        },
      ],
      ZERO_ADDRESS,
      "0x"
    )
  );
  console.timeEnd("upgrade PoolMarketplace");

  console.time("upgrade PoolApeStaking");
  await waitForTx(
    await addressesProvider.updatePoolImpl(
      [
        {
          implAddress: poolApeStaking.address,
          action: 1,
          functionSelectors: poolApeStakingSelectors,
        },
      ],
      ZERO_ADDRESS,
      "0x"
    )
  );
  console.timeEnd("upgrade PoolApeStaking");
};

export const removePoolFuncs = async () => {
  const poolAdmin = await getFirstSigner();
  const addressesProvider = (await getPoolAddressesProvider()).connect(
    poolAdmin
  );

  const FUNCS_TO_REMOVE = process.env.FUNCS_TO_REMOVE?.replace(
    /\[|\]|'/g,
    ""
  ).split(",");

  if (FUNCS_TO_REMOVE && FUNCS_TO_REMOVE.length) {
    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: ZERO_ADDRESS,
            action: 2,
            functionSelectors: FUNCS_TO_REMOVE,
          },
        ],
        ZERO_ADDRESS,
        "0x"
      )
    );
  }
};

export const addPoolFuncs = async () => {
  const poolAdmin = await getFirstSigner();
  const addressesProvider = (await getPoolAddressesProvider()).connect(
    poolAdmin
  );

  console.time("deploy PoolComponent");
  const {
    poolCore,
    poolParameters,
    poolMarketplace,
    poolApeStaking,
    poolCoreSelectors,
    poolParametersSelectors,
    poolMarketplaceSelectors,
    poolApeStakingSelectors,
  } = await deployPoolComponents(
    addressesProvider.address,
    ETHERSCAN_VERIFICATION
  );
  console.timeEnd("deploy PoolComponent");

  const FUNCS_TO_ADD = process.env.FUNCS_TO_ADD?.replace(/\[|\]|'/g, "").split(
    ","
  );

  if (FUNCS_TO_ADD && FUNCS_TO_ADD.length) {
    const PoolCoreFuncs = FUNCS_TO_ADD.filter((func) =>
      poolCoreSelectors.includes(func)
    );
    console.log("PoolCoreFuncs to add:", PoolCoreFuncs);
    if (PoolCoreFuncs && PoolCoreFuncs.length) {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          [
            {
              implAddress: poolCore.address,
              action: 0,
              functionSelectors: PoolCoreFuncs,
            },
          ],
          ZERO_ADDRESS,
          "0x"
        )
      );
    }
    const PoolParametersFuncs = FUNCS_TO_ADD.filter((func) =>
      poolParametersSelectors.includes(func)
    );
    console.log("PoolParametersFuncs to add:", PoolParametersFuncs);
    if (PoolParametersFuncs && PoolParametersFuncs.length) {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          [
            {
              implAddress: poolParameters.address,
              action: 0,
              functionSelectors: PoolParametersFuncs,
            },
          ],
          ZERO_ADDRESS,
          "0x"
        )
      );
    }
    const PoolMarketplaceFuncs = FUNCS_TO_ADD.filter((func) =>
      poolMarketplaceSelectors.includes(func)
    );
    console.log("PoolMarketplaceFuncs to add:", PoolMarketplaceFuncs);
    if (PoolMarketplaceFuncs && PoolMarketplaceFuncs.length) {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          [
            {
              implAddress: poolMarketplace.address,
              action: 0,
              functionSelectors: PoolMarketplaceFuncs,
            },
          ],
          ZERO_ADDRESS,
          "0x"
        )
      );
    }

    const PoolApeStakingFuncs = FUNCS_TO_ADD.filter((func) =>
      poolApeStakingSelectors.includes(func)
    );
    console.log("PoolApeStakingFuncs to add:", PoolApeStakingFuncs);
    if (PoolApeStakingFuncs && PoolApeStakingFuncs.length) {
      await waitForTx(
        await addressesProvider.updatePoolImpl(
          [
            {
              implAddress: poolApeStaking.address,
              action: 0,
              functionSelectors: PoolApeStakingFuncs,
            },
          ],
          ZERO_ADDRESS,
          "0x"
        )
      );
    }
  }
};
