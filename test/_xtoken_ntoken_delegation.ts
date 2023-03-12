import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {getDelegationRegistry} from "../helpers/contracts-getters";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {supplyAndValidate} from "./helpers/validated-steps";

describe("NToken general", async () => {
  let delegationRegistry;
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    delegationRegistry = await getDelegationRegistry();
  });

  it("TC-ntoken-delegation-01: Owner of NToken can delegate to a given address", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
    } = testEnv;

    await supplyAndValidate(bayc, "1", user1, true);

    await nBAYC
      .connect(user1.signer)
      .delegateForToken(user2.address, "0", true);
    await expect(
      (
        await delegationRegistry.getDelegatesForToken(
          nBAYC.address,
          bayc.address,
          "0"
        )
      )[0]
    ).to.be.eq(user2.address);
  });

  it("TC-ntoken-delegation-01: Non-Owner of NToken can not delegate to a given address", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
    } = testEnv;

    await expect(
      nBAYC.connect(user2.signer).delegateForToken(user1.address, "0", true)
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);
    await expect(
      (
        await delegationRegistry.getDelegatesForToken(
          nBAYC.address,
          bayc.address,
          "0"
        )
      )[0]
    ).to.be.eq(user2.address);
  });

  it("TC-ntoken-delegation-01: Owner of NToken can revoke delegation of a given address", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
    } = testEnv;

    await nBAYC
      .connect(user1.signer)
      .delegateForToken(user2.address, "0", false);
    await expect(
      await delegationRegistry.getDelegatesForToken(
        nBAYC.address,
        bayc.address,
        "0"
      )
    ).to.be.empty;
  });
});
