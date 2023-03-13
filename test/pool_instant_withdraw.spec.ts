import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {parseEther} from "ethers/lib/utils";
import {LoanVault, MockedETHWithdrawNFT} from "../types";
import {deployMockedETHWithdrawNFT} from "../helpers/contracts-deployments";
import {getLoanVault} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {ProtocolErrors} from "../helpers/types";

describe("Pool Instant Withdraw Test", () => {
  let testEnv: TestEnv;
  let instantWithdrawNFT: MockedETHWithdrawNFT;
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

    instantWithdrawNFT = await deployMockedETHWithdrawNFT();
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

  it("active term loan can be swapped by other user", async () => {
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

  it("active term loan can be settled", async () => {
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

  it("cannot create term loan when borrow asset usage ratio too high", async () => {
    const {
      users: [user1, user2],
      weth,
      pool,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool
        .connect(user1.signer)
        .withdraw(weth.address, parseEther("98.8"), user1.address)
    );

    await expect(
      pool
        .connect(user2.signer)
        .createLoan(
          instantWithdrawNFT.address,
          tokenID,
          tokenAmount,
          weth.address,
          0
        )
    ).to.be.revertedWith(ProtocolErrors.USAGE_RATIO_TOO_HIGH);
  });

  it("settled term loan can not be swapped", async () => {
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

    await advanceTimeAndBlock(parseInt("86400"));

    await waitForTx(await pool.connect(user3.signer).settleTermLoan(0));

    await expect(
      pool.connect(user3.signer).swapLoanCollateral(0, user3.address)
    ).to.be.revertedWith(ProtocolErrors.INVALID_LOAN_STATE);
  });

  it("swapped term loan can not be settled", async () => {
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

    await waitForTx(
      await pool.connect(user3.signer).swapLoanCollateral(0, user3.address)
    );

    await expect(
      pool.connect(user3.signer).settleTermLoan(0)
    ).to.be.revertedWith(ProtocolErrors.INVALID_LOAN_STATE);
  });

  it("can not create loan with unsupported borrow asset", async () => {
    const {
      users: [, user2],
      usdt,
      pool,
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user2.signer)
        .createLoan(
          instantWithdrawNFT.address,
          tokenID,
          tokenAmount,
          usdt.address,
          0
        )
    ).to.be.revertedWith(ProtocolErrors.INVALID_BORROW_ASSET);
  });

  it("only admin or asset listing can add or remove support borrow asset", async () => {
    const {
      users: [, user2],
      usdt,
      pool,
      poolAdmin,
    } = await loadFixture(fixture);

    await expect(
      pool
        .connect(user2.signer)
        .addBorrowableAssets(instantWithdrawNFT.address, [usdt.address])
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN);

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .addBorrowableAssets(instantWithdrawNFT.address, [usdt.address])
    );

    let supportedBorrowAsset = await pool.getBorrowableAssets(
      instantWithdrawNFT.address
    );
    expect(supportedBorrowAsset.length).to.be.eq(2);
    expect(supportedBorrowAsset[1]).to.be.eq(usdt.address);

    await expect(
      pool
        .connect(user2.signer)
        .removeBorrowableAssets(instantWithdrawNFT.address, [usdt.address])
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN);

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .removeBorrowableAssets(instantWithdrawNFT.address, [usdt.address])
    );
    supportedBorrowAsset = await pool.getBorrowableAssets(
      instantWithdrawNFT.address
    );
    expect(supportedBorrowAsset.length).to.be.eq(1);
  });

  it("only admin or asset listing can set loan creation fee rate", async () => {
    const {
      users: [, user2],
      pool,
      poolAdmin,
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user2.signer).setLoanCreationFeeRate(300)
    ).to.be.revertedWith(ProtocolErrors.CALLER_NOT_ASSET_LISTING_OR_POOL_ADMIN);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setLoanCreationFeeRate(300)
    );

    expect(await pool.getLoanCreationFeeRate()).to.be.eq(300);
  });

  it("user will borrow less if set loan creation fee rate", async () => {
    const {
      users: [, user2],
      weth,
      pool,
      poolAdmin,
    } = await loadFixture(fixture);

    await waitForTx(
      await pool.connect(poolAdmin.signer).setLoanCreationFeeRate(1000)
    );

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

    expect(await weth.balanceOf(user2.address)).to.be.lt(parseEther("1"));
  });
});
