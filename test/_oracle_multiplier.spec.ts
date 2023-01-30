import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {HALF_WAD, WAD} from "../helpers/constants";
import {deployERC721AtomicOracleWrapper} from "../helpers/contracts-deployments";
import {getAggregator} from "../helpers/contracts-getters";
import {evmRevert, evmSnapshot, waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {MocksConfig} from "../market-config/mocks";
import {ERC721AtomicOracleWrapper} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("ERC721 Atomic Oracle", () => {
  let snap: string;
  let testEnv: TestEnv;
  let baycAtomicAggregator: ERC721AtomicOracleWrapper;
  const tokenId0 = "0";
  const tokenId1 = "1";
  const tokenId2 = "2";

  beforeEach(async () => {
    snap = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snap);
  });

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const baycAggregator = await getAggregator(undefined, "BAYC");
    baycAtomicAggregator = (
      await deployERC721AtomicOracleWrapper(
        testEnv.addressesProvider.address,
        baycAggregator.address,
        testEnv.bayc.address,
        "BAYCAtomic",
        false
      )
    ).connect(testEnv.poolAdmin.signer);
    const {addressesProvider, oracle} = testEnv;
    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));
  });

  after(async () => {
    const {paraspaceOracle, addressesProvider} = testEnv;
    await waitForTx(
      await addressesProvider.setPriceOracle(paraspaceOracle.address)
    );
  });

  it("price is equal to original aggregator price when there is no multiplier", async () => {
    expect(await baycAtomicAggregator.getTokenPrice(tokenId0)).to.be.eq(
      MocksConfig.AllAssetsInitialPrices.BAYC
    );
  });

  it("set priceMultiplier < 1x is not allowed (revert expected)", async () => {
    await expect(
      baycAtomicAggregator.setPriceMultiplier(tokenId0, HALF_WAD)
    ).to.be.revertedWith("invalid price multiplier");
  });

  it("set priceMultiplier > 10x is not allowed (revert expected)", async () => {
    await expect(
      baycAtomicAggregator.setPriceMultiplier(
        tokenId0,
        BigNumber.from(WAD).mul(10).add(1)
      )
    ).to.be.revertedWith("invalid price multiplier");
  });

  it("price is equal to 2x of floor when multiplier is set to 2", async () => {
    await waitForTx(
      await baycAtomicAggregator.setPriceMultiplier(
        tokenId0,
        BigNumber.from(WAD).mul(2)
      )
    );

    expect(await baycAtomicAggregator.getTokenPrice(tokenId0)).to.be.eq(
      BigNumber.from(MocksConfig.AllAssetsInitialPrices.BAYC).mul(2)
    );
  });

  it("multiplier can be removed by setting to 1x", async () => {
    // resume price
    await waitForTx(
      await baycAtomicAggregator.setPriceMultiplier(tokenId0, WAD)
    );

    expect(await baycAtomicAggregator.getTokenPrice(tokenId0)).to.be.eq(
      MocksConfig.AllAssetsInitialPrices.BAYC
    );
  });

  it("prices are correct when there are multiple tokens", async () => {
    await waitForTx(
      await baycAtomicAggregator.setPriceMultiplier(
        tokenId0,
        BigNumber.from(WAD).mul(2)
      )
    );
    await waitForTx(
      await baycAtomicAggregator.setPriceMultiplier(
        tokenId1,
        BigNumber.from(WAD).mul(3)
      )
    );

    expect(await baycAtomicAggregator.getTokenPrice(tokenId0)).to.be.eq(
      BigNumber.from(MocksConfig.AllAssetsInitialPrices.BAYC).mul(2)
    );
    expect(await baycAtomicAggregator.getTokenPrice(tokenId1)).to.be.eq(
      BigNumber.from(MocksConfig.AllAssetsInitialPrices.BAYC).mul(3)
    );
    expect(await baycAtomicAggregator.getTokenPrice(tokenId2)).to.be.eq(
      BigNumber.from(MocksConfig.AllAssetsInitialPrices.BAYC)
    );
  });

  it("normal users cannot setPriceMultiplier (revert expected)", async () => {
    const {
      users: [, , user3],
    } = testEnv;
    await expect(
      baycAtomicAggregator
        .connect(user3.signer)
        .setPriceMultiplier(tokenId0, BigNumber.from(WAD).mul(2))
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN);
  });
});
