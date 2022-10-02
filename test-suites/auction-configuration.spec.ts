import {expect} from "chai";
import {BigNumber} from "ethers";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";
import {deployMockReserveConfiguration} from "../deploy/helpers/contracts-deployments";
import {MockReserveConfiguration} from "../types";

describe("AuctionConfiguration", async () => {
  let snap: string;

  beforeEach(async () => {
    snap = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snap);
  });

  let configMock: MockReserveConfiguration;

  const MAX_VALID_AUCTION_RECOVERY_HEALTH_FACTOR = BigNumber.from(
    "18446744073709551615"
  );

  before(async () => {
    configMock = await deployMockReserveConfiguration();
  });

  it("set/getAuctionRecoveryHealthFactor()", async () => {
    expect(await configMock.getAuctionRecoveryHealthFactor()).to.be.eq(0);
    expect(
      await configMock.setAuctionRecoveryHealthFactor(
        MAX_VALID_AUCTION_RECOVERY_HEALTH_FACTOR
      )
    );
    expect(await configMock.getAuctionRecoveryHealthFactor()).to.be.eq(
      MAX_VALID_AUCTION_RECOVERY_HEALTH_FACTOR
    );
  });

  it("set/getAuctionEnabled()", async () => {
    expect(await configMock.getAuctionEnabled()).to.be.eq(false);
    // turn on
    expect(await configMock.setAuctionEnabled(true));
    expect(await configMock.getAuctionEnabled()).to.be.eq(true);
    // turn off
    expect(await configMock.setAuctionEnabled(false));
    expect(await configMock.getAuctionEnabled()).to.be.eq(false);
  });
});
