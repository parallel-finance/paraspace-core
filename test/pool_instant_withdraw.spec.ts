import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {parseEther} from "ethers/lib/utils";
import {LoanVault, MockedInstantWithdrawNFT} from "../types";
import {deployMockedInstantWithdrawNFT} from "../helpers/contracts-deployments";
import {getLoanVault} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";

describe("Pool Instant Withdraw Test", () => {
  let testEnv: TestEnv;
  let instantWithdrawNFT: MockedInstantWithdrawNFT;
  let loanVault: LoanVault;
  const tokenID = 1;
  const tokenAmount = 10000;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      poolAdmin,
      pool,
      weth,
      users: [user1, user2, user3],
    } = testEnv;

    instantWithdrawNFT = await deployMockedInstantWithdrawNFT();
    loanVault = await getLoanVault();

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .addBorrowableAssets(instantWithdrawNFT.address, [weth.address])
    );

    await supplyAndValidate(weth, "100", user1, true);

    await waitForTx(
      await instantWithdrawNFT.connect(user2.signer).mint(tokenID, tokenAmount)
    );
    await waitForTx(
      await instantWithdrawNFT
        .connect(user2.signer)
        .setApprovalForAll(pool.address, true)
    );

    await mintAndValidate(weth, "100", user3);
    await waitForTx(
      await weth.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await user1.signer.sendTransaction({
      to: loanVault.address,
      value: parseEther("10"),
    });

    return testEnv;
  };

  it("term loan can be bought by other user", async () => {
    const {
      users: [, user2, user3],
      weth,
      pool,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .createLoan(
          instantWithdrawNFT.address,
          tokenID,
          tokenAmount,
          weth.address,
          0
        )
    );

    expect(await weth.balanceOf(user2.address)).to.be.gte(parseEther("1"));
    expect(
      await instantWithdrawNFT.balanceOf(loanVault.address, tokenID)
    ).to.be.eq(tokenAmount);

    await waitForTx(
      await pool.connect(user3.signer).swapLoanCollateral(0, user3.address)
    );

    expect(await instantWithdrawNFT.balanceOf(user3.address, tokenID)).to.be.eq(
      tokenAmount
    );
  });

  it("term loan can be settled", async () => {
    const {
      users: [, user2, user3],
      weth,
      pool,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user2.signer)
        .createLoan(
          instantWithdrawNFT.address,
          tokenID,
          tokenAmount,
          weth.address,
          0
        )
    );

    expect(await weth.balanceOf(user2.address)).to.be.gte(parseEther("1"));
    expect(
      await instantWithdrawNFT.balanceOf(loanVault.address, tokenID)
    ).to.be.eq(tokenAmount);

    await advanceTimeAndBlock(parseInt("86400"));

    await waitForTx(await pool.connect(user3.signer).settleTermLoan(0));

    expect(
      await instantWithdrawNFT.balanceOf(loanVault.address, tokenID)
    ).to.be.eq(0);
  });
});
