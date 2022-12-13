import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {ONE_ADDRESS} from "../helpers/constants";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("AddressesProviderRegistry", () => {
  let testEnv: TestEnv;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
  });
  const NEW_ADDRESSES_PROVIDER_ID_2 = 2;
  const NEW_ADDRESSES_PROVIDER_ID_3 = 3;
  const NEW_ADDRESSES_PROVIDER_ADDRESS = ONE_ADDRESS;

  const {
    INVALID_ADDRESSES_PROVIDER_ID,
    ADDRESSES_PROVIDER_NOT_REGISTERED,
    ADDRESSES_PROVIDER_ALREADY_ADDED,
  } = ProtocolErrors;

  it("TC-addresses-provider-registry-01 Checks the addresses provider is added to the registry", async () => {
    const {addressesProvider, registry} = testEnv;

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

  it("TC-addresses-provider-registry-02 Tries to register an addresses provider with id 0 (revert expected)", async () => {
    const {registry, poolAdmin} = testEnv;

    await expect(
      registry
        .connect(poolAdmin.signer)
        .registerAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS, "0")
    ).to.be.revertedWith(INVALID_ADDRESSES_PROVIDER_ID);
  });

  it("TC-addresses-provider-registry-03 Registers a mock addresses provider", async () => {
    const {registry, poolAdmin} = testEnv;

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

  it("TC-addresses-provider-registry-04 Registers users[2] as another addresses provider", async () => {
    const {users, registry} = testEnv;

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

  it("TC-addresses-provider-registry-05 Removes the mock addresses provider", async () => {
    const {registry, addressesProvider} = testEnv;

    const providersBefore = await registry.getAddressesProvidersList();

    expect(
      await registry.getAddressesProviderIdByAddress(
        NEW_ADDRESSES_PROVIDER_ADDRESS
      )
    ).to.be.equal(NEW_ADDRESSES_PROVIDER_ID_2);

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

  it("TC-addresses-provider-registry-06 Tries to remove an already unregistered addressesProvider (revert expected)", async () => {
    const {registry} = testEnv;

    await expect(
      registry.unregisterAddressesProvider(NEW_ADDRESSES_PROVIDER_ADDRESS)
    ).to.be.revertedWith(ADDRESSES_PROVIDER_NOT_REGISTERED);
  });

  it("TC-addresses-provider-registry-07 Tries to add an already registered addressesProvider with a different id (revert expected)", async () => {
    const {registry, addressesProvider} = testEnv;

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

  it("TC-addresses-provider-registry-08 Tries to add an addressesProvider with an already used id (revert expected)", async () => {
    const {users, registry, addressesProvider} = testEnv;

    const id = await registry.getAddressesProviderIdByAddress(
      addressesProvider.address
    );
    expect(id).not.to.be.eq(0);

    // Simulating an addresses provider using the users[5] wallet address
    await expect(
      registry.registerAddressesProvider(users[5].address, id)
    ).to.be.revertedWith(ProtocolErrors.INVALID_ADDRESSES_PROVIDER_ID);

    const providers = await registry.getAddressesProvidersList();
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

  it("TC-addresses-provider-registry-09 Re-registers the mock addresses provider after it being removed", async () => {
    const {registry} = testEnv;

    const providersBefore = await registry.getAddressesProvidersList();

    expect(
      await registry.registerAddressesProvider(
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

  it("TC-addresses-provider-registry-10 Removes the last addresses provider", async () => {
    const {registry, addressesProvider} = testEnv;

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
});
