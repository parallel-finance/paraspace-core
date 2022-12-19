import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {ONE_ADDRESS, ZERO_ADDRESS} from "../helpers/constants";
import {
  getFirstSigner,
  getMockInitializableImple,
  getMockInitializableImpleV2,
  getMockVariableDebtToken,
  getPToken,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {
  deployInitializableImmutableAdminUpgradeabilityProxy,
  deployMockInitializableFromConstructorImple,
  deployMockInitializableImple,
  deployMockInitializableImpleV2,
  deployMockPToken,
  deployMockReentrantInitializableImple,
  deployMockVariableDebtToken,
  deployPoolCoreLibraries,
} from "../helpers/contracts-deployments";
import {
  getEthersSigners,
  getFunctionSignatures,
} from "../helpers/contracts-helpers";
import {
  InitializableImmutableAdminUpgradeabilityProxy,
  InitializableImmutableAdminUpgradeabilityProxy__factory,
  PoolCoreV2__factory,
  PoolCore__factory,
} from "../types";
import {ProtocolErrors} from "../helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {liquidateAndValidateReverted} from "./helpers/validated-steps";
import {waitForTx} from "../helpers/misc-utils";
import {ETHERSCAN_VERIFICATION} from "../helpers/hardhat-constants";

describe("Upgradeability", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });

  context("VersionedInitializable", async () => {
    it("TC-upgradeability-01 Call initialize from the constructor function", async () => {
      const initValue = "1";
      const implementation = await deployMockInitializableFromConstructorImple(
        [initValue],
        ETHERSCAN_VERIFICATION
      );
      expect(await implementation.value()).to.be.eq(initValue);
    });

    it("TC-upgradeability-02 Call initialize from the initialize function (reentrant)", async () => {
      const initValue = 1;
      const finalValue = 2;
      const implementation = await deployMockReentrantInitializableImple(
        ETHERSCAN_VERIFICATION
      );
      expect(await implementation.initialize(initValue));
      expect(await implementation.value()).to.be.eq(
        finalValue,
        `value is not ${finalValue}`
      );
    });

    it("TC-upgradeability-03 Tries to initialize once it is already initialized (revert expected)", async () => {
      const implementation = await deployMockInitializableImple(
        ETHERSCAN_VERIFICATION
      );
      expect(
        await implementation.initialize(
          10, // value
          "some text", // text
          [10, 20, 30]
        )
      );
      await expect(
        implementation.initialize(
          100, // value
          "some text", // text
          [100, 200, 300]
        )
      ).to.be.revertedWith("Contract instance has already been initialized");
    });
  });

  context("InitializableImmutableAdminUpgradeabilityProxy", async () => {
    let proxyAdminOwner, nonAdmin;
    let implementationV1, implementationV2, proxiedImpl;
    let proxy: InitializableImmutableAdminUpgradeabilityProxy;

    before(async () => {
      [proxyAdminOwner, , nonAdmin] = await getEthersSigners();
    });

    beforeEach(async () => {
      testEnv = await loadFixture(testEnvFixture);

      implementationV1 = await deployMockInitializableImple(
        ETHERSCAN_VERIFICATION
      );
      implementationV2 = await deployMockInitializableImpleV2(
        ETHERSCAN_VERIFICATION
      );
      const encodedInitialize = implementationV1.interface.encodeFunctionData(
        "initialize",
        [
          0, // value
          "text", // text
          [1, 2, 3], // values
        ]
      );
      proxy = await deployInitializableImmutableAdminUpgradeabilityProxy(
        [proxyAdminOwner.address],
        ETHERSCAN_VERIFICATION
      );
      expect(
        await proxy.initialize(implementationV1.address, encodedInitialize)
      );
      proxiedImpl = await getMockInitializableImple(proxy.address);
    });

    it("TC-upgradeability-04 initialize() implementation version is correct", async () => {
      expect(await proxiedImpl.connect(nonAdmin).REVISION()).to.be.eq(
        1,
        "impl revision is not 1"
      );
    });

    it("TC-upgradeability-05 initialize() implementation initialization is correct", async () => {
      expect(await proxiedImpl.connect(nonAdmin).value()).to.be.eq(
        0,
        "impl value is not 0"
      );
      expect(await proxiedImpl.connect(nonAdmin).text()).to.be.eq(
        "text",
        "impl text is not correct"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(0)).to.be.eq(
        1,
        "impl values[0] is not 1"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(1)).to.be.eq(
        2,
        "impl values[1] is not 2"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(2)).to.be.eq(
        3,
        "impl values[2] is not 3"
      );
    });

    it("TC-upgradeability-06 initialize() when initializing the proxy once it is already initialized (revert expected)", async () => {
      const encodedInitialize = proxiedImpl.interface.encodeFunctionData(
        "initialize",
        [
          10, // value
          "some text", // text
          [10, 20, 30],
        ]
      );
      await expect(
        proxy.initialize(implementationV1.address, encodedInitialize)
      ).to.be.reverted;
    });

    it("TC-upgradeability-07 initialize() when initializing the impl from non-admin address once it is already initialized (revert expected)", async () => {
      await expect(
        proxiedImpl.connect(nonAdmin).initialize(
          10, // value
          "some text", // text
          [10, 20, 30]
        )
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("TC-upgradeability-08 initialize() when initializing the impl from admin address once it is already initialized (revert expected)", async () => {
      await expect(
        proxiedImpl.connect(proxyAdminOwner).initialize(
          10, // value
          "some text", // text
          [10, 20, 30]
        )
      ).to.be.revertedWith(
        "Cannot call fallback function from the proxy admin"
      );
    });

    it("TC-upgradeability-09 initialize() deploy a proxy and call to initialize() with no initialization data", async () => {
      proxy = await (
        await new InitializableImmutableAdminUpgradeabilityProxy__factory(
          await getFirstSigner()
        ).deploy(proxyAdminOwner.address)
      ).deployed();
      expect(await proxy.initialize(implementationV1.address, Buffer.from("")));
    });

    it("TC-upgradeability-10 initialize() while calling initialize() with wrong initialization data (revert expected)", async () => {
      proxy = await (
        await new InitializableImmutableAdminUpgradeabilityProxy__factory(
          await getFirstSigner()
        ).deploy(proxyAdminOwner.address)
      ).deployed();
      // Initialize with wrong initialization data
      await expect(
        proxy.initialize(
          implementationV1.address,
          Buffer.from("wrongInitialize")
        )
      ).to.be.reverted;
    });

    it("TC-upgradeability-11 admin() non-view function from admin address", async () => {
      expect(await proxy.connect(proxyAdminOwner).admin());
    });

    it("TC-upgradeability-12 admin() non-view function from non-admin address", async () => {
      await expect(proxy.connect(nonAdmin).admin()).to.be.reverted;
    });

    it("TC-upgradeability-13 admin() callStatic from admin address", async () => {
      expect(await proxy.connect(proxyAdminOwner).callStatic.admin()).to.be.eq(
        proxyAdminOwner.address,
        "proxy admin address not correct"
      );
    });

    it("TC-upgradeability-14 implementation() non-view function from admin address", async () => {
      expect(await proxy.connect(proxyAdminOwner).implementation());
    });

    it("TC-upgradeability-15 implementation() non-view function from non-admin address", async () => {
      await expect(proxy.connect(nonAdmin).implementation()).to.be.reverted;
    });

    it("TC-upgradeability-16 implementation() callStatic from admin address", async () => {
      expect(
        await proxy.connect(proxyAdminOwner).callStatic.implementation()
      ).to.be.eq(
        implementationV1.address,
        "proxy implementation address not correct"
      );
    });

    it("TC-upgradeability-17 upgradeTo() to a new imple from non-admin address (revert expected)", async () => {
      await expect(proxy.connect(nonAdmin).upgradeTo(implementationV2.address))
        .to.be.reverted;
    });

    it("TC-upgradeability-18 upgradeTo() to a non-contract imple from admin address (revert expected)", async () => {
      await expect(
        proxy.connect(proxyAdminOwner).upgradeTo(ONE_ADDRESS)
      ).to.be.revertedWith(
        "Cannot set a proxy implementation to a non-contract address"
      );
    });

    it("TC-upgradeability-19 upgradeTo() to a new imple from admin address", async () => {
      expect(await proxiedImpl.connect(nonAdmin).REVISION()).to.be.eq(
        1,
        "impl revision is not 1"
      );

      await expect(
        proxy.connect(proxyAdminOwner).upgradeTo(implementationV2.address)
      )
        .to.emit(proxy, "Upgraded")
        .withArgs(implementationV2.address);

      proxiedImpl = await getMockInitializableImpleV2(proxy.address);
      expect(await proxiedImpl.connect(nonAdmin).REVISION()).to.be.eq(
        2,
        "impl revision is not 2"
      );

      // Check proxy storage layout keeps the same
      expect(await proxiedImpl.connect(nonAdmin).value()).to.be.eq(
        0,
        "impl value is not 0"
      );
      expect(await proxiedImpl.connect(nonAdmin).text()).to.be.eq(
        "text",
        "impl text is not correct"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(0)).to.be.eq(
        1,
        "impl values[0] is not 1"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(1)).to.be.eq(
        2,
        "impl values[1] is not 2"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(2)).to.be.eq(
        3,
        "impl values[2] is not 3"
      );

      // Initialize
      await proxiedImpl.connect(nonAdmin).initialize(
        10, // value
        "some text", // text
        [10, 20, 30]
      );
      expect(await proxiedImpl.connect(nonAdmin).value()).to.be.eq(
        10,
        "impl value is not 0"
      );
      expect(await proxiedImpl.connect(nonAdmin).text()).to.be.eq(
        "some text",
        "impl text not correct"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(0)).to.be.eq(
        10,
        "impl values[0] not 10"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(1)).to.be.eq(
        20,
        "impl values[1] not 20"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(2)).to.be.eq(
        30,
        "impl values[2] not 30"
      );
    });

    it("TC-upgradeability-20 upgradeTo() when initializing the new imple from admin address (revert expected)", async () => {
      await expect(
        proxy.connect(proxyAdminOwner).upgradeTo(implementationV2.address)
      )
        .to.emit(proxy, "Upgraded")
        .withArgs(implementationV2.address);
      // Initialize
      await proxiedImpl.connect(nonAdmin).initialize(
        10, // value
        "some text", // text
        [10, 20, 30]
      );
      await expect(
        proxiedImpl.connect(nonAdmin).initialize(
          10, // value
          "some text", // text
          [10, 20, 30]
        )
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("TC-upgradeability-21 upgradeToAndCall() to a new impl from non-admin address (revert expected)", async () => {
      await expect(
        proxy
          .connect(nonAdmin)
          .upgradeToAndCall(implementationV2.address, Buffer.from(""))
      ).to.be.reverted;
    });

    it("TC-upgradeability-22 upgradeToAndCall() to a non-contract impl from admin address (revert expected)", async () => {
      await expect(
        proxy
          .connect(proxyAdminOwner)
          .upgradeToAndCall(ONE_ADDRESS, Buffer.from(""))
      ).to.be.revertedWith(
        "Cannot set a proxy implementation to a non-contract address"
      );
    });

    it("TC-upgradeability-23 upgradeToAndCall() to a new impl from admin address", async () => {
      expect(await proxiedImpl.connect(nonAdmin).REVISION()).to.be.eq(
        1,
        "impl revision is not 1"
      );

      const encodedInitialize = implementationV1.interface.encodeFunctionData(
        "initialize",
        [
          10, // value
          "some text", // text
          [10, 20, 30],
        ]
      );
      await expect(
        proxy
          .connect(proxyAdminOwner)
          .upgradeToAndCall(implementationV2.address, encodedInitialize)
      )
        .to.emit(proxy, "Upgraded")
        .withArgs(implementationV2.address);

      proxiedImpl = await getMockInitializableImpleV2(proxy.address);

      // Check initialization
      expect(await proxiedImpl.connect(nonAdmin).REVISION()).to.be.eq(
        2,
        "impl revision is not 2"
      );
      expect(await proxiedImpl.connect(nonAdmin).value()).to.be.eq(
        10,
        "impl value is not 0"
      );
      expect(await proxiedImpl.connect(nonAdmin).text()).to.be.eq(
        "some text",
        "impl text not correct"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(0)).to.be.eq(
        10,
        "impl values[0] not 10"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(1)).to.be.eq(
        20,
        "impl values[1] not 20"
      );
      expect(await proxiedImpl.connect(nonAdmin).values(2)).to.be.eq(
        30,
        "impl values[2] not 30"
      );
    });

    it("TC-upgradeability-24 upgradeToAndCall() for a new proxied contract with no initialize function (revert expected)", async () => {
      const impl = await deployMockInitializableImple(ETHERSCAN_VERIFICATION);
      const encodedInitialize = Buffer.from("");
      await expect(
        proxy
          .connect(proxyAdminOwner)
          .upgradeToAndCall(impl.address, encodedInitialize)
      ).reverted;
    });

    it("TC-upgradeability-25 upgradeToAndCall() when initializing the new impl from admin address once it is already initialized (revert expected)", async () => {
      const encodedInitialize = implementationV1.interface.encodeFunctionData(
        "initialize",
        [
          10, // value
          "some text", // text
          [10, 20, 30],
        ]
      );
      await expect(
        proxy
          .connect(proxyAdminOwner)
          .upgradeToAndCall(implementationV2.address, encodedInitialize)
      )
        .to.emit(proxy, "Upgraded")
        .withArgs(implementationV2.address);
      await expect(
        proxiedImpl.connect(nonAdmin).initialize(
          10, // value
          "some text", // text
          [10, 20, 30]
        )
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("TC-upgradeability-26 implementation.setValue() call through the proxy", async () => {
      const newValue = 123;
      expect(await proxiedImpl.connect(nonAdmin).value()).to.be.eq(
        0,
        "value not correct"
      );
      expect(await proxiedImpl.connect(nonAdmin).setValueViaProxy(newValue));
      expect(await proxiedImpl.connect(nonAdmin).value()).to.be.eq(
        123,
        "value not correct"
      );
    });

    it("TC-upgradeability-27 implementation.setValue() direct call to the implementation", async () => {
      const newValue = 123;
      expect(await implementationV1.value()).to.be.eq(0, "value not correct");
      expect(await implementationV1.setValue(newValue));
      expect(await implementationV1.value()).to.be.eq(123, "value not correct");
    });
  });

  context("PoolConfigurator upgrade ability", () => {
    const {CALLER_NOT_POOL_ADMIN} = ProtocolErrors;
    let newPTokenAddress: string;
    let newVariableTokenAddress: string;

    before("deploying instances", async () => {
      const {dai, pool} = testEnv;
      const xTokenInstance = await deployMockPToken(
        [
          pool.address,
          dai.address,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          "ParaSpace Interest bearing DAI updated",
          "pDAI",
          "0x10",
        ],
        ETHERSCAN_VERIFICATION
      );

      const variableDebtTokenInstance = await deployMockVariableDebtToken(
        [
          pool.address,
          dai.address,
          ZERO_ADDRESS,
          "ParaSpace variable debt bearing DAI updated",
          "variableDebtDAI",
          "0x10",
        ],
        ETHERSCAN_VERIFICATION
      );

      newPTokenAddress = xTokenInstance.address;
      newVariableTokenAddress = variableDebtTokenInstance.address;
    });

    it("TC-upgradeability-28 Tries to update the DAI Ptoken implementation with a different address than the poolManager (revert expected)", async () => {
      const {dai, configurator, users} = testEnv;

      const name = await (await getPToken(newPTokenAddress)).name();
      const symbol = await (await getPToken(newPTokenAddress)).symbol();

      const updatePTokenInputParams: {
        asset: string;
        treasury: string;
        incentivesController: string;
        name: string;
        symbol: string;
        implementation: string;
        params: string;
      } = {
        asset: dai.address,
        treasury: ZERO_ADDRESS,
        incentivesController: ZERO_ADDRESS,
        name: name,
        symbol: symbol,
        implementation: newPTokenAddress,
        params: "0x10",
      };
      await expect(
        configurator
          .connect(users[1].signer)
          .updatePToken(updatePTokenInputParams)
      ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
    });

    it("TC-upgradeability-29 Upgrades the DAI Ptoken implementation ", async () => {
      const {dai, configurator, pDai} = testEnv;

      const name = await (await getPToken(newPTokenAddress)).name();
      const symbol = await (await getPToken(newPTokenAddress)).symbol();

      const updatePTokenInputParams: {
        asset: string;
        treasury: string;
        incentivesController: string;
        name: string;
        symbol: string;
        implementation: string;
        params: string;
      } = {
        asset: dai.address,
        treasury: ZERO_ADDRESS,
        incentivesController: ZERO_ADDRESS,
        name: name,
        symbol: symbol,
        implementation: newPTokenAddress,
        params: "0x10",
      };
      await configurator.updatePToken(updatePTokenInputParams, {
        gasLimit: 5000000,
      });

      const tokenName = await pDai.name();

      expect(tokenName).to.be.eq(
        "ParaSpace Interest bearing DAI updated",
        "Invalid token name"
      );
    });

    it("TC-upgradeability-30 Tries to update the DAI variable debt token implementation with a different address than the poolManager (revert expected)", async () => {
      const {dai, configurator, users} = testEnv;

      const name = await (
        await getVariableDebtToken(newVariableTokenAddress)
      ).name();
      const symbol = await (
        await getVariableDebtToken(newVariableTokenAddress)
      ).symbol();

      const updateDebtTokenInput: {
        asset: string;
        incentivesController: string;
        name: string;
        symbol: string;
        implementation: string;
        params: string;
      } = {
        asset: dai.address,
        incentivesController: ZERO_ADDRESS,
        name: name,
        symbol: symbol,
        implementation: newVariableTokenAddress,
        params: "0x10",
      };

      await expect(
        configurator
          .connect(users[1].signer)
          .updateVariableDebtToken(updateDebtTokenInput)
      ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
    });

    it("TC-upgradeability-31 Upgrades the DAI variable debt token implementation ", async () => {
      const {dai, configurator, protocolDataProvider} = testEnv;

      const name = await (
        await getVariableDebtToken(newVariableTokenAddress)
      ).name();
      const symbol = await (
        await getVariableDebtToken(newVariableTokenAddress)
      ).symbol();

      const updateDebtTokenInput: {
        asset: string;
        incentivesController: string;
        name: string;
        symbol: string;
        implementation: string;
        params: string;
      } = {
        asset: dai.address,
        incentivesController: ZERO_ADDRESS,
        name: name,
        symbol: symbol,
        implementation: newVariableTokenAddress,
        params: "0x10",
      };

      expect(await configurator.updateVariableDebtToken(updateDebtTokenInput));

      const {variableDebtTokenAddress} =
        await protocolDataProvider.getReserveTokensAddresses(dai.address);

      const debtToken = await getMockVariableDebtToken(
        variableDebtTokenAddress
      );

      const tokenName = await debtToken.name();

      expect(tokenName).to.be.eq(
        "ParaSpace variable debt bearing DAI updated",
        "Invalid token name"
      );
    });
  });

  context("Pool Upgrade", () => {
    let testEnv: TestEnv;

    beforeEach(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });

    it("TC-upgradeability-32 Disable liquidation by remove liquidateERC20 in current pool", async () => {
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

    it("TC-upgradeability-33: Disable liquidation by upgrading to a new pool contract which will revert liquidateERC20", async () => {
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

      const coreLibraries = await deployPoolCoreLibraries(
        ETHERSCAN_VERIFICATION
      );

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
});
