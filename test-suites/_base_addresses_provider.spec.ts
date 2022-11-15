import hre from "hardhat";
import {expect} from "chai";
import {utils} from "ethers";
import {
  createRandomAddress,
  evmRevert,
  evmSnapshot,
} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {getProxyImplementation} from "../deploy/helpers/contracts-helpers";
import {deployPoolComponents} from "../deploy/helpers/contracts-deployments";
import {
  InitializableAdminUpgradeabilityProxy__factory,
  MockPeripheryContractV1__factory,
  MockPeripheryContractV2__factory,
} from "../types";
import {
  getFirstSigner,
  getProxyAdmin,
} from "../deploy/helpers/contracts-getters";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {CommonConfig} from "../deploy/market-config";
describe("PoolAddressesProvider", () => {
  const {OWNABLE_ONLY_OWNER} = ProtocolErrors;

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    // Transfer ownership to user 1
    await testEnv.addressesProvider.transferOwnership(testEnv.users[1].address);
    return testEnv;
  };

  it("TC-address-provider-00 default marketId check", async () => {
    const {addressesProvider} = await loadFixture(fixture);
    const defaultMarketId = CommonConfig.MarketId;
    expect(await addressesProvider.getMarketId()).to.be.eq(defaultMarketId);
  });

  it("TC-addresses-provider-01 setMarketId and getMarketId - happy path", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const oldMarketId = await addressesProvider
      .connect(users[1].signer)
      .getMarketId();
    const newMarketId = `NewMarketId`;
    await addressesProvider.connect(users[1].signer).setMarketId(newMarketId);
    const currentMarketId = await addressesProvider
      .connect(users[1].signer)
      .getMarketId();
    expect(currentMarketId).to.be.eq(newMarketId);
    expect(currentMarketId).to.be.not.eq(oldMarketId);
  });

  // todo: do we need to improve to empty string marketID NOT allowed?
  it("TC-addresses-provider-02 owner can setMarketId with empty string", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    expect(await addressesProvider.getMarketId()).to.not.be.empty;
    await addressesProvider.connect(users[1].signer).setMarketId("");
    expect(await addressesProvider.getMarketId()).to.be.empty;
  });

  it("TC-addresses-provider-03 Test the onlyOwner accessibility of the PoolAddressesProvider", async () => {
    const {addressesProvider} = await loadFixture(fixture);
    const mockAddress = createRandomAddress();

    // Test accessibility with user 0
    for (const contractFunction of [
      addressesProvider.setMarketId,
      addressesProvider.setPoolConfiguratorImpl,
      addressesProvider.setPriceOracle,
      addressesProvider.setACLAdmin,
      addressesProvider.setPriceOracleSentinel,
      addressesProvider.setProtocolDataProvider,
    ]) {
      await expect(contractFunction(mockAddress)).to.be.revertedWith(
        OWNABLE_ONLY_OWNER
      );
    }

    await expect(
      addressesProvider.updatePoolImpl([], ZERO_ADDRESS, "0x")
    ).to.be.revertedWith(OWNABLE_ONLY_OWNER);

    await expect(
      addressesProvider.setAddress(
        utils.keccak256(utils.toUtf8Bytes("RANDOM_ID")),
        mockAddress
      )
    ).to.be.revertedWith(OWNABLE_ONLY_OWNER);

    await expect(
      addressesProvider.setAddressAsProxy(
        utils.keccak256(utils.toUtf8Bytes("RANDOM_ID")),
        mockAddress
      )
    ).to.be.revertedWith(OWNABLE_ONLY_OWNER);
  });

  it("TC-addresses-provider-04 Owner adds a new address as proxy", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);

    const currentAddressesProviderOwner = users[1];

    const mockPool = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();

    const proxiedAddressId = utils.formatBytes32String("RANDOM_PROXIED");

    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddressAsProxy(proxiedAddressId, mockPool.address)
    )
      .to.emit(addressesProvider, "AddressSetAsProxy")
      .to.emit(addressesProvider, "ProxyCreated");

    const proxyAddress = await addressesProvider.getAddress(proxiedAddressId);
    const implAddress = await getProxyImplementation(
      addressesProvider.address,
      proxyAddress
    );
    expect(implAddress).to.be.eq(mockPool.address);
  });

  it("TC-addresses-provider-05 Owner adds proxy with ID='POOL' - reverted", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);

    const currentAddressesProviderOwner = users[1];

    const mockPool = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();

    const proxiedAddressId = utils.formatBytes32String("POOL");

    await expect(
      addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddressAsProxy(proxiedAddressId, mockPool.address)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ADDRESSES_PROVIDER_ID);
  });

  it("TC-addresses-provider-06 Owner adds a new address with no proxy", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);

    const currentAddressesProviderOwner = users[1];
    const mockNonProxiedAddress = createRandomAddress();
    const nonProxiedAddressId = utils.formatBytes32String("RANDOM_NON_PROXIED");

    const oldAddress = await addressesProvider.getAddress(nonProxiedAddressId);
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(nonProxiedAddressId, mockNonProxiedAddress)
    )
      .to.emit(addressesProvider, "AddressSet")
      .withArgs(nonProxiedAddressId, oldAddress, mockNonProxiedAddress);

    expect(
      (await addressesProvider.getAddress(nonProxiedAddressId)).toLowerCase()
    ).to.be.eq(mockNonProxiedAddress.toLowerCase());

    //fails with hardhat exception
    // const proxyAddress = await addressesProvider.getAddress(
    //   nonProxiedAddressId
    // );
    // await expect(
    //   getProxyImplementation(addressesProvider.address, proxyAddress)
    // ).to.be.reverted;
  });

  it("TC-addresses-provider-07 Owner adds a new address with no proxy and turns it into a proxy", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);

    const currentAddressesProviderOwner = users[1];
    const mockPool = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();

    const mockConvertibleAddress = mockPool.address;
    const convertibleAddressId = utils.formatBytes32String(
      "CONVERTIBLE_ADDRESS"
    );

    expect(await addressesProvider.getAddress(convertibleAddressId)).to.be.eq(
      ZERO_ADDRESS
    );

    const oldNonProxiedAddress = await addressesProvider.getAddress(
      convertibleAddressId
    );

    // Add address as non proxy
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(convertibleAddressId, mockConvertibleAddress)
    )
      .to.emit(addressesProvider, "AddressSet")
      .withArgs(
        convertibleAddressId,
        oldNonProxiedAddress,
        mockConvertibleAddress
      );

    const registeredAddress = await addressesProvider.getAddress(
      convertibleAddressId
    );
    expect(registeredAddress).to.be.eq(mockConvertibleAddress);
    await expect(
      getProxyImplementation(addressesProvider.address, registeredAddress)
    ).to.be.reverted;

    // Unregister address as non proxy
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(convertibleAddressId, ZERO_ADDRESS)
    )
      .to.emit(addressesProvider, "AddressSet")
      .withArgs(convertibleAddressId, mockConvertibleAddress, ZERO_ADDRESS);

    // Add address as proxy
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddressAsProxy(convertibleAddressId, mockConvertibleAddress)
    )
      .to.emit(addressesProvider, "AddressSetAsProxy")
      .to.emit(addressesProvider, "ProxyCreated");

    const proxyAddress = await addressesProvider.getAddress(
      convertibleAddressId
    );
    const implAddress = await getProxyImplementation(
      addressesProvider.address,
      proxyAddress
    );
    expect(implAddress).to.be.eq(mockConvertibleAddress);
  });

  it("TC-addresses-provider-08 Unregister a proxy address", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const mockPool = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();

    const mockConvertibleAddress = mockPool.address;
    const currentAddressesProviderOwner = users[1];

    const convertibleAddressId = utils.formatBytes32String(
      "CONVERTIBLE_ADDRESS"
    );
    await addressesProvider
      .connect(currentAddressesProviderOwner.signer)
      .setAddressAsProxy(convertibleAddressId, mockConvertibleAddress);

    const proxyAddress = await addressesProvider.getAddress(
      convertibleAddressId
    );

    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(convertibleAddressId, ZERO_ADDRESS)
    )
      .to.emit(addressesProvider, "AddressSet")
      .withArgs(convertibleAddressId, proxyAddress, ZERO_ADDRESS);

    const proxyAddressAfter = await addressesProvider.getAddress(
      convertibleAddressId
    );
    expect(proxyAddressAfter).to.be.eq(ZERO_ADDRESS);
    expect(proxyAddressAfter).to.be.not.eq(proxyAddress);
    // fails with hardhat exception
    // await expect(
    //   getProxyImplementation(addressesProvider.address, proxyAddressAfter)
    // ).to.be.reverted;
  });

  it("TC-addresses-provider-09 Owner adds a new address with proxy and turns it into a no proxy", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);

    const currentAddressesProviderOwner = users[1];
    const mockPool = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();
    const mockConvertibleAddress = mockPool.address;
    const convertibleAddressId = utils.formatBytes32String(
      "CONVERTIBLE_ADDRESS2"
    );

    expect(await addressesProvider.getAddress(convertibleAddressId)).to.be.eq(
      ZERO_ADDRESS
    );

    // Add address as proxy
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddressAsProxy(convertibleAddressId, mockConvertibleAddress)
    )
      .to.emit(addressesProvider, "AddressSetAsProxy")
      .to.emit(addressesProvider, "ProxyCreated");

    const proxyAddress = await addressesProvider.getAddress(
      convertibleAddressId
    );
    const implAddress = await getProxyImplementation(
      addressesProvider.address,
      proxyAddress
    );
    expect(implAddress).to.be.eq(mockConvertibleAddress);

    // Unregister address as proxy
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(convertibleAddressId, ZERO_ADDRESS)
    )
      .to.emit(addressesProvider, "AddressSet")
      .withArgs(convertibleAddressId, proxyAddress, ZERO_ADDRESS);

    // Add address as non proxy
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(convertibleAddressId, mockConvertibleAddress)
    )
      .to.emit(addressesProvider, "AddressSet")
      .withArgs(convertibleAddressId, ZERO_ADDRESS, mockConvertibleAddress);

    const registeredAddressAfter = await addressesProvider.getAddress(
      convertibleAddressId
    );
    expect(registeredAddressAfter).to.be.not.eq(proxyAddress);
    expect(registeredAddressAfter).to.be.eq(mockConvertibleAddress);
    await expect(
      getProxyImplementation(addressesProvider.address, registeredAddressAfter)
    ).to.be.reverted;
  });

  it("TC-addresses-provider-10 Unregister a no proxy address", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);

    const currentAddressesProviderOwner = users[1];
    const mockPool = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();
    const mockConvertibleAddress = mockPool.address;

    const convertibleAddressId = utils.formatBytes32String(
      "CONVERTIBLE_ADDRESS2"
    );
    await addressesProvider
      .connect(currentAddressesProviderOwner.signer)
      .setAddress(convertibleAddressId, mockConvertibleAddress);

    const registeredAddress = await addressesProvider.getAddress(
      convertibleAddressId
    );
    await expect(
      getProxyImplementation(addressesProvider.address, registeredAddress)
    ).to.be.reverted;

    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(convertibleAddressId, ZERO_ADDRESS)
    )
      .to.emit(addressesProvider, "AddressSet")
      .withArgs(convertibleAddressId, registeredAddress, ZERO_ADDRESS);

    const registeredAddressAfter = await addressesProvider.getAddress(
      convertibleAddressId
    );
    expect(registeredAddressAfter).to.be.eq(ZERO_ADDRESS);
    expect(registeredAddressAfter).to.be.not.eq(registeredAddress);
    await expect(
      getProxyImplementation(addressesProvider.address, registeredAddress)
    ).to.be.reverted;
  });

  it("TC-addresses-provider-11 getPool should return pull address", async () => {
    const {addressesProvider} = await loadFixture(fixture);
    const poolAddressGetByGetPool = await addressesProvider.getPool();
    const POOL_ID = utils.formatBytes32String("POOL");
    const poolAddressGetByGetAddress = await addressesProvider.getAddress(
      POOL_ID
    );
    expect(poolAddressGetByGetAddress).to.be.eq(poolAddressGetByGetPool);
  });

  it("TC-addresses-provider-12 Owner registers an existing contract (with proxy) and upgrade it", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const proxyAdminOwner = users[0];

    const currentAddressesProviderOwner = users[1];
    const initialManager = users[1];
    const initialProxyAdmin = users[2];

    const newRegisteredContractId = hre.ethers.utils.keccak256(
      hre.ethers.utils.toUtf8Bytes("NEW_REGISTERED_CONTRACT")
    );

    // Deploy the periphery contract that will be registered in the PoolAddressesProvider
    const proxy = await (
      await new InitializableAdminUpgradeabilityProxy__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();

    // Implementation
    const impleV1 = await (
      await new MockPeripheryContractV1__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();
    await impleV1.initialize(initialManager.address, 123);

    // Initialize proxy
    const incentivesInit = impleV1.interface.encodeFunctionData("initialize", [
      initialManager.address,
      123,
    ]);
    await (
      await proxy["initialize(address,address,bytes)"](
        impleV1.address, // logic
        initialProxyAdmin.address, // admin
        incentivesInit // data
      )
    ).wait();
    expect(await getProxyAdmin(proxy.address)).to.be.eq(
      initialProxyAdmin.address
    );

    const contractToRegister = MockPeripheryContractV1__factory.connect(
      proxy.address,
      proxyAdminOwner.signer
    );
    expect(await contractToRegister.getManager()).to.be.eq(
      initialManager.address
    );

    // Register the periphery contract into the PoolAddressesProvider
    expect(
      await proxy
        .connect(initialProxyAdmin.signer)
        .changeAdmin(addressesProvider.address)
    );
    expect(await getProxyAdmin(proxy.address)).to.be.eq(
      addressesProvider.address
    );
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddress(newRegisteredContractId, proxy.address)
    );
    expect(
      await addressesProvider.getAddress(newRegisteredContractId)
    ).to.be.eq(proxy.address);

    // Upgrade periphery contract to V2 from PoolAddressesProvider
    // Note the new implementation contract should has a proper `initialize` function signature

    // New implementation
    const impleV2 = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();
    await impleV2.initialize(addressesProvider.address);

    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setAddressAsProxy(newRegisteredContractId, impleV2.address)
    );

    const upgradedContract = MockPeripheryContractV2__factory.connect(
      proxy.address,
      proxyAdminOwner.signer
    );
    expect(await upgradedContract.getManager()).to.be.eq(
      initialManager.address
    );
    expect(await upgradedContract.getAddressesProvider()).to.be.eq(
      addressesProvider.address
    );
  });

  it("TC-addresses-provider-13 Owner updates the implementation of a proxy which is already initialized (revert expected)", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];

    const {poolCore, poolCoreSelectors} = await deployPoolComponents(
      addressesProvider.address
    );

    // Pool has already a proxy
    const poolAddress = await addressesProvider.getPool();
    expect(poolAddress).to.be.not.eq(ZERO_ADDRESS);

    const poolAddressId = utils.formatBytes32String("POOL");
    const proxyAddress = await addressesProvider.getAddress(poolAddressId);

    // Update the Pool proxy
    await expect(
      addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .updatePoolImpl(
          [
            {
              implAddress: poolCore.address,
              action: 0,
              functionSelectors: poolCoreSelectors,
            },
          ],
          proxyAddress,
          poolCore.interface.encodeFunctionData("initialize", [
            addressesProvider.address,
          ])
        )
    ).to.be.revertedWith("ParaProxy: Can't add function that already exists");

    // Pool address should not change
    expect(await addressesProvider.getPool()).to.be.eq(poolAddress);
  });

  it("TC-addresses-provider-14 Owner updatePoolImpl would not change the pool address", async () => {
    const snapId = await evmSnapshot();

    const {addressesProvider, users} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];

    const {poolCore, poolCoreSelectors} = await deployPoolComponents(
      addressesProvider.address
    );

    // Pool has already a proxy
    const poolAddress = await addressesProvider.getPool();
    expect(poolAddress).to.be.not.eq(ZERO_ADDRESS);

    // Update the Pool proxy

    await addressesProvider
      .connect(currentAddressesProviderOwner.signer)
      .updatePoolImpl(
        [
          {
            implAddress: poolCore.address,
            action: 1,
            functionSelectors: poolCoreSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x"
      );

    // Pool address should not change
    expect(await addressesProvider.getPool()).to.be.eq(poolAddress);

    await evmRevert(snapId);
  });

  it("TC-addresses-provider-15 getPoolConfigurator should return PoolConfigurator address correctly", async () => {
    const {addressesProvider, configurator} = await loadFixture(fixture);

    const poolConfiguratorAddressId =
      utils.formatBytes32String("POOL_CONFIGURATOR");

    const poolConfiguratorAddressByGetPoolConfigurator =
      await addressesProvider.getPoolConfigurator();
    const poolConfiguratorAddressByGetAddress =
      await addressesProvider.getAddress(poolConfiguratorAddressId);
    expect(poolConfiguratorAddressByGetPoolConfigurator).to.be.eq(
      configurator.address
    );
    expect(poolConfiguratorAddressByGetAddress).to.be.eq(
      poolConfiguratorAddressByGetPoolConfigurator
    );
  });

  it("TC-addresses-provider-16 Owner setPoolConfiguratorImpl and getProxyImplementation - happy path", async () => {
    const {addressesProvider, configurator, users} = await loadFixture(fixture);

    const currentAddressesProviderOwner = users[1];

    const newPoolConfiguratorImpl = (
      await (
        await new MockPeripheryContractV2__factory(
          await getFirstSigner()
        ).deploy()
      ).deployed()
    ).address;

    // `POOL_CONFIGURATOR` is the default constant ID specified in PoolAddressesProvider.sol
    const poolConfiguratorAddressId =
      utils.formatBytes32String("POOL_CONFIGURATOR");
    const proxyAddress = await addressesProvider.getAddress(
      poolConfiguratorAddressId
    );
    const implementationAddress = await getProxyImplementation(
      addressesProvider.address,
      proxyAddress
    );

    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setPoolConfiguratorImpl(newPoolConfiguratorImpl)
    )
      .to.emit(addressesProvider, "PoolConfiguratorUpdated")
      .withArgs(implementationAddress, newPoolConfiguratorImpl);

    // check configuratorAddress would NOT change after setPoolConfiguratorImpl
    expect(await addressesProvider.getPoolConfigurator()).to.be.eq(
      configurator.address
    );
    // check new proxyImplementation address
    const implementationAddressAfter = await getProxyImplementation(
      addressesProvider.address,
      proxyAddress
    );
    expect(implementationAddressAfter).to.be.not.eq(implementationAddress);
    expect(implementationAddressAfter).to.be.eq(newPoolConfiguratorImpl);
  });

  it("TC-addresses-provider-17 getPriceOracle should return oracle address", async () => {
    const {addressesProvider} = await loadFixture(fixture);
    const priceOracleAddressId = utils.formatBytes32String("PRICE_ORACLE");
    const oracleAddressByGetPriceOracle =
      await addressesProvider.getPriceOracle();
    const oracleAddressByGetAddress = await addressesProvider.getAddress(
      priceOracleAddressId
    );
    expect(oracleAddressByGetAddress).to.be.eq(oracleAddressByGetPriceOracle);
  });

  it("TC-addresses-provider-18 Owner setPriceOracle and getPriceOracle - happy path", async () => {
    const {addressesProvider, oracle, users} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];

    const newPriceOracleAddress = createRandomAddress();
    // `PRICE_ORACLE` is the default constant ID specified in PoolAddressesProvider.sol
    const priceOracleAddressId = utils.formatBytes32String("PRICE_ORACLE");
    const registeredAddress = await addressesProvider.getAddress(
      priceOracleAddressId
    );
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setPriceOracle(newPriceOracleAddress)
    )
      .to.emit(addressesProvider, "PriceOracleUpdated")
      .withArgs(registeredAddress, newPriceOracleAddress);

    expect(await addressesProvider.getPriceOracle()).to.be.not.eq(
      oracle.address
    );
    expect(await addressesProvider.getPriceOracle()).to.be.eq(
      newPriceOracleAddress
    );
  });

  it("TC-addresses-provider-19 getACLManager should return ACLManager's address", async () => {
    const {addressesProvider, aclManager} = await loadFixture(fixture);
    const aclManagerAddressId = utils.formatBytes32String("ACL_MANAGER");
    const aclManagerAddressByGetACLManager =
      await addressesProvider.getACLManager();
    const aclManagerAddressByGetAddress = await addressesProvider.getAddress(
      aclManagerAddressId
    );
    expect(aclManagerAddressByGetACLManager).to.be.eq(aclManager.address);
    expect(aclManagerAddressByGetACLManager).to.be.eq(
      aclManagerAddressByGetAddress
    );
  });

  it("TC-addresses-provider-20 Owner setACLManager and getACLManager - happy path", async () => {
    const {addressesProvider, users, aclManager} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];

    const newACLManagerAddress = createRandomAddress();

    const aclManagerAddressId = utils.formatBytes32String("ACL_MANAGER");
    const registeredAddress = await addressesProvider.getAddress(
      aclManagerAddressId
    );
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setACLManager(newACLManagerAddress)
    )
      .to.emit(addressesProvider, "ACLManagerUpdated")
      .withArgs(registeredAddress, newACLManagerAddress);

    expect(await addressesProvider.getACLManager()).to.be.not.eq(
      aclManager.address
    );
    expect(await addressesProvider.getACLManager()).to.be.eq(
      newACLManagerAddress
    );
  });

  it("TC-addresses-provider-21 getACLAdmin should return ACLAdmin's address(deployer)", async () => {
    const {addressesProvider, deployer} = await loadFixture(fixture);
    const ACLAdminAddressId = utils.formatBytes32String("ACL_ADMIN");
    const ACLAdminAddressByGetACLAdmin = await addressesProvider.getACLAdmin();
    const ACLAdminAddressByGetAddress = await addressesProvider.getAddress(
      ACLAdminAddressId
    );
    expect(ACLAdminAddressByGetACLAdmin).to.be.eq(deployer.address);
    expect(ACLAdminAddressByGetACLAdmin).to.be.eq(ACLAdminAddressByGetAddress);
  });

  it("TC-addresses-provider-22 Owner setACLAdmin and getACLAdmin - happy path", async () => {
    const {addressesProvider, users, deployer} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];

    const newACLAdminAddress = createRandomAddress();

    const aclAdminAddressId = utils.formatBytes32String("ACL_ADMIN");
    const registeredAddress = await addressesProvider.getAddress(
      aclAdminAddressId
    );
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setACLAdmin(newACLAdminAddress)
    )
      .to.emit(addressesProvider, "ACLAdminUpdated")
      .withArgs(registeredAddress, newACLAdminAddress);

    expect(await addressesProvider.getACLAdmin()).to.be.not.eq(
      deployer.address
    );
    expect(await addressesProvider.getACLAdmin()).to.be.eq(newACLAdminAddress);
  });

  it("TC-addresses-provider-23 getPriceOracleSentinel should return OracleSentinel's address", async () => {
    const {addressesProvider} = await loadFixture(fixture);

    const priceOracleSentinelAddressId = utils.formatBytes32String(
      "PRICE_ORACLE_SENTINEL"
    );
    const priceOracleAddressBygetPriceOracleSentinel =
      await addressesProvider.getPriceOracleSentinel();
    const priceOracleAddressByGetAddress = await addressesProvider.getAddress(
      priceOracleSentinelAddressId
    );
    expect(priceOracleAddressBygetPriceOracleSentinel).to.be.eq(
      priceOracleAddressByGetAddress
    );
  });

  it("TC-addresses-provider-24 Owner setPriceOracleSentinel and getPriceOracleSentinel - happy path", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];

    const newPriceOracleSentinelAddress = createRandomAddress();

    const priceOracleSentinelAddressId = utils.formatBytes32String(
      "PRICE_ORACLE_SENTINEL"
    );
    const registeredAddress = await addressesProvider.getAddress(
      priceOracleSentinelAddressId
    );
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setPriceOracleSentinel(newPriceOracleSentinelAddress)
    )
      .to.emit(addressesProvider, "PriceOracleSentinelUpdated")
      .withArgs(registeredAddress, newPriceOracleSentinelAddress);

    expect(await addressesProvider.getPriceOracleSentinel()).to.be.not.eq(
      registeredAddress
    );
    expect(await addressesProvider.getPriceOracleSentinel()).to.be.eq(
      newPriceOracleSentinelAddress
    );
  });

  it("TC-addresses-provider-25 getPoolDataProvider should return protocolDataProvider's address correctly", async () => {
    const {addressesProvider, protocolDataProvider} = await loadFixture(
      fixture
    );
    const dataProviderAddressId = utils.formatBytes32String("DATA_PROVIDER");
    const poolDataProviderAddressByGetPoolDataProvider =
      await addressesProvider.getPoolDataProvider();
    const poolDataProviderByGetAddress = await addressesProvider.getAddress(
      dataProviderAddressId
    );
    expect(poolDataProviderAddressByGetPoolDataProvider).to.be.eq(
      protocolDataProvider.address
    );
    expect(poolDataProviderAddressByGetPoolDataProvider).to.be.eq(
      poolDataProviderByGetAddress
    );
  });

  it("TC-addresses-provider-26 Owner setProtocolDataProvider and getPoolDataProvider - happy path", async () => {
    const {addressesProvider, protocolDataProvider, users} = await loadFixture(
      fixture
    );
    const currentAddressesProviderOwner = users[1];

    const newDataProviderAddress = createRandomAddress();

    const dataProviderAddressId = utils.formatBytes32String("DATA_PROVIDER");
    const registeredAddress = await addressesProvider.getAddress(
      dataProviderAddressId
    );
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setProtocolDataProvider(newDataProviderAddress)
    )
      .to.emit(addressesProvider, "ProtocolDataProviderUpdated")
      .withArgs(registeredAddress, newDataProviderAddress);

    expect(await addressesProvider.getPoolDataProvider()).to.be.not.eq(
      protocolDataProvider.address
    );
    expect(await addressesProvider.getPoolDataProvider()).to.be.eq(
      newDataProviderAddress
    );
  });

  it("TC-addresses-provider-27 Owner updates the implementation of a proxy by deleting existing selectors then adding them", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];

    const {poolCore, poolCoreSelectors} = await deployPoolComponents(
      addressesProvider.address
    );

    // Pool has already a proxy
    const poolAddress = await addressesProvider.getPool();
    expect(poolAddress).to.be.not.eq(ZERO_ADDRESS);

    // Update the Pool proxy

    await addressesProvider
      .connect(currentAddressesProviderOwner.signer)
      .updatePoolImpl(
        [
          {
            implAddress: ZERO_ADDRESS,
            action: 2,
            functionSelectors: poolCoreSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x"
      );

    await addressesProvider
      .connect(currentAddressesProviderOwner.signer)
      .updatePoolImpl(
        [
          {
            implAddress: poolCore.address,
            action: 0,
            functionSelectors: poolCoreSelectors,
          },
        ],
        ZERO_ADDRESS,
        "0x"
      );

    // Pool address should not change
    expect(await addressesProvider.getPool()).to.be.eq(poolAddress);
  });

  it("TC-addresses-provider-28 getWETH should return weth address correctly", async () => {
    const {addressesProvider, weth} = await loadFixture(fixture);
    const WETH_ID = utils.formatBytes32String(`WETH`);
    const defaultWETHAddressGetByGetWETH = await addressesProvider.getWETH();
    expect(defaultWETHAddressGetByGetWETH).to.be.eq(weth.address);
    const defaultWETHAddressGetByGetAddress =
      await addressesProvider.getAddress(WETH_ID);
    expect(defaultWETHAddressGetByGetAddress).to.be.eq(
      defaultWETHAddressGetByGetWETH
    );
  });

  it("TC-addresses-provider-29 setWETH and getWETH - happy path", async () => {
    const {addressesProvider, users, weth} = await loadFixture(fixture);
    const currentAddressesProviderOwner = users[1];
    const randomAddress = createRandomAddress();
    expect(
      await addressesProvider
        .connect(currentAddressesProviderOwner.signer)
        .setWETH(randomAddress)
    )
      .to.emit(addressesProvider, "WETHUpdated")
      .withArgs(weth.address, randomAddress);
    const newWETHAddress = await addressesProvider.getWETH();
    expect(newWETHAddress).to.be.not.eq(weth.address);
    expect(newWETHAddress).to.be.eq(randomAddress);
  });

  it("TC-addresses-provider-30 setMarketplace and getMarketplace - happy path", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const mockContract = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();

    const mockMarketId = utils.formatBytes32String(`MockMarketID`);

    expect(
      await addressesProvider
        .connect(users[1].signer)
        .setMarketplace(
          mockMarketId,
          mockContract.address,
          mockContract.address,
          mockContract.address,
          false
        )
    )
      .to.emit(addressesProvider, `MarketplaceUpdated`)
      .withArgs(
        mockMarketId,
        mockContract.address,
        mockContract.address,
        mockContract.address,
        false
      );

    const currentMarketPlace = await addressesProvider.getMarketplace(
      mockMarketId
    );
    expect(currentMarketPlace.marketplace).to.be.eq(mockContract.address);
    expect(currentMarketPlace.adapter).to.be.eq(mockContract.address);
    expect(currentMarketPlace.operator).to.be.eq(mockContract.address);
    expect(currentMarketPlace.paused).to.be.eq(false);
  });
  // todo: there's new verification need to be done in method setMarketplace: maybe id=0, or non-cotract address market is not allowed.
  it("TC-addresses-provider-31 can setMarketplace with marketID=`0`, but getMarketplace with marketID=`0` should fail", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const mockContract = await (
      await new MockPeripheryContractV2__factory(
        await getFirstSigner()
      ).deploy()
    ).deployed();

    const zeroMarketId = utils.formatBytes32String(`0`);
    addressesProvider
      .connect(users[1].signer)
      .setMarketplace(
        zeroMarketId,
        mockContract.address,
        mockContract.address,
        mockContract.address,
        false
      );
    await expect(
      addressesProvider.getMarketplace(zeroMarketId)
    ).to.be.revertedWith(ProtocolErrors.INVALID_MARKETPLACE_ID);
  });

  // todo: there's new verification need to be done in method setMarketplace: maybe id=0, or non-cotract address market is not allowed.
  it("TC-addresses-provider-31 can setMarketplace with non-contract address, but getMarketplace when marketplace is non-contract should fail", async () => {
    const {addressesProvider, users} = await loadFixture(fixture);
    const commonAddress = createRandomAddress();

    const MockContractID = utils.formatBytes32String(`MockContractID`);
    addressesProvider
      .connect(users[1].signer)
      .setMarketplace(
        MockContractID,
        commonAddress,
        commonAddress,
        commonAddress,
        false
      );
    await expect(
      addressesProvider.getMarketplace(MockContractID)
    ).to.be.revertedWith(ProtocolErrors.INVALID_MARKETPLACE_ID);
  });
});
