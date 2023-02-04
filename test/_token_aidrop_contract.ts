import {expect} from "chai";
import {utils} from "ethers";
import {testEnvFixture} from "./helpers/setup-env";

import {ProtocolErrors} from "../helpers/types";
import {deployParaSpaceAidrop} from "../helpers/contracts-deployments";
import {loadFixture} from "ethereum-waffle";
import {TestEnv} from "./helpers/make-suite";
import {ParaSpaceAidrop} from "../types";
import {toBN} from "../helpers/seaport-helpers/encoding";
import {advanceTimeAndBlock} from "../helpers/misc-utils";

describe("Token Aidrop Contract", () => {
  const {OWNABLE_ONLY_OWNER} = ProtocolErrors;
  let testEnv: TestEnv;
  let aidropContract: ParaSpaceAidrop;
  const deadline = "2675468152";
  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {ape} = testEnv;

    aidropContract = await deployParaSpaceAidrop(ape.address, deadline);
    await ape["mint(address,uint256)"](aidropContract.address, "10000000");

    return testEnv;
  };

  it("only owner can setup aidrop for user", async () => {
    const {
      users: [, user2],
    } = await loadFixture(fixture);

    await aidropContract.setUsersAirdropAmounts([user2.address], ["1000"]);
    const {amount, claimed} = await aidropContract.userStatus(user2.address);

    await expect(amount).to.be.eq(utils.parseUnits("1000", "0"));
    await expect(claimed).to.be.eq(false);

    await expect(
      aidropContract
        .connect(user2.signer)
        .setUsersAirdropAmounts([user2.address], ["10000"])
    ).to.be.revertedWith(OWNABLE_ONLY_OWNER);
  });

  it("user should be able to claim an aidrop", async () => {
    const {
      users: [, user2],
    } = await loadFixture(fixture);

    await expect(await aidropContract.connect(user2.signer).claimAidrop());
  });

  it("user shouldn't be able to claim an aidrop twice", async () => {
    const {
      users: [, user2],
    } = await loadFixture(fixture);

    await expect(
      aidropContract.connect(user2.signer).claimAidrop()
    ).to.be.revertedWith("airdrop already claimed");
  });

  it("user shouldn't be able to claim an aidrop after deadline", async () => {
    const {
      users: [, , user3],
    } = await loadFixture(fixture);
    await aidropContract.setUsersAirdropAmounts([user3.address], ["1000"]);
    await advanceTimeAndBlock(Number(deadline) + 1);

    await expect(
      aidropContract.connect(user3.signer).claimAidrop()
    ).to.be.revertedWith("airdrop ended");
  });

  it("user shouldn't be able to claim an aidrop with amount 0", async () => {
    const {
      users: [, , , user4],
    } = await loadFixture(fixture);

    await expect(
      aidropContract.connect(user4.signer).claimAidrop()
    ).to.be.revertedWith("no airdrop set for this user");
  });

  it("owner can rescue ERC20 tokens locked in contract", async () => {
    const {
      dai,
      users: [user1],
    } = testEnv;

    const amount = utils.parseEther("100");

    await dai
      .connect(user1.signer)
      ["mint(address,uint256)"](aidropContract.address, amount);
    expect(await dai.balanceOf(aidropContract.address)).to.be.equal(amount);

    const ownerBalanceBefore = await dai.balanceOf(user1.address);

    await aidropContract.rescueERC20(dai.address, user1.address, amount);

    expect(await dai.balanceOf(aidropContract.address)).to.be.equal(toBN(0));

    expect(await dai.balanceOf(user1.address)).to.be.equal(
      ownerBalanceBefore.add(amount)
    );
  });

  it("owner can rescue ERC721 tokens locked in contract", async () => {
    const {
      bayc,
      users: [user1],
    } = testEnv;

    await bayc.connect(user1.signer)["mint(uint256,address)"](1, user1.address);

    await bayc
      .connect(user1.signer)
      .transferFrom(user1.address, aidropContract.address, 0);

    expect(await bayc.balanceOf(aidropContract.address)).to.be.equal(toBN(1));

    const tokenId = await bayc.tokenOfOwnerByIndex(aidropContract.address, 0);

    const ownerBalanceBefore = await bayc.balanceOf(user1.address);
    await aidropContract.rescueERC721(bayc.address, user1.address, [tokenId]);
    expect(await bayc.balanceOf(aidropContract.address)).to.be.equal(toBN(0));
    expect(await bayc.balanceOf(user1.address)).to.be.equal(
      ownerBalanceBefore.add(toBN(1))
    );
  });

  it("Normal user can't rescue tokens locked in contract", async () => {
    const {
      dai,
      users: [user1, user2],
    } = testEnv;

    const amount = utils.parseEther("100");
    await dai
      .connect(user1.signer)
      ["mint(address,uint256)"](aidropContract.address, amount);
    expect(await dai.balanceOf(aidropContract.address)).to.be.equal(amount);
    await expect(
      aidropContract
        .connect(user2.signer)
        .rescueERC20(dai.address, user2.address, amount)
    ).to.be.revertedWith(OWNABLE_ONLY_OWNER);
  });
});
