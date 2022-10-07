import {expect} from "chai";
import {makeSuite, TestEnv} from "./helpers/make-suite";
import {ONE_ADDRESS, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {
  getFirstSigner,
  getMockInitializableImple,
  getMockInitializableImpleV2,
  getMockStableDebtToken,
  getMockVariableDebtToken,
  getPToken,
  getStableDebtToken,
  getVariableDebtToken,
} from "../deploy/helpers/contracts-getters";
import {
  deployInitializableImmutableAdminUpgradeabilityProxy,
  deployMockInitializableFromConstructorImple,
  deployMockInitializableImple,
  deployMockInitializableImpleV2,
  deployMockPToken,
  deployMockReentrantInitializableImple,
  deployMockStableDebtToken,
  deployMockVariableDebtToken,
} from "../deploy/helpers/contracts-deployments";
import {getEthersSigners} from "../deploy/helpers/contracts-helpers";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";
import {
  InitializableImmutableAdminUpgradeabilityProxy,
  InitializableImmutableAdminUpgradeabilityProxy__factory,
} from "../types";
import {ProtocolErrors} from "../deploy/helpers/types";

makeSuite("Upgradeability", (testEnv: TestEnv) => {
  context("VersionedInitializable", async () => {
    it("Call initialize from the constructor function", async () => {
      const initValue = "1";
      const implementation = await deployMockInitializableFromConstructorImple([
        initValue,
      ]);
      expect(await implementation.value()).to.be.eq(initValue);
    });

    it("Call initialize from the initialize function (reentrant)", async () => {
      const initValue = 1;
      const finalValue = 2;
      const implementation = await deployMockReentrantInitializableImple();
      expect(await implementation.initialize(initValue));
      expect(await implementation.value()).to.be.eq(
        finalValue,
        `value is not ${finalValue}`
      );
    });

    it("Tries to initialize once it is already initialized (revert expected)", async () => {
      const implementation = await deployMockInitializableImple();
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
    let snap: string;

    // eslint-disable-next-line
    let proxyAdminOwner, newAdmin, nonAdmin;
    let implementationV1, implementationV2, proxiedImpl;
    let proxy: InitializableImmutableAdminUpgradeabilityProxy;

    beforeEach(async () => {
      snap = await evmSnapshot();

      implementationV1 = await deployMockInitializableImple();
      implementationV2 = await deployMockInitializableImpleV2();
      const encodedInitialize = implementationV1.interface.encodeFunctionData(
        "initialize",
        [
          0, // value
          "text", // text
          [1, 2, 3], // values
        ]
      );
      proxy = await deployInitializableImmutableAdminUpgradeabilityProxy([
        proxyAdminOwner.address,
      ]);
      expect(
        await proxy.initialize(implementationV1.address, encodedInitialize)
      );
      proxiedImpl = await getMockInitializableImple(proxy.address);
    });
    afterEach(async () => {
      await evmRevert(snap);
    });

    before(async () => {
      const {users} = testEnv;
      [proxyAdminOwner, newAdmin, nonAdmin] = users;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      [proxyAdminOwner, newAdmin, nonAdmin] = await getEthersSigners();
    });

    it("initialize() implementation version is correct", async () => {
      expect(await proxiedImpl.connect(nonAdmin).REVISION()).to.be.eq(
        1,
        "impl revision is not 1"
      );
    });

    it("initialize() implementation initialization is correct", async () => {
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

    it("initialize() when initializing the proxy once it is already initialized (revert expected)", async () => {
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

    it("initialize() when initializing the impl from non-admin address once it is already initialized (revert expected)", async () => {
      await expect(
        proxiedImpl.connect(nonAdmin).initialize(
          10, // value
          "some text", // text
          [10, 20, 30]
        )
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("initialize() when initializing the impl from admin address once it is already initialized (revert expected)", async () => {
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

    it("initialize() deploy a proxy and call to initialize() with no initialization data", async () => {
      proxy = await (
        await new InitializableImmutableAdminUpgradeabilityProxy__factory(
          await getFirstSigner()
        ).deploy(proxyAdminOwner.address)
      ).deployed();
      expect(await proxy.initialize(implementationV1.address, Buffer.from("")));
    });

    it("initialize() while calling initialize() with wrong initialization data (revert expected)", async () => {
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

    it("admin() non-view function from admin address", async () => {
      expect(await proxy.connect(proxyAdminOwner).admin());
    });

    it("admin() non-view function from non-admin address", async () => {
      await expect(proxy.connect(nonAdmin).admin()).to.be.reverted;
    });

    it("admin() callStatic from admin address", async () => {
      expect(await proxy.connect(proxyAdminOwner).callStatic.admin()).to.be.eq(
        proxyAdminOwner.address,
        "proxy admin address not correct"
      );
    });

    it("implementation() non-view function from admin address", async () => {
      expect(await proxy.connect(proxyAdminOwner).implementation());
    });

    it("implementation() non-view function from non-admin address", async () => {
      await expect(proxy.connect(nonAdmin).implementation()).to.be.reverted;
    });

    it("implementation() callStatic from admin address", async () => {
      expect(
        await proxy.connect(proxyAdminOwner).callStatic.implementation()
      ).to.be.eq(
        implementationV1.address,
        "proxy implementation address not correct"
      );
    });

    it("upgradeTo() to a new imple from non-admin address (revert expected)", async () => {
      await expect(proxy.connect(nonAdmin).upgradeTo(implementationV2.address))
        .to.be.reverted;
    });

    it("upgradeTo() to a non-contract imple from admin address (revert expected)", async () => {
      await expect(
        proxy.connect(proxyAdminOwner).upgradeTo(ONE_ADDRESS)
      ).to.be.revertedWith(
        "Cannot set a proxy implementation to a non-contract address"
      );
    });

    it("upgradeTo() to a new imple from admin address", async () => {
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

    it("upgradeTo() when initializing the new imple from admin address (revert expected)", async () => {
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

    it("upgradeToAndCall() to a new impl from non-admin address (revert expected)", async () => {
      await expect(
        proxy
          .connect(nonAdmin)
          .upgradeToAndCall(implementationV2.address, Buffer.from(""))
      ).to.be.reverted;
    });

    it("upgradeToAndCall() to a non-contract impl from admin address (revert expected)", async () => {
      await expect(
        proxy
          .connect(proxyAdminOwner)
          .upgradeToAndCall(ONE_ADDRESS, Buffer.from(""))
      ).to.be.revertedWith(
        "Cannot set a proxy implementation to a non-contract address"
      );
    });

    it("upgradeToAndCall() to a new impl from admin address", async () => {
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

    it("upgradeToAndCall() for a new proxied contract with no initialize function (revert expected)", async () => {
      const impl = await deployMockInitializableImple();
      const encodedInitialize = Buffer.from("");
      await expect(
        proxy
          .connect(proxyAdminOwner)
          .upgradeToAndCall(impl.address, encodedInitialize)
      ).reverted;
    });

    it("upgradeToAndCall() when initializing the new impl from admin address once it is already initialized (revert expected)", async () => {
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

    it("implementation.setValue() call through the proxy", async () => {
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

    it("implementation.setValue() direct call to the implementation", async () => {
      const newValue = 123;
      expect(await implementationV1.value()).to.be.eq(0, "value not correct");
      expect(await implementationV1.setValue(newValue));
      expect(await implementationV1.value()).to.be.eq(123, "value not correct");
    });
  });

  context("PoolConfigurator upgrade ability", () => {
    const {CALLER_NOT_POOL_ADMIN} = ProtocolErrors;
    let newPTokenAddress: string;
    let newStableTokenAddress: string;
    let newVariableTokenAddress: string;

    before("deploying instances", async () => {
      const {dai, pool} = testEnv;
      const xTokenInstance = await deployMockPToken([
        pool.address,
        dai.address,
        ZERO_ADDRESS,
        ZERO_ADDRESS,
        "ParaSpace Interest bearing DAI updated",
        "pDAI",
        "0x10",
      ]);

      const stableDebtTokenInstance = await deployMockStableDebtToken([
        pool.address,
        dai.address,
        ZERO_ADDRESS,
        "ParaSpace stable debt bearing DAI updated",
        "stableDebtDAI",
        "0x10",
      ]);

      const variableDebtTokenInstance = await deployMockVariableDebtToken([
        pool.address,
        dai.address,
        ZERO_ADDRESS,
        "ParaSpace variable debt bearing DAI updated",
        "variableDebtDAI",
        "0x10",
      ]);

      newPTokenAddress = xTokenInstance.address;
      newVariableTokenAddress = variableDebtTokenInstance.address;
      newStableTokenAddress = stableDebtTokenInstance.address;
    });

    it("Tries to update the DAI Ptoken implementation with a different address than the poolManager", async () => {
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

    it("Upgrades the DAI Ptoken implementation ", async () => {
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
      await configurator.updatePToken(updatePTokenInputParams);

      const tokenName = await pDai.name();

      expect(tokenName).to.be.eq(
        "ParaSpace Interest bearing DAI updated",
        "Invalid token name"
      );
    });

    it("Tries to update the DAI Stable debt token implementation with a different address than the poolManager", async () => {
      const {dai, configurator, users} = testEnv;

      const name = await (
        await getStableDebtToken(newStableTokenAddress)
      ).name();
      const symbol = await (
        await getStableDebtToken(newStableTokenAddress)
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
        implementation: newStableTokenAddress,
        params: "0x10",
      };

      await expect(
        configurator
          .connect(users[1].signer)
          .updateStableDebtToken(updateDebtTokenInput)
      ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
    });

    it("Upgrades the DAI stable debt token implementation ", async () => {
      const {dai, configurator, helpersContract} = testEnv;

      const name = await (
        await getStableDebtToken(newStableTokenAddress)
      ).name();
      const symbol = await (
        await getStableDebtToken(newStableTokenAddress)
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
        implementation: newStableTokenAddress,
        params: "0x10",
      };

      await configurator.updateStableDebtToken(updateDebtTokenInput);

      const {stableDebtTokenAddress} =
        await helpersContract.getReserveTokensAddresses(dai.address);

      const debtToken = await getMockStableDebtToken(stableDebtTokenAddress);

      const tokenName = await debtToken.name();

      expect(tokenName).to.be.eq(
        "ParaSpace stable debt bearing DAI updated",
        "Invalid token name"
      );
    });

    it("Tries to update the DAI variable debt token implementation with a different address than the poolManager", async () => {
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

    it("Upgrades the DAI variable debt token implementation ", async () => {
      const {dai, configurator, helpersContract} = testEnv;

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
        await helpersContract.getReserveTokensAddresses(dai.address);

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
});
