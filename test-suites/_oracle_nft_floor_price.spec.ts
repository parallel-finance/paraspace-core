import {expect} from "chai";
import {getParaSpaceConfig, waitForTx} from "../deploy/helpers/misc-utils";
import {TestEnv} from "./helpers/make-suite";
import {parseEther} from "ethers/lib/utils";
import {snapshot} from "./helpers/snapshot-manager";
import {utils} from "ethers";
import {getNFTFloorOracle} from "../deploy/helpers/contracts-getters";
import {
  deployAggregator,
  deployERC721OracleWrapper,
  deployMintableERC721,
} from "../deploy/helpers/contracts-deployments";
import {loadFixture, mine} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {ProtocolErrors} from "../deploy/helpers/types";
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
      await waitForTx(
        await nftFloorOracle.setOracles([
          testEnv.users[0].address,
          testEnv.users[1].address,
        ])
      );
    } catch (err) {
      //for test_only mode just ignore duplication error
    }

    const oracleWrapper = await deployERC721OracleWrapper(
      addressesProvider.address,
      nftFloorOracle.address,
      mockToken.address,
      mockTokenSymbol,
      1800,
      false
    );

    await waitForTx(
      await paraspaceOracle.setAssetSources(
        [mockToken.address],
        [oracleWrapper.address]
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
    const {paraspaceOracle, nftFloorOracle} = testEnv;

    await nftFloorOracle.setPrice(mockToken.address, "5");

    const twapFromNftOracle = await nftFloorOracle.getTwap(mockToken.address);
    expect(twapFromNftOracle).to.equal("5");

    const price = await paraspaceOracle.getAssetPrice(mockToken.address);

    expect(price).to.equal(twapFromNftOracle);
  });

  it("TC-oracle-nft-floor-price-06:If NFT Oracle is paused, feeding new prices is not possible", async () => {
    const {
      paraspaceOracle,
      nftFloorOracle,
      users: [updater],
    } = testEnv;

    // pause the oracle for bayc contract
    await nftFloorOracle.setPause(mockToken.address, true);

    // try to feed a new price
    await expect(
      nftFloorOracle
        .connect(updater.signer)
        .setPrice(mockToken.address, parseEther("8").toString())
    ).to.be.revertedWith("NFTOracle: nft price feed paused");

    // unpause the oracle
    await nftFloorOracle.setPause(mockToken.address, false);

    // feed a new price
    const newPrice = parseEther("8");
    await nftFloorOracle
      .connect(updater.signer)
      .setPrice(mockToken.address, newPrice.toString());

    // price should've been updated
    const postPrice = await paraspaceOracle.getAssetPrice(mockToken.address);

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
      .setPrice(dai.address, price.toString());

    // price set should be fetch successfully
    expect(await nftFloorOracle.getTwap(dai.address)).to.equal(price);
  });

  it("TC-oracle-nft-floor-price-08:Cannot get quote for a removed asset", async () => {
    const {paraspaceOracle, nftFloorOracle} = testEnv;

    // remove nft from assets
    await nftFloorOracle.removeAsset(mockToken.address);

    // get price for an unknown asset from nftOracle will return 0
    expect(await nftFloorOracle.getTwap(mockToken.address)).to.equal(0);

    // get price for an unknown asset from paraspaceOracle should be reverted
    await expect(
      paraspaceOracle.getAssetPrice(mockToken.address)
    ).to.be.revertedWith(ProtocolErrors.ORACLE_PRICE_NOT_READY);
  });

  it("TC-oracle-nft-floor-price-09:Oracle feeders list can be updated from owner and rejected from other", async () => {
    const {
      nftFloorOracle,
      users: [, , user3],
    } = testEnv;
    // grant feeder rights to user3
    await nftFloorOracle.setOracles([user3.address]);

    // feed new price with user3
    const price = parseEther("2");
    await nftFloorOracle
      .connect(user3.signer)
      .setPrice(mockToken.address, price.toString());

    // verify new price was successfully set
    expect(await nftFloorOracle.getTwap(mockToken.address)).to.equal(price);

    // but feeder can not set oracles
    await expect(
      nftFloorOracle.connect(user3.signer).setOracles([user3.address])
    ).to.be.reverted;
  });

  it("TC-oracle-nft-floor-price-10:Feeders, updater and admin can feed a price", async () => {
    const {
      nftFloorOracle,
      users: [updater],
    } = testEnv;

    // feed with admin
    const price = parseEther("1");
    expect(await nftFloorOracle.setPrice(mockToken.address, price.toString()));

    // feed with updater
    const price2 = parseEther("2");
    expect(
      await nftFloorOracle
        .connect(updater.signer)
        .setPrice(mockToken.address, price2.toString())
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
        .setPrice(mockToken.address, price.toString())
    ).to.be.reverted;
  });

  it("TC-oracle-nft-floor-price-12:Only when minCountToAggregate is reached, median value from the different providers is returned", async () => {
    const {
      nftFloorOracle,
      users: [user1, user2],
    } = testEnv;

    //120 blocks as expiration and 20 times as deviation
    await waitForTx(await nftFloorOracle.setConfig(120, 2000));

    // set initial price to 10 ETH
    const initialPrice = parseEther("10");
    await waitForTx(
      await nftFloorOracle.setPrice(mockToken.address, initialPrice)
    );

    let twapPrice = await nftFloorOracle.getTwap(mockToken.address);

    expect(twapPrice).to.equal(initialPrice);

    const price1 = parseEther("1");
    const price2 = parseEther("2");

    // set first price,not enough price so still initial
    await waitForTx(
      await nftFloorOracle
        .connect(user1.signer)
        .setPrice(mockToken.address, price1.toString())
    );

    twapPrice = await nftFloorOracle.getTwap(mockToken.address);
    expect(twapPrice).to.equal(initialPrice);

    // set second price, should aggregate and use the latest
    await waitForTx(
      await nftFloorOracle
        .connect(user2.signer)
        .setPrice(mockToken.address, price2.toString())
    );

    twapPrice = await nftFloorOracle.getTwap(mockToken.address);
    expect(twapPrice).to.equal(price2);
  });

  it("TC-oracle-nft-floor-price-13:Oracle quotes expire based on expirationPeriod", async () => {
    const {
      nftFloorOracle,
      paraspaceOracle,
      users: [user1, user2],
    } = testEnv;
    // set expiration period to 5 block and deviation as 20
    await nftFloorOracle.setConfig(5, 2000);

    //user1 set price as 1,block:1
    expect(
      await nftFloorOracle
        .connect(user1.signer)
        .setPrice(mockToken.address, parseEther("1").toString())
    );

    const twapPrice = await nftFloorOracle.getTwap(mockToken.address);
    expect(twapPrice).to.equal(parseEther("1"));

    //user2 set price as 2,block:2
    expect(
      await nftFloorOracle
        .connect(user2.signer)
        .setPrice(mockToken.address, parseEther("2").toString())
    );

    // prices user1:[1] and user2:[2] are aggregated as [1,2] and finalized as 2
    expect(await nftFloorOracle.getTwap(mockToken.address)).to.equal(
      parseEther("2")
    );

    // set price so block=3 now,user1:[1,3] and user2:[2]
    // and aggregated to [1,2] and 2 will be finalized
    expect(
      await nftFloorOracle
        .connect(user1.signer)
        .setPrice(mockToken.address, parseEther("3").toString())
    );
    expect(await nftFloorOracle.getTwap(mockToken.address)).to.equal(
      parseEther("2")
    );

    //mine block will not change price
    await mine();
    expect(await nftFloorOracle.getTwap(mockToken.address)).to.equal(
      parseEther("2")
    );

    //set price at block 5 and price 1 from user1 will be expired
    expect(
      await nftFloorOracle
        .connect(user1.signer)
        .setPrice(mockToken.address, parseEther("5").toString())
    );
    //and with user1:[1(expired),3,5] and user2:[2] so aggregated to [3,2]
    //and 2 will be finalized
    expect(await nftFloorOracle.getTwap(mockToken.address)).to.equal(
      parseEther("2")
    );

    //mine block 6,7
    await mine();
    await mine();
    //user1 set new price as 8
    expect(
      await (await getNFTFloorOracle())
        .connect(user1.signer)
        .setPrice(mockToken.address, parseEther("8").toString())
    );
    //user1:[1(expired),3,5,8],user2:[2(expired)] so [3,5]
    //and 5 will be finalized
    expect(
      await (await getNFTFloorOracle()).getTwap(mockToken.address)
    ).to.equal(parseEther("5"));
    const price = await paraspaceOracle.getAssetPrice(mockToken.address);
    expect(price).to.equal(parseEther("5"));
  });

  it("TC-oracle-nft-floor-price-14:Price changes away from maxPriceDeviation are not taken into account", async () => {
    const {
      nftFloorOracle,
      users: [user1, user2],
    } = testEnv;

    // set maxPriceDeviation to 200%
    await nftFloorOracle.setConfig(60, 200);

    // set initial price to 1 ETH
    await nftFloorOracle.setPrice(mockToken.address, parseEther("1"));

    const twapFromNftOracle = await nftFloorOracle.getTwap(mockToken.address);
    expect(twapFromNftOracle).to.equal(parseEther("1"));

    // try to set price to 0.25 ETH (should be reverted)
    await expect(
      nftFloorOracle
        .connect(user1.signer)
        .setPrice(mockToken.address, parseEther("1").div(4))
    ).to.be.revertedWith("NFTOracle: invalid price data");

    // try to set price to 3 ETH (should be reverted)
    await expect(
      nftFloorOracle
        .connect(user2.signer)
        .setPrice(mockToken.address, parseEther("3"))
    ).to.be.revertedWith("NFTOracle: invalid price data");
  });
});
