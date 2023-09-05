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
      "0x19293FBec52F94165f903708a74513Dd6dFedd0a"
    );

    expect(await ParaX.tokenURI(0)).to.be.eq("https://ipfs.io/ipfs/QmcuVLoBB6QZipC1EpPciuKodyCXRVgh3YbYh9jzVarMzY");
  });

  it("ParaX operation test: 10", async () => {
    await loadFixture(testEnvFixture);
    await mintForUser(10);
  });

  it("ParaX operation test: 25", async () => {
    await loadFixture(testEnvFixture);
    await mintForUser(25);
  });

  it("ParaX operation test: 50", async () => {
    await loadFixture(testEnvFixture);
    await mintForUser(50);
  });

  it("ParaX operation test: 75", async () => {
    await loadFixture(testEnvFixture);
    await mintForUser(75);
  });

  it("ParaX operation test: 100", async () => {
    await loadFixture(testEnvFixture);
    await mintForUser(100);
  });

  it("ParaX operation test: 200", async () => {
    await loadFixture(testEnvFixture);
    await mintForUser(200);
  });
});

const mintForUser = async (mintNum: number) => {
  const ParaX = await deployPapaX(false);

  const addressPrex = "0x0000000000000000000000000000000000000000";
  const addressArr: Array<string> = [];
  for (let i=1; i<=mintNum; i++) {
    const strLength = String(i).length;
    const address = addressPrex.slice(0, 0-strLength) + String(i);
    addressArr.push(address);
  }

  const txReceipt = await waitForTx(await ParaX.mint(addressArr));
  console.log("------------txReceipt.gasUsed:", txReceipt.gasUsed);
}
