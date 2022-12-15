import {expect} from "chai";
import {utils} from "ethers";
import {ZERO_ADDRESS} from "../helpers/constants";
import {deployPoolCoreLibraries} from "../helpers/contracts-deployments";
import {ProtocolErrors} from "../helpers/types";
import {PoolCore__factory} from "../types";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {getFirstSigner} from "../helpers/contracts-getters";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {impersonateAddress} from "../helpers/contracts-helpers";

describe("Pool: Initialization", () => {
  const {
    CALLER_NOT_POOL_CONFIGURATOR,
    NOT_CONTRACT,
    INVALID_ADDRESSES_PROVIDER,
  } = ProtocolErrors;

  it("TC-pool_initialization-01 Check correct initialization of MAX_NUMBER_RESERVES", async () => {
    const {pool} = await loadFixture(testEnvFixture);
    const MAX_NUMBER_RESERVES = 128;

    expect(await pool.MAX_NUMBER_RESERVES()).to.be.eq(MAX_NUMBER_RESERVES);
  });

  it("TC-pool_initialization-02 Initialize fresh deployment with incorrect addresses provider (revert expected)", async () => {
    const {
      addressesProvider,
      users: [deployer],
    } = await loadFixture(testEnvFixture);

    const coreLibraries = await deployPoolCoreLibraries(false);
    const poolCore = await new PoolCore__factory(
      coreLibraries,
      await getFirstSigner()
    ).deploy(addressesProvider.address);

    await expect(poolCore.initialize(deployer.address)).to.be.revertedWith(
      INVALID_ADDRESSES_PROVIDER
    );
  });

  it("TC-pool_initialization-03 Tries to initialize a reserve as non PoolConfigurator (revert expected)", async () => {
    const {pool, users, dai, protocolDataProvider} = await loadFixture(
      testEnvFixture
    );

    const config = await protocolDataProvider.getReserveTokensAddresses(
      dai.address
    );

    await expect(
      pool
        .connect(users[0].signer)
        .initReserve(
          dai.address,
          config.xTokenAddress,
          config.variableDebtTokenAddress,
          ZERO_ADDRESS,
          ZERO_ADDRESS
        )
    ).to.be.revertedWith(CALLER_NOT_POOL_CONFIGURATOR);
  });

  it("TC-pool_initialization-04 Tries to call `initReserve()` with an EOA as reserve (revert expected)", async () => {
    const {pool, deployer, users, configurator} = await loadFixture(
      testEnvFixture
    );

    // Impersonate PoolConfigurator
    await topUpNonPayableWithEther(
      deployer.signer,
      [configurator.address],
      utils.parseEther("1")
    );
    const configSigner = (await impersonateAddress(configurator.address))
      .signer;

    await expect(
      pool
        .connect(configSigner)
        .initReserve(
          users[0].address,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS,
          ZERO_ADDRESS
        )
    ).to.be.revertedWith(NOT_CONTRACT);
  });
});
