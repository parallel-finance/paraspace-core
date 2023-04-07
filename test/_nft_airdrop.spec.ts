import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {deployParaSpaceNFT} from "../helpers/contracts-deployments";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

describe("Liquidation Auction", () => {
  let testEnv: TestEnv;
  let paraSpaceNFT;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    paraSpaceNFT = await deployParaSpaceNFT("ParaNFT", "PNFT");
    return testEnv;
  };

  describe("ERC721 auction and auction liquidation test", () => {
    beforeEach("Load the initial environment variables", async () => {
      testEnv = await loadFixture(fixture);
    });

    it("Admin can mint to multiple users", async () => {
      const {
        users: [user1],
      } = testEnv;

      const accounts = Array.from({length: 250}, () => user1.address);
      await paraSpaceNFT.mintToAccounts(accounts);

      await expect(await paraSpaceNFT.balanceOf(user1.address)).to.be.eq(250);
    });

    it("Non-admin can't mint to multiple users", async () => {
      const {
        users: [user1, user2],
      } = testEnv;

      const accounts = Array.from({length: 250}, () => user1.address);

      await expect(paraSpaceNFT.connect(user2.signer).mintToAccounts(accounts))
        .to.be.reverted;
    });

    it("Admin can set tokenURI", async () => {
      const tokenURI = "https://para.space/metadata";

      await paraSpaceNFT.setMetaDataURI(tokenURI);

      await expect(await paraSpaceNFT.tokenURI(1)).to.be.eq(tokenURI);
    });

    it("Non-admin can't set tokenURI", async () => {
      const {
        users: [user2],
      } = testEnv;
      const tokenURI = "https://para.space/metadata";

      await expect(paraSpaceNFT.connect(user2.signer).setMetaDataURI(tokenURI))
        .to.be.reverted;
    });
  });
});
