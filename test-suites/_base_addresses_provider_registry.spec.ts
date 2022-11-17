import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {ONE_ADDRESS, ZERO_ADDRESS} from "../deploy/helpers/constants";
import {ProtocolErrors} from "../deploy/helpers/types";
import {testEnvFixture} from "./helpers/setup-env";

const fixture = async () => {
  return await loadFixture(testEnvFixture);
};
const NEW_ADDRESSES_PROVIDER_ID_2 = 2;
const NEW_ADDRESSES_PROVIDER_ID_3 = 3;
const NEW_ADDRESSES_PROVIDER_ID_4 = 4;
const NEW_ADDRESSES_PROVIDER_ADDRESS = ONE_ADDRESS;

const {
  INVALID_ADDRESSES_PROVIDER_ID,
  INVALID_ADDRESSES_PROVIDER,
  ADDRESSES_PROVIDER_NOT_REGISTERED,
  ADDRESSES_PROVIDER_ALREADY_ADDED,
} = ProtocolErrors;

describe("AddressesProviderRegistry", () => {
  it("TC-addresses-provider-registry-00 Default id of all common users is 0", async () => {
    const {registry, users} = await loadFixture(fixture);
    for (const user of users) {
      const defaultId = await registry.getAddressesProviderIdByAddress(
        user.address
      );
      expect(defaultId).to.be.eq(0);
    }
  });

  it("TC-addresses-provider-registry-01 Default address of non-exist id", async () => {
    const {registry, users} = await loadFixture(fixture);

    const providers = await registry.getAddressesProvidersList();
    expect(providers.length).to.be.equal(
      1,
      "Invalid length of the addresses providers list"
    );
    expect(providers[0]).to.be.not.eq(users[0].address);
    const providerId = await registry.getAddressesProviderIdByAddress(
      providers[0]
    );
    const defaultAddressByNonExistId =
      await registry.getAddressesProviderAddressById(providerId.add(10086));
    expect(defaultAddressByNonExistId).to.be.eq(ZERO_ADDRESS);
  });

  it("TC-addresses-provider-registry-02 Checks the addresses provider is added to the registry", async () => {
    const {addressesProvider, registry} = await loadFixture(fixture);

    const providers = await registry.getAddressesProvidersList();

    expect(providers.length).to.be.equal(
      1,
      "Invalid length of the addresses providers list"
    );
    expect(providers[0].toString()).to.be.equal(
      addressesProvider.address,
      "Invalid addresses provider added to the list"
    );
  });

  it("TC-addresses-provider-registry-03 Tries to register an addresses provider with id 0 (revert expected)", async () => {
    const {registry, poolAdmin} = await loadFixture(fixture);

    await expect(
      registry
        .connect(poolAdmin.signer)
        .registerAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS, "0")
    ).to.be.revertedWith(INVALID_ADDRESSES_PROVIDER_ID);
  });

  it("TC-addresses-provider-registry-04 common user Tries to register an addresses provider - revert expected", async () => {
    const {registry, users} = await loadFixture(fixture);
    await expect(
      registry
        .connect(users[0].signer)
        .registerAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS, "1")
    ).to.be.revertedWith(ProtocolErrors.OWNABLE_ONLY_OWNER);
  });

  it("TC-addresses-provider-registry-05 Tries to add an addressesProvider with an already used id (revert expected)", async () => {
    const {users, registry, addressesProvider} = await loadFixture(fixture);
    const id = await registry.getAddressesProviderIdByAddress(
      addressesProvider.address
    );
    // by default, non-registered provider(user)'s id is 0, so, addressesProvider's id is NOT 0 which is already registered.
    expect(id).not.to.be.eq(0);
    // Simulating an addresses provider using the users[5] wallet address
    await expect(
      registry.registerAddressesProvider(users[5].address, id)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ADDRESSES_PROVIDER_ID);

    const providers = await registry.getAddressesProvidersList();
    // todo: simplify this checking
    const idMap = {};

    for (let i = 0; i < providers.length; i++) {
      const id = (
        await registry.getAddressesProviderIdByAddress(providers[i])
      ).toNumber();
      if (id > 0) {
        if (idMap[id] == undefined) {
          idMap[id] = true;
        } else {
          expect(false, "Duplicate ids").to.be.true;
        }
      }
    }
  });

  it("TC-addresses-provider-registry-06 Tries to register addresses 0 (revert expected)", async () => {
    const {registry, poolAdmin} = await loadFixture(fixture);

    await expect(
      registry
        .connect(poolAdmin.signer)
        .registerAddressesProvider(ZERO_ADDRESS, NEW_ADDRESSES_PROVIDER_ID_4)
    ).to.be.revertedWith(INVALID_ADDRESSES_PROVIDER);
  });

  it("TC-addresses-provider-registry-07 Registers a mock addresses provider - happy path", async () => {
    const {registry, poolAdmin} = await loadFixture(fixture);

    const providersBefore = await registry.getAddressesProvidersList();

    expect(
      await registry
        .connect(poolAdmin.signer)
        .registerAddressesProvider(
          NEW_ADDRESSES_PROVIDER_ADDRESS,
          NEW_ADDRESSES_PROVIDER_ID_2
        )
    )
      .to.emit(registry, "AddressesProviderRegistered")
      .withArgs(NEW_ADDRESSES_PROVIDER_ADDRESS, NEW_ADDRESSES_PROVIDER_ID_2);

    expect(
      await registry.getAddressesProviderIdByAddress(
        NEW_ADDRESSES_PROVIDER_ADDRESS
      )
    ).to.be.eq(NEW_ADDRESSES_PROVIDER_ID_2);

    const providersAfter = await registry.getAddressesProvidersList();
    expect(providersAfter.length).to.be.equal(
      providersBefore.length + 1,
      "Invalid length of the addresses providers list"
    );
    expect(providersAfter[1].toString()).to.be.equal(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      "Invalid addresses provider added to the list"
    );
    expect(
      await registry.getAddressesProviderAddressById(
        NEW_ADDRESSES_PROVIDER_ID_2
      )
    ).to.be.equal(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      "Invalid update of id mapping"
    );
  });

  it("TC-addresses-provider-registry-08 Registers users[2] as another addresses provider", async () => {
    const {users, registry, poolAdmin} = await loadFixture(fixture);

    await registry
      .connect(poolAdmin.signer)
      .registerAddressesProvider(
        NEW_ADDRESSES_PROVIDER_ADDRESS,
        NEW_ADDRESSES_PROVIDER_ID_2
      );

    // Simulating an addresses provider using the users[2] wallet address
    expect(
      await registry.registerAddressesProvider(
        users[2].address,
        NEW_ADDRESSES_PROVIDER_ID_3
      )
    )
      .to.emit(registry, "AddressesProviderRegistered")
      .withArgs(users[2].address, NEW_ADDRESSES_PROVIDER_ID_3);

    const providers = await registry.getAddressesProvidersList();

    expect(providers.length).to.be.equal(
      NEW_ADDRESSES_PROVIDER_ID_3,
      "Invalid length of the addresses providers list"
    );
    expect(providers[2].toString()).to.be.equal(
      users[2].address,
      "Invalid addresses provider added to the list"
    );
  });

  it("TC-addresses-provider-registry-09 Tries to add an already registered addressesProvider with a different id (revert expected)", async () => {
    const {registry, addressesProvider} = await loadFixture(fixture);

    const id = await registry.getAddressesProviderIdByAddress(
      addressesProvider.address
    );
    expect(id).not.to.be.eq(0);

    const providersBefore = await registry.getAddressesProvidersList();
    await expect(
      registry.registerAddressesProvider(
        addressesProvider.address,
        NEW_ADDRESSES_PROVIDER_ID_2
      )
    ).to.be.revertedWith(ADDRESSES_PROVIDER_ALREADY_ADDED);

    const providersAfter = await registry.getAddressesProvidersList();

    expect(
      await registry.getAddressesProviderIdByAddress(addressesProvider.address)
    ).to.be.eq(id);

    expect(providersAfter.length).to.be.equal(
      providersBefore.length,
      "Invalid length of the addresses providers list"
    );
    expect(providersAfter[0].toString()).to.be.equal(
      addressesProvider.address,
      "Invalid addresses provider added to the list"
    );
  });

  it("TC-addresses-provider-registry-10 Re-registers the mock addresses provider after it being removed", async () => {
    const {registry} = await loadFixture(fixture);

    const providersBefore = await registry.getAddressesProvidersList();

    // register and unregister an addresses provider
    await registry.registerAddressesProvider(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      NEW_ADDRESSES_PROVIDER_ID_2
    );
    await registry.unregisterAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS);

    // register it again
    await registry.registerAddressesProvider(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      NEW_ADDRESSES_PROVIDER_ID_2
    );

    expect(
      await registry.getAddressesProviderIdByAddress(
        NEW_ADDRESSES_PROVIDER_ADDRESS
      )
    ).to.be.eq(NEW_ADDRESSES_PROVIDER_ID_2);

    const providersAfter = await registry.getAddressesProvidersList();
    expect(providersAfter.length).to.be.equal(
      providersBefore.length + 1,
      "Invalid length of the addresses providers list"
    );
    expect(providersAfter[providersAfter.length - 1].toString()).to.be.equal(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      "Invalid addresses provider added to the list"
    );
    expect(
      await registry.getAddressesProviderAddressById(
        NEW_ADDRESSES_PROVIDER_ID_2
      )
    ).to.be.equal(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      "Invalid update of id mapping"
    );
  });

  it("TC-addresses-provider-registry-11 common user tries to removes the mock addresses provider", async () => {
    const {registry, users} = await loadFixture(fixture);

    await registry.registerAddressesProvider(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      NEW_ADDRESSES_PROVIDER_ID_2
    );
    const providersBefore = await registry.getAddressesProvidersList();

    await expect(
      registry
        .connect(users[0].signer)
        .unregisterAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS)
    ).to.be.revertedWith(ProtocolErrors.OWNABLE_ONLY_OWNER);

    const providersAfter = await registry.getAddressesProvidersList();

    expect(providersAfter.length).to.be.equal(
      providersBefore.length,
      "!--- some addresses providers have been deleted ---!"
    );
  });

  it("TC-addresses-provider-registry-12 Removes the mock addresses provider", async () => {
    const {registry, addressesProvider} = await loadFixture(fixture);

    await registry.registerAddressesProvider(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      NEW_ADDRESSES_PROVIDER_ID_2
    );
    const providersBefore = await registry.getAddressesProvidersList();

    expect(
      await registry.unregisterAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS)
    )
      .to.emit(registry, "AddressesProviderUnregistered")
      .withArgs(NEW_ADDRESSES_PROVIDER_ADDRESS, NEW_ADDRESSES_PROVIDER_ID_2);

    const providersAfter = await registry.getAddressesProvidersList();

    expect(providersAfter.length).to.be.equal(
      providersBefore.length - 1,
      "Invalid length of the addresses providers list"
    );
    expect(providersAfter[0].toString()).to.be.equal(
      addressesProvider.address,
      "Invalid addresses provider added to the list"
    );
  });

  it("TC-addresses-provider-registry-13 Tries to remove an already unregistered addressesProvider (revert expected)", async () => {
    const {registry} = await loadFixture(fixture);

    await registry.registerAddressesProvider(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      NEW_ADDRESSES_PROVIDER_ID_2
    );

    expect(
      await registry.unregisterAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS)
    )
      .to.emit(registry, "AddressesProviderUnregistered")
      .withArgs(NEW_ADDRESSES_PROVIDER_ADDRESS, NEW_ADDRESSES_PROVIDER_ID_2);

    await expect(
      registry.unregisterAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS)
    ).to.be.revertedWith(ADDRESSES_PROVIDER_NOT_REGISTERED);
  });

  it("TC-addresses-provider-registry-14 Removes the last addresses provider", async () => {
    const {registry, addressesProvider, users} = await loadFixture(fixture);
    await registry.registerAddressesProvider(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      NEW_ADDRESSES_PROVIDER_ID_2
    );
    await registry.registerAddressesProvider(
      users[1].address,
      NEW_ADDRESSES_PROVIDER_ID_3
    );
    const providersBefore = await registry.getAddressesProvidersList();
    const providerToRemove = providersBefore[providersBefore.length - 1];
    const providerToRemoveId = await registry.getAddressesProviderIdByAddress(
      providerToRemove
    );

    expect(await registry.unregisterAddressesProvider(providerToRemove))
      .to.emit(registry, "AddressesProviderUnregistered")
      .withArgs(providerToRemove, providerToRemoveId);

    const providersAfter = await registry.getAddressesProvidersList();

    expect(providersAfter.length).to.be.equal(
      providersBefore.length - 1,
      "Invalid length of the addresses providers list"
    );
    expect(providersAfter[0].toString()).to.be.equal(
      addressesProvider.address,
      "Invalid addresses provider added to the list"
    );
  });

  it("TC-addresses-provider-registry-15 Remove provider in the middle of the list", async () => {
    const {addressesProvider, registry, users} = await loadFixture(fixture);
    await registry.registerAddressesProvider(
      NEW_ADDRESSES_PROVIDER_ADDRESS,
      NEW_ADDRESSES_PROVIDER_ID_2
    );
    await registry.registerAddressesProvider(
      users[1].address,
      NEW_ADDRESSES_PROVIDER_ID_3
    );
    // now, there should be 3 providers.
    const providersBefore = await registry.getAddressesProvidersList();
    expect(providersBefore.length).to.be.eq(3);

    // remove the one in the middle
    await registry.unregisterAddressesProvider(providersBefore[1]);

    const providersAfter = await registry.getAddressesProvidersList();
    expect(providersAfter.length).to.be.eq(2);
    expect(providersAfter[0]).to.be.eq(addressesProvider.address);
    // check the last one's index becomes 1
    expect(providersAfter[1]).to.be.eq(users[1].address);
  });
});
