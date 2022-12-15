import {expect} from "chai";
import {waitForTx} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {
  buildPermitParams,
  convertToCurrencyDecimals,
  getSignatureFromTypedData,
  impersonateAddress,
} from "../helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {HARDHAT_CHAINID} from "../helpers/hardhat-constants";
import {DRE} from "../helpers/misc-utils";
import {getTestWallets} from "./helpers/utils/wallets";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  assertAlmostEqual,
  isAssetInCollateral,
} from "./helpers/validated-steps";

declare let hre: HardhatRuntimeEnvironment;

describe("WETH GateWay", () => {
  let testWallets;
  let testEnv: TestEnv;

  const EIP712_REVISION = "1";

  before("Initialize Depositors", async () => {
    testEnv = await loadFixture(testEnvFixture);
    testWallets = getTestWallets();
  });

  it("TC-weth-gateway-01 User deposits 100 ETH via gateway", async () => {
    const {
      users: [user1],
      pWETH,
      wETHGateway,
      weth,
    } = testEnv;

    const user1EthBalanceBefore = await user1.signer.getBalance();

    // User 1 deposits 100 ETH
    const ethAmount = DRE.ethers.utils.parseEther("100.0");
    const ethValue = {
      value: ethAmount,
    };

    await waitForTx(
      await wETHGateway
        .connect(user1.signer)
        .depositETH(user1.address, 0, ethValue)
    );

    const user1EthBalanceAfter = await user1.signer.getBalance();

    expect(user1EthBalanceAfter).to.be.closeTo(
      user1EthBalanceBefore.sub(ethAmount),
      DRE.ethers.utils.parseEther("0.01")
    ); // pays gas in ETH
    expect(await pWETH.balanceOf(user1.address)).to.eq(ethAmount);
    expect(await pWETH.balanceOf(user1.address)).to.eq(ethAmount);
    expect(await pWETH.balanceOf(user1.address)).to.eq(ethAmount);
    expect(await isAssetInCollateral(user1, weth.address));
  });

  it("TC-weth-gateway-02 User withdraws the deposited WETH", async () => {
    const {
      users: [user1],
      wETHGateway,
      pWETH,
      weth,
    } = testEnv;

    const user1EthBalanceBefore = await user1.signer.getBalance();

    await waitForTx(
      await pWETH
        .connect(user1.signer)
        .approve(wETHGateway.address, MAX_UINT_AMOUNT)
    );

    const amountETHtoWithdraw = await convertToCurrencyDecimals(
      weth.address,
      "100"
    );

    // withdraw ETH
    await waitForTx(
      await wETHGateway
        .connect(user1.signer)
        .withdrawETH(amountETHtoWithdraw, user1.address)
    );

    const user1EthBalanceAfter = await user1.signer.getBalance();

    expect(user1EthBalanceAfter).to.be.closeTo(
      user1EthBalanceBefore.add(amountETHtoWithdraw),
      DRE.ethers.utils.parseEther("0.01")
    ); // pays gas in ETH
    expect(await weth.balanceOf(user1.address)).to.eq(0);
    expect(await pWETH.balanceOf(user1.address)).to.eq(0);
  });

  it("TC-weth-gateway-03 User 1 deposits ETH, signs signature and withdraws with permit", async () => {
    const {
      users: [user1],
      weth,
      wETHGateway,
      deployer,
      pWETH,
    } = testEnv;

    // User 1 deposits 1 ETH
    const ethValue = {
      value: DRE.ethers.utils.parseEther("100.0"),
    };

    await waitForTx(
      await wETHGateway
        .connect(deployer.signer)
        .depositETH(deployer.address, 0, ethValue)
    );

    // signs signature
    const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
    const deadline = MAX_UINT_AMOUNT;
    const nonce = (await pWETH.nonces(deployer.address)).toNumber();
    const permitAmount = await convertToCurrencyDecimals(weth.address, "100");
    const msgParams = buildPermitParams(
      chainId,
      pWETH.address,
      EIP712_REVISION,
      await pWETH.name(),
      deployer.address,
      wETHGateway.address,
      nonce,
      deadline,
      permitAmount.toString()
    );

    const userEthBalanceBefore = await user1.signer.getBalance();

    const ownerPrivateKey = testWallets[0].privateKey;
    const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // withdraws with permit
    await waitForTx(
      await wETHGateway
        .connect(deployer.signer)
        .withdrawETHWithPermit(permitAmount, user1.address, deadline, v, r, s)
    );

    const userEthBalanceAfter = await user1.signer.getBalance();

    expect(userEthBalanceAfter).to.be.eq(
      userEthBalanceBefore.add(permitAmount)
    );
    expect(await weth.balanceOf(deployer.address)).to.eq(0);
    expect(await pWETH.balanceOf(deployer.address)).to.eq(0);
  });

  it("TC-weth-gateway-04 getWETH address returns correct address", async () => {
    const {
      users: [user1],
      weth,
      wETHGateway,
    } = testEnv;

    const wETHAddress = await wETHGateway
      .connect(user1.signer)
      .getWETHAddress();

    expect(wETHAddress).to.be.equal(weth.address);
  });

  it("TC-weth-gateway-05 Owner does emergency token transfer 50 WETH to User 1", async () => {
    const {
      users: [user1],
      gatewayAdmin,
      wETHGateway,
      weth,
    } = testEnv;
    const owner = gatewayAdmin;

    // User 1 deposits 1 ETH
    const ethValue = {
      value: DRE.ethers.utils.parseEther("100.0"),
    };

    await waitForTx(
      await wETHGateway
        .connect(user1.signer)
        .depositETH(user1.address, 0, ethValue)
    );

    const userBalanceBefore = await weth.balanceOf(user1.address);
    const amountWETHtoTransfer = await convertToCurrencyDecimals(
      weth.address,
      "50"
    );

    await waitForTx(
      await weth
        .connect(user1.signer)
        ["mint(address,uint256)"](wETHGateway.address, amountWETHtoTransfer)
    );
    const gatewayBalanceBefore = await weth.balanceOf(wETHGateway.address);

    await waitForTx(
      await wETHGateway
        .connect(owner.signer)
        .emergencyTokenTransfer(
          weth.address,
          user1.address,
          amountWETHtoTransfer
        )
    );

    // receives wETH
    expect(await weth.balanceOf(user1.address)).to.eq(
      userBalanceBefore.add(amountWETHtoTransfer)
    );
    expect(await weth.balanceOf(wETHGateway.address)).to.eq(
      gatewayBalanceBefore.sub(amountWETHtoTransfer)
    );
  });

  it("TC-weth-gateway-06 Owner does emergency ether transfer 50 ETH to User 1", async () => {
    const {
      users: [user1],
      gatewayAdmin,
      wETHGateway,
      weth,
    } = testEnv;
    const owner = gatewayAdmin;

    const amountETHtoTransfer = await convertToCurrencyDecimals(
      weth.address,
      "50"
    );

    const wethSigner = (await impersonateAddress(weth.address)).signer;

    // user3 send eth to weth contract
    const [, , user3] = await DRE.ethers.getSigners();
    await user3.sendTransaction({
      to: weth.address,
      value: DRE.ethers.utils.parseEther("50.0"), // Sends exactly 50.0 ether
    });

    // weth contract send ether to gateway
    await wethSigner.sendTransaction({
      to: wETHGateway.address,
      value: DRE.ethers.utils.parseEther("50.0"), // Sends exactly 50.0 ether
    });

    const userETHBalanceBefore = await user1.signer.getBalance();
    const userWETHBalanceBefore = await weth.balanceOf(user1.address);

    await waitForTx(
      await wETHGateway
        .connect(owner.signer)
        .emergencyEtherTransfer(user1.address, amountETHtoTransfer)
    );

    expect(await weth.balanceOf(user1.address)).to.eq(userWETHBalanceBefore);
    assertAlmostEqual(
      await user1.signer.getBalance(),
      userETHBalanceBefore.add(amountETHtoTransfer)
    );
  });
});
