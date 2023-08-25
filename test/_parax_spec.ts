import {testEnvFixture} from "./helpers/setup-env";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {deployPapaX} from "../helpers/contracts-deployments";
import {expect} from "chai";
import {waitForTx} from "../helpers/misc-utils";
import {getProxyAdmin} from "../helpers/contracts-helpers";

describe("ParaX Test", () => {
  it("ParaX operation test", async () => {
    const testEnv = await loadFixture(testEnvFixture);
    const {
      users: [user1, user2],
    } = testEnv;

    const ParaX = await deployPapaX(false);

    await expect(
      ParaX.connect(user1.signer).mint([user1.address, user2.address])
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await waitForTx(await ParaX.mint([user1.address, user2.address]));

    expect(await ParaX.ownerOf(0)).to.be.eq(user1.address);
    expect(await ParaX.ownerOf(1)).to.be.eq(user2.address);
    expect(await ParaX.totalSupply()).to.be.eq(2);

    await waitForTx(await ParaX.transferOwnership(user1.address));
    await waitForTx(
      await ParaX.connect(user1.signer).mint([user1.address, user2.address])
    );
    expect(await ParaX.ownerOf(2)).to.be.eq(user1.address);
    expect(await ParaX.ownerOf(3)).to.be.eq(user2.address);
    expect(await ParaX.totalSupply()).to.be.eq(4);

    expect(await getProxyAdmin(ParaX.address)).to.be.eq(
      "0x17816E9A858b161c3E37016D139cf618056CaCD4"
    );
  });
});
