import {expect} from "chai";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {ProtocolErrors} from "../deploy/helpers/types";
import {
  deployDelegationAwarePToken,
  deployMintableDelegationERC20,
} from "../deploy/helpers/contracts-deployments";
import {DelegationAwarePToken} from "../types";
import {MintableDelegationERC20} from "../types";
import {makeSuite, TestEnv} from "./helpers/make-suite";

makeSuite("PToken: DelegationAwarePToken", (testEnv: TestEnv) => {
  let delegationPToken = <DelegationAwarePToken>{};
  let delegationERC20 = <MintableDelegationERC20>{};

  it("Deploys a new MintableDelegationERC20 and a DelegationAwarePToken", async () => {
    const {pool} = testEnv;

    delegationERC20 = await deployMintableDelegationERC20(["DEL", "DEL", "18"]);

    delegationPToken = await deployDelegationAwarePToken([
      pool.address,
      delegationERC20.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      "aDEL",
      "aDEL",
    ]);
  });

  it("Tries to delegate with the caller not being the ParaSpace admin (revert expected)", async () => {
    const {users} = testEnv;

    await expect(
      delegationPToken
        .connect(users[1].signer)
        .delegateUnderlyingTo(users[2].address)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);
  });

  it("Delegates to user 2", async () => {
    const {users} = testEnv;

    expect(await delegationPToken.delegateUnderlyingTo(users[2].address))
      .to.emit(delegationPToken, "DelegateUnderlyingTo")
      .withArgs(users[2].address);

    const delegateeAddress = await delegationERC20.delegatee();

    expect(delegateeAddress).to.be.equal(users[2].address);
  });
});
