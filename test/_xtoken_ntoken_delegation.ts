import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {
  getDelegationRegistry,
  getUiPoolDataProvider,
} from "../helpers/contracts-getters";
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
      .delegateForToken(user2.address, ["0"], true);

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

  it("TC-ntoken-delegation-02: Non-Owner of NToken can not delegate to a given address", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
    } = testEnv;

    await expect(
      nBAYC.connect(user2.signer).delegateForToken(user1.address, ["0"], true)
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

  it("TC-ntoken-delegation-03: Owner of NToken can revoke delegation of a given address", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
    } = testEnv;

    await nBAYC
      .connect(user1.signer)
      .delegateForToken(user2.address, ["0"], false);

    await expect(
      await delegationRegistry.getDelegatesForToken(
        nBAYC.address,
        bayc.address,
        "0"
      )
    ).to.be.empty;
  });

  it("TC-ntoken-delegation-04: Delegation status after resupplying the same token by different user", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
      pool,
    } = testEnv;

    await nBAYC
      .connect(user1.signer)
      .delegateForToken(user2.address, ["0"], true);

    await pool
      .connect(user1.signer)
      .withdrawERC721(bayc.address, ["0"], user2.address);
    await bayc.connect(user2.signer).setApprovalForAll(pool.address, true);
    await pool
      .connect(user2.signer)
      .supplyERC721(
        bayc.address,
        [{tokenId: 0, useAsCollateral: true}],
        user2.address,
        "0x0"
      );

    const delegatesAfter = await delegationRegistry.getDelegatesForToken(
      nBAYC.address,
      bayc.address,
      "0"
    );

    await expect(delegatesAfter).to.be.empty;
  });

  it("TC-ntoken-delegation-05: Delegation status after transferring the ntoken", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2, user3],
    } = testEnv;

    await nBAYC
      .connect(user2.signer)
      .delegateForToken(user3.address, ["0"], true);

    await nBAYC
      .connect(user2.signer)
      ["safeTransferFrom(address,address,uint256)"](
        user2.address,
        user1.address,
        "0"
      );

    const delegatesAfter = await delegationRegistry.getDelegatesForToken(
      nBAYC.address,
      bayc.address,
      "0"
    );

    await expect(delegatesAfter).to.be.empty;
  });

  it("TC-ntoken-delegation-06: UI Provider can reterive delegation data for multiple tokens", async () => {
    const {
      nBAYC,
      bayc,
      users: [user1, user2],
    } = testEnv;

    await nBAYC
      .connect(user1.signer)
      .delegateForToken(user2.address, ["0"], true);

    const uiProvider = await getUiPoolDataProvider();

    const delegatesForToken = await delegationRegistry.getDelegatesForToken(
      nBAYC.address,
      bayc.address,
      "0"
    );

    const delegations = await uiProvider.getDelegatesForTokens(nBAYC.address, [
      "0",
    ]);

    await expect(delegatesForToken).to.be.eql(delegations[0].delegations);
  });
});
