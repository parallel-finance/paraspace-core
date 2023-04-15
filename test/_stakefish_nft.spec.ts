import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther} from "ethers/lib/utils";
import {ZERO_ADDRESS} from "../helpers/constants";
import {deployMockFeePool} from "../helpers/contracts-deployments";
import {getStakefishValidator} from "../helpers/contracts-getters";
import {getCurrentTime} from "../helpers/contracts-helpers";
import {waitForTx} from "../helpers/misc-utils";
import {ProtocolErrors} from "../helpers/types";
import {MockFeePool, StakefishValidatorV1} from "../types";
import {SignerWithAddress} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {supplyAndValidate} from "./helpers/validated-steps";

describe("Stakefish NFT", () => {
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;
  let user6: SignerWithAddress;
  let validator2: StakefishValidatorV1;
  let validator3: StakefishValidatorV1;
  let validator4: StakefishValidatorV1;
  let validator5: StakefishValidatorV1;
  let feePool: MockFeePool;

  const pubkey =
    "0x877d383705a1514c38060f2de4365b9b0a05c0de9aa5813f4effd412a9fa896ed938d761c2d0fef9422bb3992a01b4b7";
  const signature =
    "0xa3aae3013474be42182ecdc8f2ff4c0082cfb2b81dfbc93e0f0210d805ece887a19a841762cd1efb65044dc810dc371618a052d18c15280bfa85b5f66dde9c81466f4a552e727dfcfd70d1012c63df07c8dba0b3891a39b6ce6c179fb454d122";
  const depositDataRoot =
    "0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6";

  const fixture = async () => {
    const testEnv = await loadFixture(testEnvFixture);

    user1 = testEnv.users[0];
    user2 = testEnv.users[1];
    user3 = testEnv.users[2];
    user4 = testEnv.users[3];
    user5 = testEnv.users[4];
    user6 = testEnv.users[5];

    // PreDeposit
    await waitForTx(
      await testEnv.sfvldr
        .connect(user1.signer)
        .mint(1, {value: parseEther("32")})
    );

    // PostDeposit
    await waitForTx(
      await testEnv.sfvldr
        .connect(user2.signer)
        .mint(1, {value: parseEther("32")})
    );
    validator2 = await getStakefishValidator(
      await testEnv.sfvldr.validatorForTokenId("2")
    );
    await waitForTx(
      await validator2
        .connect(testEnv.poolAdmin.signer)
        .makeEth2Deposit(pubkey, signature, depositDataRoot)
    );

    // Active
    await waitForTx(
      await testEnv.sfvldr
        .connect(user3.signer)
        .mint(1, {value: parseEther("32")})
    );
    validator3 = await getStakefishValidator(
      await testEnv.sfvldr.validatorForTokenId("3")
    );
    await waitForTx(
      await validator3
        .connect(testEnv.poolAdmin.signer)
        .makeEth2Deposit(pubkey, signature, depositDataRoot)
    );
    await waitForTx(
      await validator3
        .connect(testEnv.poolAdmin.signer)
        .validatorStarted(await getCurrentTime(), "1", ZERO_ADDRESS)
    );

    // Exited
    await waitForTx(
      await testEnv.sfvldr
        .connect(user4.signer)
        .mint(1, {value: parseEther("32")})
    );
    validator4 = await getStakefishValidator(
      await testEnv.sfvldr.validatorForTokenId("4")
    );
    await waitForTx(
      await validator4
        .connect(testEnv.poolAdmin.signer)
        .makeEth2Deposit(pubkey, signature, depositDataRoot)
    );
    await waitForTx(
      await validator4
        .connect(testEnv.poolAdmin.signer)
        .validatorStarted(await getCurrentTime(), "2", ZERO_ADDRESS)
    );
    await waitForTx(await validator4.connect(user4.signer).requestExit());
    await waitForTx(
      await validator4
        .connect(testEnv.poolAdmin.signer)
        .validatorExited(await getCurrentTime())
    );

    // Burnable
    await waitForTx(
      await testEnv.sfvldr
        .connect(user5.signer)
        .mint(1, {value: parseEther("32")})
    );
    validator5 = await getStakefishValidator(
      await testEnv.sfvldr.validatorForTokenId("5")
    );
    await waitForTx(await validator5.connect(user5.signer).withdraw());

    await waitForTx(
      await testEnv.sfvldr
        .connect(user1.signer)
        .setApprovalForAll(testEnv.pool.address, true)
    );
    await waitForTx(
      await testEnv.sfvldr
        .connect(user2.signer)
        .setApprovalForAll(testEnv.pool.address, true)
    );
    await waitForTx(
      await testEnv.sfvldr
        .connect(user3.signer)
        .setApprovalForAll(testEnv.pool.address, true)
    );
    await waitForTx(
      await testEnv.sfvldr
        .connect(user4.signer)
        .setApprovalForAll(testEnv.pool.address, true)
    );
    await waitForTx(
      await testEnv.sfvldr
        .connect(user5.signer)
        .setApprovalForAll(testEnv.pool.address, true)
    );

    await supplyAndValidate(testEnv.usdc, "100000", user6, true);

    feePool = await deployMockFeePool();
    await waitForTx(
      await validator3
        .connect(testEnv.poolAdmin.signer)
        .validatorFeePoolChange(feePool.address)
    );
    await waitForTx(
      await user6.signer.sendTransaction({
        to: feePool.address,
        value: parseEther("100"),
      })
    );

    return testEnv;
  };

  it("TC-stakefish-nft-01: only Active state can be supplied", async () => {
    const {sfvldr, pool} = await loadFixture(fixture);

    await expect(
      pool.connect(user1.signer).supplyERC721(
        sfvldr.address,
        [
          {
            tokenId: "1",
            useAsCollateral: true,
          },
        ],
        user1.address,
        0
      )
    ).to.be.revertedWith(ProtocolErrors.INVALID_STATE);

    await expect(
      pool.connect(user2.signer).supplyERC721(
        sfvldr.address,
        [
          {
            tokenId: "2",
            useAsCollateral: true,
          },
        ],
        user2.address,
        0
      )
    );

    await expect(
      pool.connect(user4.signer).supplyERC721(
        sfvldr.address,
        [
          {
            tokenId: "4",
            useAsCollateral: true,
          },
        ],
        user4.address,
        0
      )
    ).to.be.revertedWith(ProtocolErrors.INVALID_STATE);

    await expect(
      pool.connect(user5.signer).supplyERC721(
        sfvldr.address,
        [
          {
            tokenId: "5",
            useAsCollateral: true,
          },
        ],
        user5.address,
        0,
        {gasLimit: 5000000}
      )
    ).to.be.revertedWith(ProtocolErrors.INVALID_STATE);
  });

  it("TC-stakefish-nft-02: Rewards cannot be claimed by others", async () => {
    const {sfvldr, pool, nSfvldr} = await loadFixture(fixture);

    await waitForTx(
      await pool.connect(user3.signer).supplyERC721(
        sfvldr.address,
        [
          {
            tokenId: "3",
            useAsCollateral: true,
          },
        ],
        user3.address,
        0,
        {gasLimit: 5000000}
      )
    );

    await expect(
      nSfvldr
        .connect(user4.signer)
        .claimFeePool(["3"], ["0"], user6.address, {gasLimit: 3000000})
    ).to.be.revertedWith(ProtocolErrors.NOT_THE_OWNER);
  });

  it("TC-stakefish-nft-03: Price is 32 ether", async () => {
    const {sfvldr, paraspaceOracle} = await loadFixture(fixture);
    await expect(await paraspaceOracle.getAssetPrice(sfvldr.address)).eq(
      parseEther("32")
    );
  });

  it("TC-stakefish-nft-04: claimed fees will be supplied to pool", async () => {
    const {pWETH, pool, sfvldr, nSfvldr} = await loadFixture(fixture);

    await waitForTx(
      await pool.connect(user3.signer).supplyERC721(
        sfvldr.address,
        [
          {
            tokenId: "3",
            useAsCollateral: true,
          },
        ],
        user3.address,
        0,
        {gasLimit: 5000000}
      )
    );

    await waitForTx(
      await nSfvldr
        .connect(user3.signer)
        .claimFeePool(["3"], [parseEther("2")], user3.address, {
          gasLimit: 5000000,
        })
    );
    expect(await pWETH.balanceOf(user3.address)).eq(parseEther("2"));
  });
});
