import {waitForTx} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {
  convertToCurrencyDecimals,
  getEthersSigners,
} from "../deploy/helpers/contracts-helpers";
import {makeSuite} from "./helpers/make-suite";
import {ethers} from "hardhat";
import {expect} from "chai";
import {MockAggregator} from "../types";

makeSuite("Price Oracle update", (testEnv) => {
  let firstDaiDeposit;

  before("Initialize Depositors", async () => {
    const {dai} = testEnv;
    firstDaiDeposit = await convertToCurrencyDecimals(dai.address, "10000");
    await convertToCurrencyDecimals(dai.address, "20000");
    await convertToCurrencyDecimals(dai.address, "50000");
  });

  it("User 1 deposits 10k DAI", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "20000"))
    );

    // approve protocol to access user2 wallet
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 1 - Deposit dai
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(dai.address, firstDaiDeposit, user1.address, "0")
    );
  });

  it("Deploy new mock aggregator, update ParaSpaceOracle and supply to pool again", async () => {
    const {
      dai,
      users: [user1],
      pool,
      paraspaceOracle,
    } = testEnv;
    const [deployer] = await getEthersSigners();
    await deployer.getAddress();

    await ethers.provider.listAccounts();

    const newMockAggregator = await ethers.getContractFactory("MockAggregator");
    const newPrice = 3690684128600000;
    const newMockAggregatorDeployed = newMockAggregator.deploy(newPrice);
    const newMockAggregatorDeployedAddress = (await newMockAggregatorDeployed)
      .address;

    await waitForTx(
      await paraspaceOracle
        .connect(deployer)
        .setAssetSources([dai.address], [newMockAggregatorDeployedAddress])
    );

    // read from aggregator
    const newDaiPrice = await (
      (await newMockAggregatorDeployed) as MockAggregator
    ).latestAnswer();
    expect(newDaiPrice).to.eq(newPrice);
    // read new price from oracle
    const daiPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(dai.address);
    expect(newDaiPrice).to.eq(daiPrice);

    // User 1 - Deposit dai
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(dai.address, firstDaiDeposit, user1.address, "0")
    );
  });
});
