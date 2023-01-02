import {expect} from "chai";
import {getParaSpaceConfig, waitForTx} from "../helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {parseEther} from "ethers/lib/utils";
import {snapshot} from "./helpers/snapshot-manager";
import {utils} from "ethers";
import {
  deployAggregator,
  deployERC721OracleWrapper,
  deployMintableERC721,
} from "../helpers/contracts-deployments";
import {loadFixture, mine} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {MintableERC721} from "../types";

describe("NFT Oracle Tests", () => {
  let snapthotId: string;
  let testEnv: TestEnv;
  let mockToken: MintableERC721;

  before(async () => {
    const mockTokenSymbol = "MOCK-ORACLE";

    testEnv = await loadFixture(testEnvFixture);

    mockToken = await deployMintableERC721(
      [mockTokenSymbol, mockTokenSymbol, ""],
      false
    );
    await deployAggregator(
      mockTokenSymbol,
      getParaSpaceConfig().Mocks!.AllAssetsInitialPrices.BAYC,
      false
    );

    const {addressesProvider, paraspaceOracle, nftFloorOracle} = testEnv;

    try {
      await waitForTx(await nftFloorOracle.addAssets([mockToken.address]));
      //set 7 oracles and threshold is 3
      await waitForTx(
        //we've already added 3 users when deployment,so only the left 4 should be fine
        await nftFloorOracle.addFeeders([
          testEnv.users[3].address,
          testEnv.users[4].address,
          testEnv.users[5].address,
          testEnv.users[6].address,
        ])
      );
    } catch (err) {
      //for rerunable test_only mode just ignore duplication error
      console.error(err);
    }
    const oracleWrapper = await deployERC721OracleWrapper(
      addressesProvider.address,
      nftFloorOracle.address,
      mockToken.address,
      mockTokenSymbol,
      false
    );

    await waitForTx(
      await paraspaceOracle.setAssetSources(
        [mockToken.address],
        [oracleWrapper.address]
      )
    );
    await waitForTx(await nftFloorOracle.setConfig(600, 2000));
  });

  beforeEach("Take Blockchain Snapshot", async () => {
    snapthotId = await snapshot.take();
  });

  afterEach("Revert Blockchain to Snapshot", async () => {
    await snapshot.revert(snapthotId);
  });

  it("TC-oracle-nft-floor-price-03:Update NFT price in NFTOracle then can get the new price from ParaSpaceOracle", async () => {
    const {paraspaceOracle, nftFloorOracle} = testEnv;

    await nftFloorOracle.setMultiplePrices([mockToken.address], ["5"]);

    const twapFromNftOracle = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapFromNftOracle).to.equal("5");

    const price = await paraspaceOracle.getAssetPrice(mockToken.address);

    expect(price).to.equal(twapFromNftOracle);
  });

  it("TC-oracle-nft-floor-price-06:If NFT Oracle is paused, feeding new prices is not possible", async () => {
    const {
      nftFloorOracle,
      users: [updater],
    } = testEnv;

    // pause the oracle for bayc contract
    await nftFloorOracle.setPause(mockToken.address, true);

    // try to feed a new price
    await expect(
      nftFloorOracle
        .connect(updater.signer)
        .setMultiplePrices([mockToken.address], [parseEther("8").toString()])
    ).to.be.revertedWith("NFTOracle: nft price feed paused");

    // unpause the oracle
    await nftFloorOracle.setPause(mockToken.address, false);

    // admin can feed a new price
    const newPrice = parseEther("8");
    await nftFloorOracle.setMultiplePrices(
      [mockToken.address],
      [newPrice.toString()]
    );

    // updater also can feed price
    await nftFloorOracle
      .connect(updater.signer)
      .setMultiplePrices([mockToken.address], [newPrice.toString()]);

    // price should've been updated
    const postPrice = await nftFloorOracle.getPrice(mockToken.address);

    expect(postPrice).to.equal(newPrice);
  });

  it("TC-oracle-nft-floor-price-07:Can get quote for a new asset", async () => {
    const {
      nftFloorOracle,
      dai,
      users: [updater],
    } = testEnv;

    // add a new asset
    try {
      await nftFloorOracle.addAssets([dai.address]);
    } catch (e) {
      //just ignore
    }

    // set price for new asset
    const price = parseEther("5");
    await nftFloorOracle
      .connect(updater.signer)
      .setMultiplePrices([dai.address], [price.toString()]);

    // price set should be fetch successfully
    expect(await nftFloorOracle.getPrice(dai.address)).to.equal(price);
  });

  it("TC-oracle-nft-floor-price-08:Cannot get quote for a removed asset", async () => {
    const {paraspaceOracle, nftFloorOracle} = testEnv;

    // remove nft from assets
    await nftFloorOracle.removeAssets([mockToken.address]);

    // get price for an unknown asset from nftOracle will revert
    await expect(nftFloorOracle.getPrice(mockToken.address)).to.be.revertedWith(
      "NFTOracle: asset price not ready"
    );

    // get price for an unknown asset from paraspaceOracle should be reverted
    await expect(
      paraspaceOracle.getAssetPrice(mockToken.address)
    ).to.be.revertedWith("NFTOracle: asset price not ready");
  });

  it("TC-oracle-nft-floor-price-09:Oracle feeders list can be updated from owner and rejected from other", async () => {
    const {nftFloorOracle, users} = testEnv;
    const user7 = users[7];
    // grant feeder rights to a new user 7 or a existed will be reverted
    await nftFloorOracle.addFeeders([users[7].address]);

    // feed new price with user7
    const price = parseEther("2");
    await nftFloorOracle
      .connect(user7.signer)
      .setMultiplePrices([mockToken.address], [price.toString()]);

    // verify new price was successfully set
    expect(await nftFloorOracle.getPrice(mockToken.address)).to.equal(price);

    // but feeder can not add any other feeder
    await expect(
      nftFloorOracle.connect(user7.signer).addFeeders([users[7].address])
    ).to.be.reverted;

    // and even admin can not add already exist feeder
    await expect(
      nftFloorOracle.addFeeders([users[3].address])
    ).to.be.revertedWith("NFTOracle: feeder existed");
  });

  it("TC-oracle-nft-floor-price-09.1:Feeder can be removed by admin and remove feeder not exist will be reverted", async () => {
    const {nftFloorOracle} = testEnv;
    const feeders: string[] = [];

    for (
      let i = 0;
      i < (await nftFloorOracle.getFeederSize()).toNumber();
      i++
    ) {
      feeders.push(await nftFloorOracle.feeders(i));
    }

    for (let i = 0; i < feeders.length; i += 1) {
      const feederSizeBefore = await nftFloorOracle.getFeederSize();
      // admin can remove exist feeder
      const feeder = feeders[i];
      await nftFloorOracle.removeFeeders([feeder], {
        gasLimit: 12_450_000,
      });
      // but can not remove not exist one
      await expect(nftFloorOracle.removeFeeders([feeder])).to.be.revertedWith(
        "NFTOracle: feeder not existed"
      );
      const feederSizeAfter = await nftFloorOracle.getFeederSize();
      expect(feederSizeAfter.toNumber()).to.equal(
        feederSizeBefore.toNumber() - 1
      );
    }

    for (let i = 0; i < feeders.length; i++) {
      expect(
        await nftFloorOracle.hasRole(
          await nftFloorOracle.UPDATER_ROLE(),
          feeders[i]
        )
      ).to.be.false;
      expect((await nftFloorOracle.feederPositionMap(feeders[i])).registered).to
        .be.false;
    }
    expect(await nftFloorOracle.getFeederSize()).to.be.eq(0);
  });

  it("TC-oracle-nft-floor-price-09.2:All feeders can be removed by admin in one tx", async () => {
    const {nftFloorOracle} = testEnv;
    const feeders: string[] = [];

    for (
      let i = 0;
      i < (await nftFloorOracle.getFeederSize()).toNumber();
      i++
    ) {
      feeders.push(await nftFloorOracle.feeders(i));
    }

    expect(await nftFloorOracle.getFeederSize()).to.be.gt(0);

    // admin can remove exist feeder
    await nftFloorOracle.removeFeeders(feeders, {
      gasLimit: 12_450_000,
    });
    // but can not remove not exist one
    await expect(nftFloorOracle.removeFeeders(feeders)).to.be.revertedWith(
      "NFTOracle: feeder not existed"
    );

    for (let i = 0; i < feeders.length; i++) {
      expect(
        await nftFloorOracle.hasRole(
          await nftFloorOracle.UPDATER_ROLE(),
          feeders[i]
        )
      ).to.be.false;
      expect((await nftFloorOracle.feederPositionMap(feeders[i])).registered).to
        .be.false;
    }

    expect(await nftFloorOracle.getFeederSize()).to.be.eq(0);
  });

  it("TC-oracle-nft-floor-price-10:Feeders, updater and admin can feed a price", async () => {
    const {
      nftFloorOracle,
      users: [updater],
    } = testEnv;

    // feed with admin
    const price = parseEther("1");
    expect(
      await nftFloorOracle.setMultiplePrices(
        [mockToken.address],
        [price.toString()]
      )
    );

    // feed with updater
    const price2 = parseEther("1.2");
    expect(
      await nftFloorOracle
        .connect(updater.signer)
        .setMultiplePrices([mockToken.address], [price2.toString()])
    );
  });

  it("TC-oracle-nft-floor-price-11:Administrator role can be granted to another user", async () => {
    const {
      nftFloorOracle,
      users: [updater, , user3],
      aclManager,
    } = testEnv;
    // user3 cannot pause the contract
    await expect(
      nftFloorOracle.connect(user3.signer).setPause(mockToken.address, true)
    ).to.be.reverted;

    // grant admin role to user3
    await nftFloorOracle.grantRole(
      aclManager.DEFAULT_ADMIN_ROLE(),
      user3.address
    );

    // now user3 can pause the contract
    expect(
      await nftFloorOracle
        .connect(user3.signer)
        .setPause(mockToken.address, true)
    );

    // previous DEFAULT_ADMIN_ROLE can also unpause the contract
    expect(
      await nftFloorOracle
        .connect(testEnv.poolAdmin.signer)
        .setPause(mockToken.address, false)
    );

    // but UPDATER user cannot pause the contract
    await expect(
      nftFloorOracle.connect(updater.signer).setPause(mockToken.address, true)
    ).to.be.reverted;
  });

  it("TC-oracle-nft-floor-price-10:Feeders with revoked rights cannot feed price", async () => {
    const {
      nftFloorOracle,
      users: [, , user3],
    } = testEnv;

    // revoke UPDATER role from user3
    await nftFloorOracle.revokeRole(
      utils.keccak256(utils.toUtf8Bytes("UPDATER_ROLE")),
      user3.address
    );

    const price = parseEther("3");
    // try to feed new price with user3
    await expect(
      nftFloorOracle
        .connect(user3.signer)
        .setMultiplePrices([mockToken.address], [price.toString()])
    ).to.be.reverted;
  });

  it("TC-oracle-nft-floor-price-12:Only when minCountToAggregate is reached, median value from the different providers is returned", async () => {
    const {
      nftFloorOracle,
      //user 4 is admin in test deployment so skip it
      users: [user1, user2, user3, , user4, user5],
    } = testEnv;

    //120 blocks as expiration and 20 times as deviation
    await waitForTx(await nftFloorOracle.setConfig(120, 2000));

    // set initial price to 10 ETH
    const initialPrice = parseEther("10");
    await waitForTx(
      await nftFloorOracle.setEmergencyPrice(mockToken.address, initialPrice)
    );

    let twapPrice = await nftFloorOracle.getPrice(mockToken.address);

    expect(twapPrice).to.equal(initialPrice);

    const price1 = parseEther("1");
    const price2 = parseEther("2");
    const price3 = parseEther("3");
    const price4 = parseEther("4");
    const price5 = parseEther("5");

    // set first price,not enough price so still initial
    await waitForTx(
      await nftFloorOracle
        .connect(user1.signer)
        .setMultiplePrices([mockToken.address], [price1.toString()])
    );

    twapPrice = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapPrice).to.equal(initialPrice);

    //set second price, not enough, so still initial
    await waitForTx(
      await nftFloorOracle
        .connect(user2.signer)
        .setMultiplePrices([mockToken.address], [price2.toString()])
    );

    twapPrice = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapPrice).to.equal(initialPrice);

    // set third price,should be enough and aggregate with [1,2,3]=2
    await waitForTx(
      await nftFloorOracle
        .connect(user3.signer)
        .setMultiplePrices([mockToken.address], [price3.toString()])
    );
    twapPrice = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapPrice).to.equal(price2);

    // set fourth price,since threshold=4,enough so aggregate with [1,2,3,4]=3
    await waitForTx(
      await nftFloorOracle
        .connect(user4.signer)
        .setMultiplePrices([mockToken.address], [price4.toString()])
    );

    twapPrice = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapPrice).to.equal(price3);

    // set fifth price, aggregate [1,2,3,4,5]=3
    await waitForTx(
      await nftFloorOracle
        .connect(user5.signer)
        .setMultiplePrices([mockToken.address], [price5.toString()])
    );

    twapPrice = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapPrice).to.equal(price3);
  });

  it("TC-oracle-nft-floor-price-13:Oracle quotes expire based on expirationPeriod", async () => {
    const {
      nftFloorOracle,
      users: [user1, user2, user3, , user4],
    } = testEnv;
    // set expiration period to 5 block and deviation as 20
    await nftFloorOracle.setConfig(5, 2000);

    //user1 set price as 1,block:1
    expect(
      await nftFloorOracle
        .connect(user1.signer)
        .setMultiplePrices([mockToken.address], [parseEther("1").toString()])
    );

    const twapPrice = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapPrice).to.equal(parseEther("1"));

    //user2 set price as 2,block:2
    expect(
      await nftFloorOracle
        .connect(user2.signer)
        .setMultiplePrices([mockToken.address], [parseEther("2").toString()])
    );

    // prices user1:1 and user2:2 not enough so still use previous
    expect(await nftFloorOracle.getPrice(mockToken.address)).to.equal(
      parseEther("1")
    );

    // set price so block=3 now,user1:1 and user2:2 and user3:3
    // now reach threshold and can be aggregated [1,2,3]=2
    expect(
      await nftFloorOracle
        .connect(user3.signer)
        .setMultiplePrices([mockToken.address], [parseEther("3").toString()])
    );
    expect(await nftFloorOracle.getPrice(mockToken.address)).to.equal(
      parseEther("2")
    );

    // set price so block=4 now,user1:1 and user2:2 and user3:4,user4:4
    // can be aggregated [1,2,3,4]=3
    expect(
      await nftFloorOracle
        .connect(user4.signer)
        .setMultiplePrices([mockToken.address], [parseEther("4").toString()])
    );
    expect(await nftFloorOracle.getPrice(mockToken.address)).to.equal(
      parseEther("3")
    );

    await mine(); //block 5
    expect(await nftFloorOracle.getPrice(mockToken.address)).to.equal(
      parseEther("3")
    );

    //set price as 2 with user 4 at block 6, and 6-1>=5 so price from user1 expired
    expect(
      await nftFloorOracle
        .connect(user4.signer)
        .setMultiplePrices([mockToken.address], [parseEther("2").toString()])
    );
    //so now price are: user2:2,user3:3,user4:2
    //which aggregated to [2,3,2] and 2 will be finalized
    expect(await nftFloorOracle.getPrice(mockToken.address)).to.equal(
      parseEther("2")
    );
    //mine another 10 block to make all price expired
    for (let i = 0; i < 10; i++) {
      await mine();
    }
    await expect(nftFloorOracle.getPrice(mockToken.address)).to.be.revertedWith(
      "NFTOracle: asset price expired"
    );
  });

  it("TC-oracle-nft-floor-price-14:Price changes away from maxPriceDeviation are not taken into account", async () => {
    const {
      nftFloorOracle,
      users: [user1, user2],
    } = testEnv;

    // set maxPriceDeviation to 200%
    await nftFloorOracle.setConfig(60, 200);

    // set initial price to 1 ETH
    await nftFloorOracle.setMultiplePrices(
      [mockToken.address],
      [parseEther("1")]
    );

    const twapFromNftOracle = await nftFloorOracle.getPrice(mockToken.address);
    expect(twapFromNftOracle).to.equal(parseEther("1"));

    // try to set price to 0.25 ETH (should be reverted)
    await expect(
      nftFloorOracle
        .connect(user1.signer)
        .setMultiplePrices([mockToken.address], [parseEther("1").div(4)])
    ).to.be.revertedWith("NFTOracle: invalid price data");

    // try to set price to 3 ETH (should be reverted)
    await expect(
      nftFloorOracle
        .connect(user2.signer)
        .setMultiplePrices([mockToken.address], [parseEther("3")])
    ).to.be.revertedWith("NFTOracle: invalid price data");
  });
});
