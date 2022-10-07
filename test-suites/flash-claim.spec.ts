import {expect} from "chai";
import {ethers} from "hardhat";
import {makeSuite} from "./helpers/make-suite";
import {
  getUserFlashClaimRegistry,
  getMockAirdropProject,
} from "../deploy/helpers/contracts-getters";
import {ProtocolErrors} from "../deploy/helpers/types";

makeSuite("Flash Claim Test", (testEnv) => {
  const tokenId = 0;
  let receiverEncodedData;
  let mockAirdropERC20Token;
  let mockAirdropERC721Token;
  let mockAirdropERC1155Token;
  let erc1155Id;

  before(async () => {
    //create all factory
    const MintableERC20 = await ethers.getContractFactory("MintableERC20");
    const MintableERC721 = await ethers.getContractFactory("MintableERC721");
    const MintableERC1155 = await ethers.getContractFactory("MintableERC1155");
    const MockAirdropProject = await ethers.getContractFactory(
      "MockAirdropProject"
    );

    const airdrop_project = await getMockAirdropProject();
    const mockAirdropERC20Address = await airdrop_project.erc20Token();
    mockAirdropERC20Token = await MintableERC20.attach(mockAirdropERC20Address);
    const mockAirdropERC721Address = await airdrop_project.erc721Token();
    mockAirdropERC721Token = await MintableERC721.attach(
      mockAirdropERC721Address
    );
    const mockAirdropERC1155Address = await airdrop_project.erc1155Token();
    mockAirdropERC1155Token = await MintableERC1155.attach(
      mockAirdropERC1155Address
    );
    erc1155Id = (await airdrop_project.getERC1155TokenId(tokenId)).toString();

    const applyAirdropEncodedData =
      MockAirdropProject.interface.encodeFunctionData("claimAirdrop", [
        tokenId,
      ]);
    receiverEncodedData = ethers.utils.defaultAbiCoder.encode(
      ["uint256[]", "address[]", "uint256[]", "address", "bytes"],
      [
        [1, 2, 3],
        [
          mockAirdropERC20Address,
          mockAirdropERC721Address,
          mockAirdropERC1155Address,
        ],
        [0, 0, erc1155Id],
        airdrop_project.address,
        applyAirdropEncodedData,
      ]
    );
  });

  it("user register receiver", async function () {
    const {
      users: [user1],
    } = testEnv;

    const user_registry = await getUserFlashClaimRegistry();
    await user_registry.connect(user1.signer).createReceiver();
    const flashClaimReceiverAddr = await user_registry.userReceivers(
      user1.address
    );
    const AirdropFlashClaimReceiver = await ethers.getContractFactory(
      "AirdropFlashClaimReceiver"
    );
    const flashClaimReceiver = AirdropFlashClaimReceiver.attach(
      flashClaimReceiverAddr
    );
    expect(await flashClaimReceiver.owner()).to.be.equal(user1.address);
  });

  it("User cannot flash claim an airdrop if the asset is not supplied into the pool", async function () {
    const {
      users: [user1],
      bayc,
      pool,
    } = testEnv;

    // mint bayc
    await bayc.connect(user1.signer)["mint(address)"](user1.address);
    expect(await bayc.ownerOf(tokenId)).to.equal(user1.address);

    const user_registry = await getUserFlashClaimRegistry();
    await user_registry.connect(user1.signer).createReceiver();
    const flashClaimReceiverAddr = await user_registry.userReceivers(
      user1.address
    );

    expect(
      pool
        .connect(user1.signer)
        .flashClaim(
          flashClaimReceiverAddr,
          bayc.address,
          [tokenId],
          receiverEncodedData
        )
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);
  });

  it("supply bayc and mint ntoken", async function () {
    const {
      bayc,
      nBAYC,
      users: [user1],
      pool,
    } = testEnv;

    // supply bayc and mint ntoken
    await bayc.connect(user1.signer).setApprovalForAll(pool.address, true);
    await pool
      .connect(user1.signer)
      .supplyERC721(
        bayc.address,
        [{tokenId: tokenId, useAsCollateral: true}],
        user1.address,
        0
      );
    expect(await nBAYC.ownerOf(tokenId)).to.equal(user1.address);
  });

  it("someone else can not flash claim airdrop", async function () {
    const {
      bayc,
      users: [, user2],
      pool,
    } = testEnv;

    const user_registry = await getUserFlashClaimRegistry();
    await user_registry.connect(user2.signer).createReceiver();
    const flashClaimReceiverAddr = await user_registry.userReceivers(
      user2.address
    );

    await expect(
      pool
        .connect(user2.signer)
        .flashClaim(
          flashClaimReceiverAddr,
          bayc.address,
          [tokenId],
          receiverEncodedData
        )
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);
  });

  it("owner can flash claim airdrop", async function () {
    const {
      bayc,
      users: [user1],
      pool,
    } = testEnv;

    const user_registry = await getUserFlashClaimRegistry();
    const flashClaimReceiverAddr = await user_registry.userReceivers(
      user1.address
    );
    await pool
      .connect(user1.signer)
      .flashClaim(
        flashClaimReceiverAddr,
        bayc.address,
        [tokenId],
        receiverEncodedData
      );

    const airdrop_project = await getMockAirdropProject();
    expect(await mockAirdropERC20Token.balanceOf(user1.address)).to.be.equal(
      await airdrop_project.erc20Bonus()
    );
    expect(await mockAirdropERC721Token.balanceOf(user1.address)).to.be.equal(
      await airdrop_project.erc721Bonus()
    );
    expect(
      await mockAirdropERC1155Token.balanceOf(user1.address, erc1155Id)
    ).to.be.equal(await airdrop_project.erc1155Bonus());
  });
});
