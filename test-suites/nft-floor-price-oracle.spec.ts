import {expect} from "chai";
import {advanceTimeAndBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {getEthersSigners} from "../deploy/helpers/contracts-helpers";
import {makeSuite, revertHead, setSnapshot} from "./helpers/make-suite";
import {parseEther} from "ethers/lib/utils";
import {snapshot} from "./helpers/snapshot-manager";
import {utils} from "ethers";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";
import {getNFTFloorOracle} from "../deploy/helpers/contracts-getters";
import {deployERC721OracleWrapper} from "../deploy/helpers/contracts-deployments";

makeSuite("NFT Oracle Tests", (testEnv) => {
  let snapthotId: string;

  before(async () => {
    const {bayc, addressesProvider, paraspaceOracle, nftFloorOracle} = testEnv;

    await setSnapshot();

    const [deployer] = await getEthersSigners();

    await nftFloorOracle.connect(deployer).addAssets([bayc.address]);

    await nftFloorOracle.connect(deployer).setConfig(1, 0, 200);

    const baycOracleWrapper = await deployERC721OracleWrapper(
      addressesProvider.address,
      nftFloorOracle.address,
      bayc.address,
      false
    );

    await waitForTx(
      await paraspaceOracle.setAssetSources(
        [bayc.address],
        [baycOracleWrapper.address]
      )
    );
  });

  after(async () => {
    await revertHead();
  });

  beforeEach("Take Blockchain Snapshot", async () => {
    snapthotId = await snapshot.take();
  });

  afterEach("Revert Blockchain to Snapshot", async () => {
    await snapshot.revert(snapthotId);
  });

  it("FallbackOracle is used when NFTFloorOracle replies a zero price", async () => {
    const {bayc, paraspaceOracle, nftFloorOracle} = testEnv;
    const [deployer, updater] = await getEthersSigners();

    // set BAYC price to 0 on NFT oracle (failure price)
    nftFloorOracle
      .connect(deployer) // zero price needs to be fed by admin
      .setPrice(bayc.address, "0");
    const twap = await (await getNFTFloorOracle())
      .connect(updater)
      .getTwap(bayc.address);
    expect(twap).to.equal("0");

    // price should now be requested to the fallback oracle
    const fallbackPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(bayc.address);

    expect(fallbackPrice).to.equal(MOCK_CHAINLINK_AGGREGATORS_PRICES.BAYC);
  });

  it("If NFT Oracle is paused, feeding new prices is not possible", async () => {
    const {bayc, paraspaceOracle} = testEnv;

    const [deployer, updater] = await getEthersSigners();

    // pause the oracle for BAYC contract
    await (await getNFTFloorOracle())
      .connect(deployer)
      .setPause(bayc.address, true);

    // try to feed a new price
    expect(
      (await getNFTFloorOracle())
        .connect(updater)
        .setPrice(bayc.address, parseEther("8").toString())
    ).to.be.revertedWith("NFTOracle: nft price feed paused");

    // unpause the oracle
    await (await getNFTFloorOracle())
      .connect(deployer)
      .setPause(bayc.address, false);

    // feed a new price
    const newPrice = parseEther("8");
    await (await getNFTFloorOracle())
      .connect(updater)
      .setPrice(bayc.address, newPrice.toString());

    // price should've been updated
    const postBaycPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(bayc.address);

    expect(postBaycPrice).to.equal(newPrice);
  });

  it("Can get quote for a new asset", async () => {
    const {dai} = testEnv;
    const [deployer, updater] = await getEthersSigners();

    // add a new asset
    await (await getNFTFloorOracle())
      .connect(deployer)
      .addAssets([dai.address]);

    // set price for new asset
    const price = parseEther("5");
    await (await getNFTFloorOracle())
      .connect(updater)
      .setPrice(dai.address, price.toString());

    // price set should be fetch successfully
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(dai.address)
    ).to.equal(price);
  });

  it("Cannot get quote for a removed asset", async () => {
    const {bayc, paraspaceOracle} = testEnv;
    const [deployer, updater] = await getEthersSigners();
    const preBaycPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(bayc.address);

    // remove BAYC from assets
    await (await getNFTFloorOracle())
      .connect(deployer)
      .removeAsset(bayc.address);

    // price for an unknown asset should be 0
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(bayc.address)
    ).to.equal(0);

    // and so the fallback oracle should provide the price
    const currentPrice = await paraspaceOracle
      .connect(deployer)
      .getAssetPrice(bayc.address);

    expect(currentPrice).to.equal(preBaycPrice);
  });

  it("Oracle feeders list can be updated", async () => {
    const {
      bayc,
      users: [, , user3],
    } = testEnv;
    const [deployer, updater] = await getEthersSigners();

    // grant feeder rights to user3
    await (await getNFTFloorOracle())
      .connect(deployer)
      .setOracles([user3.address]);

    // feed new price with user3
    const price = parseEther("2");
    await (await getNFTFloorOracle())
      .connect(user3.signer)
      .setPrice(bayc.address, price.toString());

    // verify new price was successfully set
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(bayc.address)
    ).to.equal(price);
  });

  it("Feeders, updater and admin can feed a price", async () => {
    const {
      bayc,
      users: [, , user3],
    } = testEnv;
    const [deployer, updater] = await getEthersSigners();

    // feed with admin (deployer)
    const price = parseEther("1");
    expect(
      await (await getNFTFloorOracle())
        .connect(deployer)
        .setPrice(bayc.address, price.toString())
    );

    // feed with updater
    const price2 = parseEther("2");
    expect(
      await (await getNFTFloorOracle())
        .connect(updater)
        .setPrice(bayc.address, price2.toString())
    );

    // feed with feeder
    const price3 = parseEther("3");
    expect(
      (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPrice(bayc.address, price3.toString())
    );
  });

  it("Only admin can feed price as 0", async () => {
    const {
      bayc,
      users: [, , user3],
    } = testEnv;
    const [deployer, updater] = await getEthersSigners();

    //const price = BigNumber.from(0);

    // feed with user3 (should revert)
    await expect(
      (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPrice(bayc.address, "0")
    ).to.be.revertedWith("NFTOracle: price can not be 0");

    // feed with updater(should revert)
    await expect(
      (await getNFTFloorOracle()).connect(updater).setPrice(bayc.address, "0")
    ).to.be.revertedWith("NFTOracle: price can not be 0");

    // feed with admin (deployer) - ok
    expect(
      await (await getNFTFloorOracle())
        .connect(deployer)
        .setPrice(bayc.address, "0")
    );
  });

  it("Administrator role can be granted to another user", async () => {
    const {
      bayc,
      users: [, , user3],
      aclManager,
    } = testEnv;
    const [deployer, updater] = await getEthersSigners();

    // user3 cannot pause the contract
    await expect(
      (await getNFTFloorOracle()).connect(updater).setPause(bayc.address, true)
    ).to.be.reverted;

    // grant admin role to user3
    await (await getNFTFloorOracle())
      .connect(deployer)
      .grantRole(aclManager.DEFAULT_ADMIN_ROLE(), user3.address);

    // only DEFAULT_ADMIN_ROLE can pause the contract
    expect(
      await (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPause(bayc.address, true)
    );

    // previous DEFAULT_ADMIN_ROLE can also unpause the contract
    expect(
      await (await getNFTFloorOracle())
        .connect(deployer)
        .setPause(bayc.address, false)
    );

    // but UPDATER user cannot pause the contract
    await expect(
      (await getNFTFloorOracle()).connect(updater).setPause(bayc.address, true)
    ).to.be.reverted;
  });

  it("Feeders with revoked rights cannot feed price", async () => {
    const {
      bayc,
      users: [, , user3],
    } = testEnv;
    const [deployer] = await getEthersSigners();

    // revoke UPDATER role to user3
    await (await getNFTFloorOracle())
      .connect(deployer)
      .revokeRole(
        utils.keccak256(utils.toUtf8Bytes("UPDATER_ROLE")),
        user3.address
      );

    const price = parseEther("3");
    // try to feed new price with user3
    await expect(
      (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPrice(bayc.address, price.toString())
    ).to.be.reverted;
  });

  it("Only when minCountToAggregate is reached, median value from the different providers is returned", async () => {
    const {
      bayc,
      users: [, user2, user3, user4],
    } = testEnv;
    const [deployer, updater] = await getEthersSigners();
    // set initial price to 0.5 ETH
    expect(
      await (await getNFTFloorOracle())
        .connect(deployer)
        .setPrice(bayc.address, parseEther("1").div(2))
    );

    // set minCounToAggregate to 3
    await (await getNFTFloorOracle()).connect(deployer).setConfig(3, 60, 200);

    // advance 60 seconds in time so previous prices expire
    await advanceTimeAndBlock(60);

    // set feeders
    await (await getNFTFloorOracle())
      .connect(deployer)
      .setOracles([user2.address, user3.address, user4.address]);

    const initialPrice = await (await getNFTFloorOracle())
      .connect(updater)
      .getTwap(bayc.address);

    const price1 = parseEther("1");
    const price2 = parseEther("2");
    const price3 = parseEther("3");

    // set first price, but should not aggregate
    expect(
      await (await getNFTFloorOracle())
        .connect(user2.signer)
        .setPrice(bayc.address, price1.toString())
    );
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(bayc.address)
    ).to.equal(initialPrice);

    // set second price, should not aggregate
    expect(
      await (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPrice(bayc.address, price2.toString())
    );
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(bayc.address)
    ).to.equal(initialPrice);

    // set third price, should aggregate
    expect(
      await (await getNFTFloorOracle())
        .connect(user4.signer)
        .setPrice(bayc.address, price3.toString())
    );
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(bayc.address)
    ).to.equal(parseEther("2")); // array position int(3/2)=1 of (1, 2, 3)
  });

  it("Oracle quotes expire based on expirationPeriod", async () => {
    const {
      bayc,
      users: [, user2, user3, user4],
    } = testEnv;
    const [deployer, updater] = await getEthersSigners();
    // set minCounToAggregate to 2, expiration period to 60 seconds
    await (await getNFTFloorOracle()).connect(deployer).setConfig(2, 60, 200);
    // set feeders
    await (await getNFTFloorOracle())
      .connect(deployer)
      .setOracles([user2.address, user3.address, user4.address]);

    expect(
      await (await getNFTFloorOracle())
        .connect(user2.signer)
        .setPrice(bayc.address, parseEther("1").toString())
    );

    // advance 30 seconds in time
    await advanceTimeAndBlock(30);

    expect(
      await (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPrice(bayc.address, parseEther("3").toString())
    );

    // prices are aggregated (takes array position: 2/2 = 1)
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(bayc.address)
    ).to.equal(parseEther("3"));

    // advance 30 seconds in time
    await advanceTimeAndBlock(30);

    expect(
      await (await getNFTFloorOracle())
        .connect(user4.signer)
        .setPrice(bayc.address, parseEther("5").toString())
    );
    // first price should've expired, takes new array position 1
    expect(
      await (await getNFTFloorOracle()).connect(updater).getTwap(bayc.address)
    ).to.equal(parseEther("5"));
  });

  it("Price changes away from maxPriceDeviation are not taken into account", async () => {
    const {
      bayc,
      users: [, user2, user3, user4],
    } = testEnv;
    const [deployer] = await getEthersSigners();

    // set feeders
    await (await getNFTFloorOracle())
      .connect(deployer)
      .setOracles([user2.address, user3.address, user4.address]);

    // set initial price to 1 ETH
    expect(
      await (await getNFTFloorOracle())
        .connect(user2.signer)
        .setPrice(bayc.address, parseEther("1"))
    );

    // set maxPriceDeviation to 2 times
    await (await getNFTFloorOracle()).connect(deployer).setConfig(1, 60, 2);

    // try to set price to 0.25 ETH (should be reverted)
    expect(
      (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPrice(bayc.address, parseEther("1").div(4))
    ).to.be.revertedWith("NFTOracle: invalid price data");

    // try to set price to 2 ETH (should be reverted)
    expect(
      (await getNFTFloorOracle())
        .connect(user3.signer)
        .setPrice(bayc.address, parseEther("2"))
    ).to.be.revertedWith("NFTOracle: invalid price data");

    // set price to 0.5 ETH (edge, but should be accepted)
    expect(
      await (await getNFTFloorOracle())
        .connect(user2.signer)
        .setPrice(bayc.address, parseEther("1").div(2).add(1))
    );
  });
});
