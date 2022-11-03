import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {
  deployDelegationAwarePToken,
  deployMintableDelegationERC20,
} from "../deploy/helpers/contracts-deployments";
import {ProtocolErrors} from "../deploy/helpers/types";
import {testEnvFixture} from "./helpers/setup-env";

describe("Ptoken delegation", () => {
  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {pool} = testEnv;
    const delegationERC20 = await deployMintableDelegationERC20([
      "DEL",
      "DEL",
      "18",
    ]);
    const delegationPToken = await deployDelegationAwarePToken([
      pool.address,
      delegationERC20.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      "aDEL",
      "aDEL",
    ]);
    return {
      ...testEnv,
      delegationERC20,
      delegationPToken,
    };
  };

  it("TC-ptoken-delegation-aware-01: user shouldn't call delegateUnderlyingTo if he isn't POOL_ADMIN", async () => {
    const {
      users: [user1, user2],
      delegationPToken,
    } = await loadFixture(fixture);

    await expect(
      delegationPToken.connect(user1.signer).delegateUnderlyingTo(user2.address)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_POOL_ADMIN);
  });

  it("TC-ptoken-delegation-aware-02: POOL_ADMIN should delegate to external address", async () => {
    const {
      users: [user2],
      delegationERC20,
      delegationPToken,
    } = await loadFixture(fixture);
    expect(await delegationPToken.delegateUnderlyingTo(user2.address))
      .to.emit(delegationPToken, "DelegateUnderlyingTo")
      .withArgs(user2.address);

    const delegateeAddress = await delegationERC20.delegatee();

    expect(delegateeAddress).to.be.equal(user2.address);
  });
});

describe("Ptoken modifiers", () => {
  it("TC-ptoken-access-control-01: mint should only be called by POOL", async () => {
    const {deployer, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.mint(deployer.address, deployer.address, "1", "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });

  it("TC-ptoken-access-control-02: burn should only be called by POOL", async () => {
    const {deployer, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.burn(deployer.address, deployer.address, "1", "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });

  it("TC-ptoken-access-control-03: transferOnLiquidation should only be called by POOL", async () => {
    const {deployer, users, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.transferOnLiquidation(deployer.address, users[0].address, "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });

  it("TC-ptoken-access-control-04: transferUnderlyingTo should only be called by POOL", async () => {
    const {deployer, pDai} = await loadFixture(testEnvFixture);
    await expect(
      pDai.transferUnderlyingTo(deployer.address, "1")
    ).to.be.revertedWith(ProtocolErrors.CALLER_MUST_BE_POOL);
  });
});
