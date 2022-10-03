import {expect} from "chai";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";

import {makeSuite, TestEnv} from "./helpers/make-suite";
import {ethers} from "hardhat";
import {toBN} from "../deploy/helpers/seaport-helpers/encoding";
import {ProtocolErrors} from "../deploy/helpers/types";

makeSuite("Pool: rescue tokens", (testEnv: TestEnv) => {
  let snap: string;

  const {CALLER_NOT_POOL_ADMIN} = ProtocolErrors;

  beforeEach(async () => {
    snap = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snap);
  });

  it("PoolAdmin can rescue ERC20 tokens locked in pool contract", async () => {
    const {
      dai,
      poolAdmin,
      pool,
      users: [user1],
    } = testEnv;
    const amount = ethers.utils.parseEther("100");
    await dai
      .connect(user1.signer)
      ["mint(address,uint256)"](pool.address, amount);
    expect(await dai.balanceOf(pool.address)).to.be.equal(amount);
    const poolAdminBalanceBefore = await dai.balanceOf(poolAdmin.address);
    await pool
      .connect(poolAdmin.signer)
      .rescueTokens(0, dai.address, poolAdmin.address, amount);
    expect(await dai.balanceOf(pool.address)).to.be.equal(toBN(0));
    expect(await dai.balanceOf(poolAdmin.address)).to.be.equal(
      poolAdminBalanceBefore.add(amount)
    );
  });

  it("PoolAdmin can rescue ERC721 tokens locked in pool contract", async () => {
    const {
      bayc,
      poolAdmin,
      pool,
      users: [user1],
    } = testEnv;

    await bayc.connect(user1.signer)["mint(uint256,address)"](1, pool.address);
    expect(await bayc.balanceOf(pool.address)).to.be.equal(toBN(1));
    const tokenId = await bayc.tokenOfOwnerByIndex(pool.address, 0);
    const poolAdminBalanceBefore = await bayc.balanceOf(poolAdmin.address);
    await pool
      .connect(poolAdmin.signer)
      .rescueTokens(1, bayc.address, poolAdmin.address, tokenId);
    expect(await bayc.balanceOf(pool.address)).to.be.equal(toBN(0));
    expect(await bayc.balanceOf(poolAdmin.address)).to.be.equal(
      poolAdminBalanceBefore.add(toBN(1))
    );
  });

  it("normal user can't rescue tokens locked in pool contract", async () => {
    const {
      dai,
      poolAdmin,
      pool,
      users: [user1],
    } = testEnv;

    const amount = ethers.utils.parseEther("100");
    await dai
      .connect(user1.signer)
      ["mint(address,uint256)"](pool.address, amount);
    expect(await dai.balanceOf(pool.address)).to.be.equal(amount);
    await expect(
      pool
        .connect(user1.signer)
        .rescueTokens(0, dai.address, poolAdmin.address, amount)
    ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
  });
});
