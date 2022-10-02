import {expect} from "chai";
import {advanceTimeAndBlock, waitForTx} from "../deploy/helpers/misc-utils";
import {MAX_UINT_AMOUNT, ONE_YEAR} from "../deploy/helpers/constants";
import {
  buildPermitParams,
  convertToCurrencyDecimals,
  getSignatureFromTypedData,
} from "../deploy/helpers/contracts-helpers";
import {RateMode} from "../deploy/helpers/types";
import {makeSuite} from "./helpers/make-suite";
import {ethers, network} from "hardhat";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {HARDHAT_CHAINID} from "../deploy/helpers/hardhat-constants";
// import { constants, utils } from "ethers";
import {getTestWallets} from "./helpers/utils/wallets";
import {VariableDebtToken__factory} from "../types";
import {utils} from "ethers";

declare let hre: HardhatRuntimeEnvironment;

makeSuite("WETH GateWay", (testEnv) => {
  let testWallets;
  let firstDaiDeposit;
  let secondDaiDeposit;
  let thirdDaiDeposit;

  const EIP712_REVISION = "1";

  before("Initialize Depositors", async () => {
    const {dai} = testEnv;
    firstDaiDeposit = await convertToCurrencyDecimals(dai.address, "10000");
    secondDaiDeposit = await convertToCurrencyDecimals(dai.address, "20000");
    thirdDaiDeposit = await convertToCurrencyDecimals(dai.address, "50000");

    testWallets = getTestWallets();
  });

  it("User 1 deposits 100 ETH", async () => {
    const {
      users: [user1],
      pool,
      wETHGatewayProxy,
    } = testEnv;

    // User 1 deposits 1 ETH
    const ethValue = {
      value: ethers.utils.parseEther("100.0"),
    };

    await waitForTx(
      await wETHGatewayProxy
        .connect(user1.signer)
        .depositETH(pool.address, user1.address, 0, ethValue)
    );
  });

  it("User 2 deposits 10k DAI and User 1 borrows 8K DAI", async () => {
    const {
      dai,
      variableDebtDai,
      users: [user1, user2],
      pool,
      helpersContract,
    } = testEnv;

    await waitForTx(
      await dai
        .connect(user2.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user2 wallet
    await waitForTx(
      await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 2 - Deposit dai
    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(dai.address, firstDaiDeposit, user2.address, "0")
    );

    // const debtBalanceBefore = await variableDebtDai.balanceOf(user1.address);

    // User 1 - Borrow dai
    const borrowAmount = await convertToCurrencyDecimals(dai.address, "8000");

    await waitForTx(
      await pool
        .connect(user1.signer)
        .borrow(
          dai.address,
          borrowAmount,
          RateMode.Variable,
          "0",
          user1.address
        )
    );

    await variableDebtDai.balanceOf(user1.address);

    await helpersContract.getUserReserveData(dai.address, user1.address);
  });

  it("User 1 tries to withdraw the deposited WETH without paying the accrued interest (should fail)", async () => {
    const {
      users: [user1],
      pool,
      weth,
    } = testEnv;

    const amountETHtoWithdraw = await convertToCurrencyDecimals(
      weth.address,
      "100"
    );

    expect(
      pool
        .connect(user1.signer)
        .withdraw(weth.address, amountETHtoWithdraw, user1.address)
    ).to.be.reverted;
  });

  it("User 1 tries to withdraw the deposited WETH from collateral without paying the accrued interest (should fail)", async () => {
    const {
      users: [user1],
      pool,
      weth,
    } = testEnv;

    expect(
      pool
        .connect(user1.signer)
        .setUserUseReserveAsCollateral(weth.address, false)
    ).to.be.reverted;
  });

  it("User 1 adds 20K dai as collateral and then removes their WETH from collateral without paying the accrued interest", async () => {
    const {
      dai,
      users: [user1],
      pool,
      weth,
    } = testEnv;

    // User 1 - Mints 20k dai
    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "20000"))
    );

    // User 1 - approves dai for pool
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 1 - Deposit dai
    await waitForTx(
      await pool
        .connect(user1.signer)
        .supply(dai.address, secondDaiDeposit, user1.address, "0")
    );

    // User 1 - marks dai as collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseReserveAsCollateral(dai.address, true)
    );

    // User 1 - marks weth as not collateral
    await waitForTx(
      await pool
        .connect(user1.signer)
        .setUserUseReserveAsCollateral(weth.address, false)
    );
  });

  it("User 1 tries to remove the deposited dai from collateral without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [user1],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user1.signer)
        .setUserUseReserveAsCollateral(dai.address, false)
    ).to.be.reverted;
  });

  it("User 1 pays the accrued interest and withdraw the deposited WETH and withdraw deposited DAI", async () => {
    const {
      dai,
      users: [user1],
      pool,
      wETHGatewayProxy,
      pWETH,
      weth,
    } = testEnv;
    await waitForTx(
      await dai
        .connect(user1.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user1 wallet
    await waitForTx(
      await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // repay dai loan
    const repayTx = await pool
      .connect(user1.signer)
      .repay(
        dai.address,
        MAX_UINT_AMOUNT,
        RateMode.Variable,
        user1.address,
        false
      );
    await repayTx.wait();

    // withdraw WETH
    await waitForTx(
      await pWETH
        .connect(user1.signer)
        .approve(wETHGatewayProxy.address, MAX_UINT_AMOUNT)
    );

    // let punkBalance = await punk.balanceOf(user1.address);
    // expect(punkBalance).to.be.equal(0);

    const amountETHtoWithdraw = await convertToCurrencyDecimals(
      weth.address,
      "100"
    );

    await waitForTx(
      await wETHGatewayProxy
        .connect(user1.signer)
        .withdrawETH(pool.address, amountETHtoWithdraw, user1.address)
    );

    // punkBalance = await punk.balanceOf(user1.address);
    // expect(punkBalance).to.be.equal(1);

    // withdrawing DAI
    await pool
      .connect(user1.signer)
      .withdraw(dai.address, secondDaiDeposit, user1.address);
  });

  it("User 1 deposits WETH, signs signature and withdraws with permit", async () => {
    const {pool, wETHGatewayProxy, deployer, pWETH} = testEnv;

    // User 1 deposits 1 ETH
    const ethValue = {
      value: ethers.utils.parseEther("100.0"),
    };

    await waitForTx(
      await wETHGatewayProxy
        .connect(deployer.signer)
        .depositETH(pool.address, deployer.address, 0, ethValue)
    );

    // signs signature
    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await pWETH.nonces(deployer.address)).toNumber();
    const permitAmount = "100";
    const msgParams = buildPermitParams(
      chainId,
      pWETH.address,
      EIP712_REVISION,
      await pWETH.name(),
      deployer.address,
      wETHGatewayProxy.address,
      nonce,
      deadline,
      permitAmount
    );

    const ownerPrivateKey = testWallets[0].secretKey;

    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // withdraws with permit
    await waitForTx(
      await wETHGatewayProxy
        .connect(deployer.signer)
        .withdrawETHWithPermit(
          pool.address,
          100,
          deployer.address,
          deadline,
          v,
          r,
          s
        )
    );
  });

  it("getWETH address returns correct address", async () => {
    const {
      users: [user1],
      weth,
      wETHGatewayProxy,
    } = testEnv;

    const wETHAddress = await wETHGatewayProxy
      .connect(user1.signer)
      .getWETHAddress();

    expect(wETHAddress).to.be.equal(weth.address);
  });

  it("User 1 deposits 100 ETH and User 2 deposits 50k DAI", async () => {
    const {
      dai,
      users: [user1, user2],
      pool,
      wETHGatewayProxy,
    } = testEnv;

    // User 1 deposits 100 ETH
    const ethValue = {
      value: ethers.utils.parseEther("100.0"),
    };

    await waitForTx(
      await wETHGatewayProxy
        .connect(user1.signer)
        .depositETH(pool.address, user1.address, 0, ethValue)
    );

    // User 2 - Deposit dai
    await waitForTx(
      await dai
        .connect(user2.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "50000"))
    );

    // approve protocol to access user2 wallet
    await waitForTx(
      await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool
        .connect(user2.signer)
        .supply(dai.address, thirdDaiDeposit, user2.address, "0")
    );

    // User 2 - marks dai as collateral
    await waitForTx(
      await pool
        .connect(user2.signer)
        .setUserUseReserveAsCollateral(dai.address, true)
    );
  });

  it("User 2 borrows 1 ETH", async () => {
    const {
      users: [, user2],
      pool,
      wETHGatewayProxy,
      weth,
    } = testEnv;

    const amountETH = await convertToCurrencyDecimals(weth.address, "1");

    const wethData = await pool.getReserveData(weth.address);
    const variableDebtToken = VariableDebtToken__factory.connect(
      wethData.variableDebtTokenAddress,
      user2.signer
    );

    // User 2 approves gateway to borrow 1 wETH
    expect(
      await variableDebtToken
        .connect(user2.signer)
        .approveDelegation(wETHGatewayProxy.address, utils.parseUnits("1", 18))
    );

    // User 2 - borrows 1 eth
    // https://docs.paraspace.com/developers/periphery-contracts/wethgateway#borroweth
    await waitForTx(
      await wETHGatewayProxy
        .connect(user2.signer)
        .borrowETH(pool.address, amountETH, 2, 0)
    );
  });

  it("User 2 repays 1 ETH", async () => {
    const {
      users: [, user2],
      pool,
      wETHGatewayProxy,
      weth,
    } = testEnv;

    // Increase time so interests accrue
    await advanceTimeAndBlock(parseInt(ONE_YEAR));

    const ethValue = {
      value: ethers.utils.parseEther("1.2"),
    };

    const amountETHInterest = await convertToCurrencyDecimals(
      weth.address,
      "1.2"
    );

    // User 2 - repays 1 eth
    await waitForTx(
      await wETHGatewayProxy
        .connect(user2.signer)
        .repayETH(pool.address, amountETHInterest, 2, user2.address, ethValue)
    );
  });

  it("User 1 deposits 100 ETH", async () => {
    const {
      users: [user1],
      pool,
      wETHGatewayProxy,
    } = testEnv;

    // User 1 deposits 1 ETH
    const ethValue = {
      value: ethers.utils.parseEther("100.0"),
    };

    await waitForTx(
      await wETHGatewayProxy
        .connect(user1.signer)
        .depositETH(pool.address, user1.address, 0, ethValue)
    );
  });

  it("Owner does emergency token transfer 50 WETH to User 1", async () => {
    const {
      users: [user1],
      wETHGatewayProxy,
      weth,
      deployer,
    } = testEnv;
    const owner = deployer;

    const amountETHtoWithdraw = await convertToCurrencyDecimals(
      weth.address,
      "50"
    );

    const wethGatewayBalance = await weth.balanceOf(wETHGatewayProxy.address);
    await waitForTx(
      await weth
        .connect(user1.signer)
        ["mint(address,uint256)"](wETHGatewayProxy.address, amountETHtoWithdraw)
    );

    await waitForTx(
      await wETHGatewayProxy
        .connect(owner.signer)
        .emergencyTokenTransfer(
          weth.address,
          user1.address,
          amountETHtoWithdraw
        )
    );
  });

  it("Owner does emergency ether transfer 50 ETH to User 1", async () => {
    const {
      users: [user1],
      wETHGatewayProxy,
      weth,
      deployer,
    } = testEnv;
    const owner = deployer;

    const amountETHtoWithdraw = await convertToCurrencyDecimals(
      weth.address,
      "50"
    );

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [weth.address],
    });
    const wethSigner = await ethers.provider.getSigner(weth.address);

    // user3 send eth to weth contract
    const [, , user3] = await ethers.getSigners();
    await user3.sendTransaction({
      to: weth.address,
      value: ethers.utils.parseEther("50.0"), // Sends exactly 50.0 ether
    });

    // weth contract send ether to gateway
    await wethSigner.sendTransaction({
      to: wETHGatewayProxy.address,
      value: ethers.utils.parseEther("50.0"), // Sends exactly 50.0 ether
    });

    await waitForTx(
      await wETHGatewayProxy
        .connect(owner.signer)
        .emergencyEtherTransfer(user1.address, amountETHtoWithdraw)
    );
  });
});
