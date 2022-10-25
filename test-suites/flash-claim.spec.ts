import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {DRE} from "../deploy/helpers/misc-utils";
import {
  getUserFlashClaimRegistry,
  getMockAirdropProject,
} from "../deploy/helpers/contracts-getters";
import {ProtocolErrors} from "../deploy/helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {
  approveTo,
  createNewPool,
  fund,
  mintNewPosition,
} from "../deploy/helpers/uniswapv3-helper";
import {encodeSqrtRatioX96} from "@uniswap/v3-sdk";

describe("Flash Claim Test", () => {
  const tokenId = 0;
  let testEnv: TestEnv;
  let receiverEncodedData;
  let mockAirdropERC20Token;
  let mockAirdropERC721Token;
  let mockAirdropERC1155Token;
  let erc1155Id;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    //create all factory
    const MintableERC20 = await DRE.ethers.getContractFactory("MintableERC20");
    const MintableERC721 = await DRE.ethers.getContractFactory(
      "MintableERC721"
    );
    const MintableERC1155 = await DRE.ethers.getContractFactory(
      "MintableERC1155"
    );
    const MockAirdropProject = await DRE.ethers.getContractFactory(
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
    receiverEncodedData = DRE.ethers.utils.defaultAbiCoder.encode(
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
    const AirdropFlashClaimReceiver = await DRE.ethers.getContractFactory(
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

  it("user can not flash claim with uniswapV3 [ @skip-on-coverage ]", async function () {
    const {
      users: [user1],
      pool,
      dai,
      weth,
      nftPositionManager,
    } = testEnv;

    const userDaiAmount = await convertToCurrencyDecimals(dai.address, "10000");
    const userWethAmount = await convertToCurrencyDecimals(weth.address, "10");
    await fund({token: dai, user: user1, amount: userDaiAmount});
    await fund({token: weth, user: user1, amount: userWethAmount});
    const nft = nftPositionManager.connect(user1.signer);
    await approveTo({
      target: nftPositionManager.address,
      token: dai,
      user: user1,
    });
    await approveTo({
      target: nftPositionManager.address,
      token: weth,
      user: user1,
    });
    const fee = 3000;
    const tickSpacing = fee / 50;
    const initialPrice = encodeSqrtRatioX96(1, 1000);
    const lowerPrice = encodeSqrtRatioX96(1, 10000);
    const upperPrice = encodeSqrtRatioX96(1, 100);
    await createNewPool({
      positionManager: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      initialSqrtPrice: initialPrice.toString(),
    });
    await mintNewPosition({
      nft: nft,
      token0: dai,
      token1: weth,
      fee: fee,
      user: user1,
      tickSpacing: tickSpacing,
      lowerPrice,
      upperPrice,
      token0Amount: userDaiAmount,
      token1Amount: userWethAmount,
    });

    await nft.setApprovalForAll(pool.address, true);

    await pool
      .connect(user1.signer)
      .supplyUniswapV3(
        nftPositionManager.address,
        [{tokenId: 1, useAsCollateral: true}],
        user1.address,
        0,
        {
          gasLimit: 12_450_000,
        }
      );

    const user_registry = await getUserFlashClaimRegistry();
    const flashClaimReceiverAddr = await user_registry.userReceivers(
      user1.address
    );
    await expect(
      pool
        .connect(user1.signer)
        .flashClaim(
          flashClaimReceiverAddr,
          nftPositionManager.address,
          [1],
          receiverEncodedData
        )
    ).to.be.revertedWith(ProtocolErrors.UNIV3_NOT_ALLOWED);
  });
});
