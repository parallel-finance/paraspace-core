import {expect} from "chai";
import {advanceTimeAndBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {getEthersSigners} from "../deploy/helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {parseEther} from "ethers/lib/utils";
import {snapshot} from "./helpers/snapshot-manager";
import {utils} from "ethers";
import {deployERC721OracleWrapper} from "../deploy/helpers/contracts-deployments";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {ERC721TokenContractId} from "../deploy/helpers/types";

describe("NFT Oracle Tests", () => {
  let snapthotId: string;
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {doodles, addressesProvider, paraspaceOracle, nftFloorOracle} =
      testEnv;

    await nftFloorOracle.addAssets([doodles.address]);

    await nftFloorOracle.setConfig(1, 0, 200);

    const doodlesOracleWrapper = await deployERC721OracleWrapper(
      addressesProvider.address,
      nftFloorOracle.address,
      doodles.address,
      ERC721TokenContractId.DOODLE,
      false
    );

    await waitForTx(
      await paraspaceOracle.setAssetSources(
        [doodles.address],
        [doodlesOracleWrapper.address]
      )
    );
  });

  beforeEach("Take Blockchain Snapshot", async () => {
    snapthotId = await snapshot.take();
  });

  afterEach("Revert Blockchain to Snapshot", async () => {
    await snapshot.revert(snapthotId);
  });

  it("TC-oracle-nft-floor-price-03:Update NFT price in NFTOracle then can get the new price from ParaSpaceOracle", async () => {
    const {doodles, paraspaceOracle, nftFloorOracle} = testEnv;

    await nftFloorOracle.setPrice(doodles.address, "5");

    const twapFromNftOracle = await nftFloorOracle.getTwap(doodles.address);
    expect(twapFromNftOracle).to.equal("5");

    const price = await paraspaceOracle.getAssetPrice(doodles.address);

    expect(price).to.equal(twapFromNftOracle);
  });

  it("TC-oracle-nft-floor-price-06:If NFT Oracle is paused, feeding new prices is not possible", async () => {
    const {
      doodles,
      paraspaceOracle,
      users: [user1],
      nftFloorOracle,
    } = testEnv;
    await waitForTx(await nftFloorOracle.setOracles([user1.address]));

    // pause the oracle for doodles contract
    await waitForTx(await nftFloorOracle.setPause(doodles.address, true));

    // try to feed a new price
    await expect(
      nftFloorOracle
        .connect(user1.signer)
        .setPrice(doodles.address, parseEther("8").toString())
    ).to.be.revertedWith("NFTOracle: nft price feed paused");

    // unpause the oracle
    await nftFloorOracle.setPause(doodles.address, false);

    // feed a new price
    const newPrice = parseEther("8");
    await nftFloorOracle
      .connect(user1.signer)
      .setPrice(doodles.address, newPrice.toString());

    // price should've been updated
    const postdoodlesPrice = await paraspaceOracle.getAssetPrice(
      doodles.address
    );

    expect(postdoodlesPrice).to.equal(newPrice);
  });

  it("TC-oracle-nft-floor-price-07:Can get quote for a new asset", async () => {
    const {dai, nftFloorOracle} = testEnv;

    // add a new asset
    await nftFloorOracle.addAssets([dai.address]);

    // set price for new asset
    const price = parseEther("5");
    await nftFloorOracle.setPrice(dai.address, price.toString());

    // price set should be fetch successfully
    expect(await nftFloorOracle.getTwap(dai.address)).to.equal(price);
  });

  it("TC-oracle-nft-floor-price-08:Cannot get quote for a removed asset", async () => {
    const {doodles, paraspaceOracle, nftFloorOracle} = testEnv;
    const predoodlesPrice = await paraspaceOracle.getAssetPrice(
      doodles.address
    );

    // remove doodles from assets
    await nftFloorOracle.removeAsset(doodles.address);

    // price for an unknown asset should be 0
    expect(await nftFloorOracle.getTwap(doodles.address)).to.equal(0);

    // and so the fallback oracle should provide the price
    const currentPrice = await paraspaceOracle.getAssetPrice(doodles.address);

    expect(currentPrice).to.equal(predoodlesPrice);
  });

  it("TC-oracle-nft-floor-price-09:Oracle feeders list can be updated from owner and rejected from other", async () => {
    const {
      doodles,
      nftFloorOracle,
      users: [, , user3],
    } = testEnv;

    // grant feeder rights to user3
    await nftFloorOracle.setOracles([user3.address]);

    // feed new price with user3
    const price = parseEther("2");
    await nftFloorOracle
      .connect(user3.signer)
      .setPrice(doodles.address, price.toString());

    // verify new price was successfully set
    expect(await nftFloorOracle.getTwap(doodles.address)).to.equal(price);

    await expect(
      nftFloorOracle.connect(user3.signer).setOracles([user3.address])
    ).to.be.reverted;
  });

  it("TC-oracle-nft-floor-price-10:Feeders, updater and admin can feed a price", async () => {
    const {
      doodles,
      nftFloorOracle,
      users: [, , user3],
    } = testEnv;

    // feed with admin (deployer)
    const price = parseEther("1");
    expect(await nftFloorOracle.setPrice(doodles.address, price.toString()));

    // feed with updater
    const price2 = parseEther("2");
    expect(await nftFloorOracle.setPrice(doodles.address, price2.toString()));

    // feed with feeder
    const price3 = parseEther("3");
    expect(
      nftFloorOracle
        .connect(user3.signer)
        .setPrice(doodles.address, price3.toString())
    );
  });

  it("Only admin can feed price as 0", async () => {
    const {
      doodles,
      poolAdmin,
      nftFloorOracle,
      users: [user1],
    } = testEnv;

    await nftFloorOracle.setOracles([user1.address, poolAdmin.address]);

    // feed with user1 (should revert)
    await expect(
      nftFloorOracle.connect(user1.signer).setPrice(doodles.address, "0")
    ).to.be.revertedWith("NFTOracle: price should be more than 0");

    // feed with updater(should revert)
    await expect(
      nftFloorOracle.connect(user1.signer).setPrice(doodles.address, "0")
    ).to.be.revertedWith("NFTOracle: price should be more than 0");

    // feed with admin (poolAdmin) - ok
    expect(await nftFloorOracle.setPrice(doodles.address, "0"));
  });

  it("TC-oracle-nft-floor-price-11:Administrator role can be granted to another user", async () => {
    const {
      doodles,
      nftFloorOracle,
      users: [user1, user2],
      aclManager,
    } = testEnv;
    await nftFloorOracle.setOracles([user2.address]);

    // user1 cannot pause the contract
    await expect(
      nftFloorOracle.connect(user1.signer).setPause(doodles.address, true)
    ).to.be.reverted;

    // grant admin role to user1
    await nftFloorOracle.grantRole(
      aclManager.DEFAULT_ADMIN_ROLE(),
      user1.address
    );

    // only DEFAULT_ADMIN_ROLE can pause the contract
    expect(
      await nftFloorOracle.connect(user1.signer).setPause(doodles.address, true)
    );

    // previous DEFAULT_ADMIN_ROLE can also unpause the contract
    expect(await nftFloorOracle.setPause(doodles.address, false));

    // but UPDATER user cannot pause the contract
    await expect(
      nftFloorOracle.connect(user2.signer).setPause(doodles.address, true)
    ).to.be.reverted;
  });

  it("TC-oracle-nft-floor-price-10:Feeders with revoked rights cannot feed price", async () => {
    const {
      doodles,
      nftFloorOracle,
      users: [, , user3],
    } = testEnv;

    // revoke UPDATER role to user3
    await nftFloorOracle.revokeRole(
      utils.keccak256(utils.toUtf8Bytes("UPDATER_ROLE")),
      user3.address
    );

    const price = parseEther("3");
    // try to feed new price with user3
    await expect(
      nftFloorOracle
        .connect(user3.signer)
        .setPrice(doodles.address, price.toString())
    ).to.be.reverted;
  });

  it("TC-oracle-nft-floor-price-12:Only when minCountToAggregate is reached, median value from the different providers is returned", async () => {
    const {
      doodles,
      nftFloorOracle,
      users: [, user2, user3, user4],
    } = testEnv;
    // set initial price to 0.5 ETH
    expect(
      await nftFloorOracle.setPrice(doodles.address, parseEther("1").div(2))
    );

    // set minCounToAggregate to 3
    await nftFloorOracle.setConfig(3, 60, 200);

    // advance 60 seconds in time so previous prices expire
    await advanceTimeAndBlock(60);

    // set feeders
    await nftFloorOracle.setOracles([
      user2.address,
      user3.address,
      user4.address,
    ]);

    const initialPrice = await nftFloorOracle.getTwap(doodles.address);

    const price1 = parseEther("1");
    const price2 = parseEther("2");
    const price3 = parseEther("3");

    // set first price, but should not aggregate
    expect(
      await nftFloorOracle
        .connect(user2.signer)
        .setPrice(doodles.address, price1.toString())
    );
    expect(await nftFloorOracle.getTwap(doodles.address)).to.equal(
      initialPrice
    );

    // set second price, should not aggregate
    expect(
      await nftFloorOracle
        .connect(user3.signer)
        .setPrice(doodles.address, price2.toString())
    );
    expect(await nftFloorOracle.getTwap(doodles.address)).to.equal(
      initialPrice
    );

    // set third price, should aggregate
    expect(
      await nftFloorOracle
        .connect(user4.signer)
        .setPrice(doodles.address, price3.toString())
    );
    expect(await nftFloorOracle.getTwap(doodles.address)).to.equal(
      parseEther("3") // FIXME
    ); // array position int(3/2)=1 of (1, 2, 3)
  });

  it("TC-oracle-nft-floor-price-13:Oracle quotes expire based on expirationPeriod", async () => {
    const {
      doodles,
      nftFloorOracle,
      users: [, user2, user3, user4],
    } = testEnv;
    const [, updater] = await getEthersSigners();
    // set minCounToAggregate to 2, expiration period to 60 seconds
    await nftFloorOracle.setConfig(2, 60, 200);
    // set feeders
    await nftFloorOracle.setOracles([
      user2.address,
      user3.address,
      user4.address,
    ]);

    expect(
      await nftFloorOracle
        .connect(user2.signer)
        .setPrice(doodles.address, parseEther("1").toString())
    );

    // advance 30 seconds in time
    await advanceTimeAndBlock(30);

    expect(
      await nftFloorOracle
        .connect(user3.signer)
        .setPrice(doodles.address, parseEther("3").toString())
    );

    // prices are aggregated (takes array position: 2/2 = 1)
    expect(
      await nftFloorOracle.connect(updater).getTwap(doodles.address)
    ).to.equal(parseEther("3"));

    // advance 30 seconds in time
    await advanceTimeAndBlock(30);

    expect(
      await nftFloorOracle
        .connect(user4.signer)
        .setPrice(doodles.address, parseEther("5").toString())
    );
    // first price should've expired, takes new array position 1
    expect(
      await nftFloorOracle.connect(updater).getTwap(doodles.address)
    ).to.equal(parseEther("5"));
  });

  it("TC-oracle-nft-floor-price-14:Price changes away from maxPriceDeviation are not taken into account", async () => {
    const {
      doodles,
      nftFloorOracle,
      users: [, user2, user3, user4],
    } = testEnv;

    // set feeders
    await nftFloorOracle.setOracles([
      user2.address,
      user3.address,
      user4.address,
    ]);

    // set initial price to 1 ETH
    expect(
      await nftFloorOracle
        .connect(user2.signer)
        .setPrice(doodles.address, parseEther("1"))
    );

    // set maxPriceDeviation to 2 times
    await nftFloorOracle.setConfig(1, 60, 2);

    // try to set price to 0.25 ETH (should be reverted)
    expect(
      nftFloorOracle
        .connect(user3.signer)
        .setPrice(doodles.address, parseEther("1").div(4))
    ).to.be.revertedWith("NFTOracle: invalid price data");

    // try to set price to 2 ETH (should be reverted)
    expect(
      nftFloorOracle
        .connect(user3.signer)
        .setPrice(doodles.address, parseEther("2"))
    ).to.be.revertedWith("NFTOracle: invalid price data");

    // set price to 0.5 ETH (edge, but should be accepted)
    expect(
      await nftFloorOracle
        .connect(user2.signer)
        .setPrice(doodles.address, parseEther("1").div(2).add(1))
    );
  });
});
