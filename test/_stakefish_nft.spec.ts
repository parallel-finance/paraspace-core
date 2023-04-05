import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {parseEther} from "ethers/lib/utils";
import {ZERO_ADDRESS} from "../helpers/constants";
import {getStakefishValidator} from "../helpers/contracts-getters";
import {
  convertToCurrencyDecimals,
  getCurrentTime,
} from "../helpers/contracts-helpers";
import {DRE, waitForTx} from "../helpers/misc-utils";
import {StakefishValidatorV1} from "../types";
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

    return testEnv;
  };

  it("TC-stakefish-nft-01: nft price is correct when nft state is PreDeposit", async () => {
    const {paraspaceOracle, sfvldr} = await loadFixture(fixture);
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "1")).eq(
      parseEther("32")
    );
  });

  it("TC-stakefish-nft-02: nft price is correct when nft state is PostDeposit", async () => {
    const {paraspaceOracle, sfvldr} = await loadFixture(fixture);
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "2")).eq(
      parseEther("32")
    );
  });

  it("TC-stakefish-nft-03: nft price is correct when nft state is Active", async () => {
    const {paraspaceOracle, sfvldr} = await loadFixture(fixture);
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "3")).eq(
      parseEther("32")
    );

    // simulate rewards
    await user6.signer.sendTransaction({
      to: validator3.address,
      value: parseEther("1"),
    });
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "3")).eq(
      parseEther("33")
    );

    // withdraw rewards
    await waitForTx(await validator3.connect(user3.signer).withdraw());
    expect(await DRE.ethers.provider.getBalance(validator3.address)).eq(0);
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "3")).eq(
      parseEther("32")
    );
  });

  it("TC-stakefish-nft-04: nft price is correct when nft state is Exited", async () => {
    const {paraspaceOracle, sfvldr} = await loadFixture(fixture);
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "4")).eq(
      parseEther("32")
    );
  });

  it("TC-stakefish-nft-05: nft price is correct when nft state is Burnable", async () => {
    const {paraspaceOracle, sfvldr} = await loadFixture(fixture);
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "5")).eq(
      parseEther("0")
    );
  });

  it("TC-stakefish-nft-07: Burnable nft cannot be supplied", async () => {
    const {paraspaceOracle, sfvldr, pool} = await loadFixture(fixture);
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "5")).eq(
      parseEther("0")
    );

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
    ).to.be.reverted;
  });

  it("TC-stakefish-nft-08: Rewards can be claimed via pool", async () => {
    const {paraspaceOracle, sfvldr, pool} = await loadFixture(fixture);

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

    // simulate rewards
    await user6.signer.sendTransaction({
      to: validator3.address,
      value: parseEther("1"),
    });
    expect(await paraspaceOracle.getTokenPrice(sfvldr.address, "3")).eq(
      parseEther("33")
    );

    const beforeBalance = await DRE.ethers.provider.getBalance(user6.address);
    await waitForTx(
      await pool
        .connect(user3.signer)
        .claimStakefishWithdrawals(sfvldr.address, ["3"], user6.address)
    );
    const afterBalance = await DRE.ethers.provider.getBalance(user6.address);

    expect(afterBalance.sub(beforeBalance)).eq(parseEther("1"));
  });

  it("TC-stakefish-nft-09: Unable to claim full withdraw if there is borrow", async () => {
    const {paraspaceOracle, sfvldr, pool, usdc} = await loadFixture(fixture);

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
      await pool
        .connect(user3.signer)
        .borrow(
          usdc.address,
          await convertToCurrencyDecimals(usdc.address, "10000"),
          0,
          user3.address,
          {gasLimit: 5000000}
        )
    );

    // simulate full withdraw
    await user6.signer.sendTransaction({
      to: validator3.address,
      value: parseEther("33"),
    });

    await expect(
      pool
        .connect(user3.signer)
        .claimStakefishWithdrawals(sfvldr.address, ["3"], user6.address)
    ).to.be.reverted;
  });

  it("TC-stakefish-nft-10: not owner error will be thrown if someone tries to claimWithdrawals of others", async () => {
    const {sfvldr, pool} = await loadFixture(fixture);

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

    // simulate rewards
    await user6.signer.sendTransaction({
      to: validator3.address,
      value: parseEther("1"),
    });

    await expect(
      pool
        .connect(user4.signer)
        .claimStakefishWithdrawals(sfvldr.address, ["3"], user6.address)
    ).to.be.reverted;
  });

  it("TC-stakefish-nft-11: nft owner can requestExit via nToken", async () => {
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

    await waitForTx(await nSfvldr.connect(user3.signer).requestExit(["3"]));

    expect((await validator3.lastStateChange()).state).eq(3);
  });
});
