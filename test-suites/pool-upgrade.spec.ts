import {evmRevert, evmSnapshot, waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {liquidateAndValidateReverted} from "./helpers/validated-steps";
import {getFirstSigner} from "../deploy/helpers/contracts-getters";
import {deployPoolCoreLibraries} from "../deploy/helpers/contracts-deployments";
import {PoolCore__factory, PoolCoreV2__factory} from "../types";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {getFunctionSignatures} from "../deploy/helpers/contracts-helpers";

describe("Pool: Upgrade", () => {
  let testEnv: TestEnv;
  let snapShot: string;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });
  beforeEach(async () => {
    snapShot = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapShot);
  });

  it("upgrade:disable liquidation by remove liquidateERC20 in current pool", async () => {
    const {
      addressesProvider,
      weth,
      usdc,
      users: [borrower, liquidator],
    } = testEnv;

    await liquidateAndValidateReverted(
      weth,
      usdc,
      "1000",
      liquidator,
      borrower,
      false,
      //before upgrade only protocolError
      ProtocolErrors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
    );

    const liquidateERC20Signature = getFunctionSignatures(
      PoolCore__factory.abi
    ).filter((s) => s.name.includes("liquidateERC20"))[0].signature;

    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: ZERO_ADDRESS,
            action: 2, //remove function
            functionSelectors: [liquidateERC20Signature],
          },
        ],
        ZERO_ADDRESS,
        "0x"
      )
    );

    await liquidateAndValidateReverted(
      weth,
      usdc,
      "1000",
      liquidator,
      borrower,
      false,
      //after upgrade error as "function does not exist"
      "ParaProxy: Function does not exist"
    );
  });

  it("upgrade:disable liquidation by upgrading to a new pool contract which will revert liquidateERC20", async () => {
    const {
      addressesProvider,
      weth,
      usdc,
      users: [borrower, liquidator],
    } = testEnv;

    await liquidateAndValidateReverted(
      weth,
      usdc,
      "1000",
      liquidator,
      borrower,
      false,
      ProtocolErrors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
    );

    const poolCoreV2Selectors = getFunctionSignatures(
      PoolCoreV2__factory.abi
    ).map((s) => s.signature);

    const coreLibraries = await deployPoolCoreLibraries();

    const poolCoreV2 = await new PoolCoreV2__factory(
      coreLibraries,
      await getFirstSigner()
    ).deploy(addressesProvider.address);

    await waitForTx(
      await addressesProvider.updatePoolImpl(
        [
          {
            implAddress: poolCoreV2.address,
            action: 1, //replace
            functionSelectors: poolCoreV2Selectors,
          },
        ],
        ZERO_ADDRESS,
        "0x"
      )
    );

    await liquidateAndValidateReverted(
      weth,
      usdc,
      "1000",
      liquidator,
      borrower,
      false,
      //after upgrading to a new contract error as "emergency disable call"
      ProtocolErrors.EMEGENCY_DISABLE_CALL
    );
  });
});
