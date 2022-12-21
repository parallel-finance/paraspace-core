import {expect} from "chai";
import {utils} from "ethers";
import {increaseTime, timeLatest, waitForTx} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT, ZERO_ADDRESS} from "../helpers/constants";
import {ProtocolErrors} from "../helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {topUpNonPayableWithEther} from "./helpers/utils/funds";
import {
  buildDelegationWithSigParams,
  convertToCurrencyDecimals,
  getSignatureFromTypedData,
  impersonateAddress,
} from "../helpers/contracts-helpers";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {VariableDebtToken__factory} from "../types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {getTestWallets} from "./helpers/utils/wallets";
import {HARDHAT_CHAINID} from "../helpers/hardhat-constants";

declare let hre: HardhatRuntimeEnvironment;

describe("VariableDebtToken", () => {
  context("Mint and Burn events", () => {
    let testEnv: TestEnv;

    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });
    const {
      CALLER_MUST_BE_POOL,
      INVALID_MINT_AMOUNT,
      INVALID_BURN_AMOUNT,
      CALLER_NOT_POOL_ADMIN,
    } = ProtocolErrors;

    it("TC-variable-debt-token-01 Check contract initialization", async () => {
      const {pool, weth, dai, protocolDataProvider, users} = testEnv;
      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;

      const variableDebtContract = await VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        users[0].signer
      );

      expect(await variableDebtContract.UNDERLYING_ASSET_ADDRESS()).to.be.eq(
        dai.address
      );
      expect(await variableDebtContract.POOL()).to.be.eq(pool.address);
      expect(await variableDebtContract.getIncentivesController()).to.not.be.eq(
        ZERO_ADDRESS
      );

      const scaledUserBalanceAndSupplyUser0Before =
        await variableDebtContract.getScaledUserBalanceAndSupply(
          users[0].address
        );
      expect(scaledUserBalanceAndSupplyUser0Before[0]).to.be.eq(0);
      expect(scaledUserBalanceAndSupplyUser0Before[1]).to.be.eq(0);

      // Need to create some debt to do this right
      await dai
        .connect(users[0].signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "1000"));
      await dai.connect(users[0].signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(users[0].signer)
        .supply(
          dai.address,
          await convertToCurrencyDecimals(dai.address, "1000"),
          users[0].address,
          0
        );
      await weth
        .connect(users[1].signer)
        ["mint(uint256)"](utils.parseEther("10"));
      await weth
        .connect(users[1].signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(users[1].signer)
        .supply(weth.address, utils.parseEther("10"), users[1].address, 0);
      await pool
        .connect(users[1].signer)
        .borrow(
          dai.address,
          await convertToCurrencyDecimals(dai.address, "200"),
          0,
          users[1].address
        );

      const scaledUserBalanceAndSupplyUser0After =
        await variableDebtContract.getScaledUserBalanceAndSupply(
          users[0].address
        );
      expect(scaledUserBalanceAndSupplyUser0After[0]).to.be.eq(0);
      expect(scaledUserBalanceAndSupplyUser0After[1]).to.be.gt(0);

      const scaledUserBalanceAndSupplyUser1After =
        await variableDebtContract.getScaledUserBalanceAndSupply(
          users[1].address
        );
      expect(scaledUserBalanceAndSupplyUser1After[1]).to.be.gt(0);
      expect(scaledUserBalanceAndSupplyUser1After[1]).to.be.gt(0);

      expect(scaledUserBalanceAndSupplyUser0After[1]).to.be.eq(
        scaledUserBalanceAndSupplyUser1After[1]
      );
    });

    it("TC-variable-debt-token-02 Tries to mint not being the Pool (revert expected)", async () => {
      const {deployer, dai, protocolDataProvider} = testEnv;

      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;

      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        deployer.signer
      );

      await expect(
        variableDebtContract.mint(deployer.address, deployer.address, "1", "1")
      ).to.be.revertedWith(CALLER_MUST_BE_POOL);
    });

    it("TC-variable-debt-token-03 Tries to burn not being the Pool (revert expected)", async () => {
      const {deployer, dai, protocolDataProvider} = testEnv;

      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;

      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        deployer.signer
      );

      await expect(
        variableDebtContract.burn(deployer.address, "1", "1")
      ).to.be.revertedWith(CALLER_MUST_BE_POOL);
    });

    it("TC-variable-debt-token-04 Tries to mint with amountScaled == 0 (revert expected)", async () => {
      const {deployer, pool, dai, protocolDataProvider, users} = testEnv;

      // Impersonate the Pool
      await topUpNonPayableWithEther(
        deployer.signer,
        [pool.address],
        utils.parseEther("1")
      );
      const poolSigner = (await impersonateAddress(pool.address)).signer;

      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;

      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        deployer.signer
      );

      await expect(
        variableDebtContract
          .connect(poolSigner)
          .mint(
            users[0].address,
            users[0].address,
            0,
            utils.parseUnits("1", 27)
          )
      ).to.be.revertedWith(INVALID_MINT_AMOUNT);
    });

    it("TC-variable-debt-token-05 Tries to burn with amountScaled == 0 (revert expected)", async () => {
      const {deployer, pool, dai, protocolDataProvider, users} = testEnv;

      // Impersonate the Pool
      await topUpNonPayableWithEther(
        deployer.signer,
        [pool.address],
        utils.parseEther("1")
      );
      const poolSigner = (await impersonateAddress(pool.address)).signer;

      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;

      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        deployer.signer
      );

      await expect(
        variableDebtContract
          .connect(poolSigner)
          .burn(users[0].address, 0, utils.parseUnits("1", 27))
      ).to.be.revertedWith(INVALID_BURN_AMOUNT);
    });

    it("TC-variable-debt-token-06 Tries to transfer debt tokens (revert expected)", async () => {
      const {users, dai, protocolDataProvider} = testEnv;
      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;
      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        users[0].signer
      );

      await expect(
        variableDebtContract
          .connect(users[0].signer)
          .transfer(users[1].address, 500)
      ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
    });

    it("TC-variable-debt-token-07 Tries to approve debt tokens (revert expected)", async () => {
      const {users, dai, protocolDataProvider} = testEnv;
      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;
      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        users[0].signer
      );

      await expect(
        variableDebtContract
          .connect(users[0].signer)
          .approve(users[1].address, 500)
      ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
      await expect(
        variableDebtContract.allowance(users[0].address, users[1].address)
      ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
    });

    it("TC-variable-debt-token-08 Tries to increaseAllowance (revert expected)", async () => {
      const {users, dai, protocolDataProvider} = testEnv;
      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;
      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        users[0].signer
      );

      await expect(
        variableDebtContract
          .connect(users[0].signer)
          .increaseAllowance(users[1].address, 500)
      ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
    });

    it("TC-variable-debt-token-09 Tries to decreaseAllowance (revert expected)", async () => {
      const {users, dai, protocolDataProvider} = testEnv;
      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;
      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        users[0].signer
      );

      await expect(
        variableDebtContract
          .connect(users[0].signer)
          .decreaseAllowance(users[1].address, 500)
      ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
    });

    it("TC-variable-debt-token-10 Tries to transferFrom debt tokens (revert expected)", async () => {
      const {users, dai, protocolDataProvider} = testEnv;
      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;
      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        users[0].signer
      );

      await expect(
        variableDebtContract
          .connect(users[0].signer)
          .transferFrom(users[0].address, users[1].address, 500)
      ).to.be.revertedWith(ProtocolErrors.OPERATION_NOT_SUPPORTED);
    });

    it("TC-variable-debt-token-11 Check Mint and Transfer events when borrowing on behalf", async () => {
      const {
        pool,
        weth,
        dai,
        users: [user1, user2, user3],
      } = testEnv;

      // Add liquidity
      await dai
        .connect(user3.signer)
        ["mint(uint256)"](utils.parseUnits("1000", 18));
      await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user3.signer)
        .supply(dai.address, utils.parseUnits("1000", 18), user3.address, 0);

      // User1 supplies 10 WETH
      await weth
        .connect(user1.signer)
        ["mint(uint256)"](utils.parseUnits("10", 18));
      await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(user1.signer)
        .supply(weth.address, utils.parseUnits("10", 18), user1.address, 0);

      const daiData = await pool.getReserveData(dai.address);
      const variableDebtToken = VariableDebtToken__factory.connect(
        daiData.variableDebtTokenAddress,
        user1.signer
      );
      await variableDebtToken.balanceOf(user2.address);

      // User1 borrows 100 DAI
      const borrowAmount = utils.parseUnits("100", 18);
      expect(
        await pool
          .connect(user1.signer)
          .borrow(dai.address, borrowAmount, 0, user1.address)
      );

      // User1 approves user2 to borrow 1000 DAI
      expect(
        await variableDebtToken
          .connect(user1.signer)
          .approveDelegation(user2.address, utils.parseUnits("1000", 18))
      );

      // Increase time so interests accrue
      await increaseTime(24 * 3600);

      const previousIndexUser1Before = await variableDebtToken.getPreviousIndex(
        user1.address
      );
      const previousIndexUser2Before = await variableDebtToken.getPreviousIndex(
        user2.address
      );

      // User2 borrows 100 DAI on behalf of user1
      const borrowOnBehalfAmount = utils.parseUnits("100", 18);
      const tx = await waitForTx(
        await pool
          .connect(user2.signer)
          .borrow(dai.address, borrowOnBehalfAmount, 0, user1.address)
      );

      const previousIndexUser1After = await variableDebtToken.getPreviousIndex(
        user1.address
      );
      const previousIndexUser2After = await variableDebtToken.getPreviousIndex(
        user2.address
      );

      // User2 index should be the same
      expect(previousIndexUser1Before).to.be.not.eq(previousIndexUser1After);
      expect(previousIndexUser2Before).to.be.eq(previousIndexUser2After);

      const afterDebtBalanceUser1 = await variableDebtToken.balanceOf(
        user1.address
      );

      const interest = afterDebtBalanceUser1
        .sub(borrowAmount)
        .sub(borrowOnBehalfAmount);

      const transferEventSig = utils.keccak256(
        utils.toUtf8Bytes("Transfer(address,address,uint256)")
      );

      const rawTransferEvents = tx.logs.filter(
        ({topics, address}) =>
          topics[0] === transferEventSig && address == variableDebtToken.address
      );
      const parsedTransferEvent = variableDebtToken.interface.parseLog(
        rawTransferEvents[0]
      );
      const transferAmount = parsedTransferEvent.args.value;

      expect(transferAmount).to.be.closeTo(
        borrowOnBehalfAmount.add(interest),
        2
      );

      const mintEventSig = utils.keccak256(
        utils.toUtf8Bytes("Mint(address,address,uint256,uint256,uint256)")
      );
      const rawMintEvents = tx.logs.filter(
        ({topics, address}) =>
          topics[0] === mintEventSig && address == variableDebtToken.address
      );

      const parsedMintEvent = variableDebtToken.interface.parseLog(
        rawMintEvents[0]
      );

      expect(parsedMintEvent.args.value).to.be.closeTo(
        borrowOnBehalfAmount.add(interest),
        2
      );
      expect(parsedMintEvent.args.balanceIncrease).to.be.closeTo(interest, 2);
    });

    it("TC-variable-debt-token-12 setIncentivesController() from not pool admin (revert expected)", async () => {
      const {
        dai,
        protocolDataProvider,
        users: [user],
      } = testEnv;
      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;
      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        user.signer
      );

      expect(await variableDebtContract.getIncentivesController()).to.not.be.eq(
        ZERO_ADDRESS
      );

      await expect(
        variableDebtContract
          .connect(user.signer)
          .setIncentivesController(ZERO_ADDRESS)
      ).to.be.revertedWith(CALLER_NOT_POOL_ADMIN);
    });

    it("TC-variable-debt-token-13 setIncentivesController() ", async () => {
      const {dai, protocolDataProvider, poolAdmin, aclManager, deployer} =
        testEnv;

      const daiVariableDebtTokenAddress = (
        await protocolDataProvider.getReserveTokensAddresses(dai.address)
      ).variableDebtTokenAddress;
      const variableDebtContract = VariableDebtToken__factory.connect(
        daiVariableDebtTokenAddress,
        deployer.signer
      );

      expect(
        await aclManager
          .connect(poolAdmin.signer)
          .addPoolAdmin(poolAdmin.address)
      );

      expect(await variableDebtContract.getIncentivesController()).to.not.be.eq(
        ZERO_ADDRESS
      );
      expect(
        await variableDebtContract
          .connect(poolAdmin.signer)
          .setIncentivesController(ZERO_ADDRESS)
      );
      expect(await variableDebtContract.getIncentivesController()).to.be.eq(
        ZERO_ADDRESS
      );
    });
  });

  context("DebtToken: Permit Delegation", () => {
    let testEnv: TestEnv;

    let daiMintedAmount;
    let wethMintedAmount;
    let testWallets;

    const MINT_AMOUNT = "1000";
    const EIP712_REVISION = "1";

    const fixture = async () => {
      testEnv = await loadFixture(testEnvFixture);
      const {
        pool,
        weth,
        dai,
        deployer: user1,
        users: [user2],
      } = testEnv;
      testWallets = getTestWallets();

      // Setup the pool
      daiMintedAmount = await convertToCurrencyDecimals(
        dai.address,
        MINT_AMOUNT
      );
      wethMintedAmount = await convertToCurrencyDecimals(
        weth.address,
        MINT_AMOUNT
      );

      expect(await dai["mint(uint256)"](daiMintedAmount));
      expect(await dai.approve(pool.address, daiMintedAmount));
      expect(await pool.supply(dai.address, daiMintedAmount, user1.address, 0));
      expect(
        await weth.connect(user2.signer)["mint(uint256)"](wethMintedAmount)
      );
      expect(
        await weth.connect(user2.signer).approve(pool.address, wethMintedAmount)
      );
      expect(
        await pool
          .connect(user2.signer)
          .supply(weth.address, wethMintedAmount, user2.address, 0)
      );

      return testEnv;
    };

    it("TC-variable-debt-token-14 Check the domain separator", async () => {
      const testEnv = await loadFixture(fixture);
      const {variableDebtDai} = testEnv;
      const variableSeparator = await variableDebtDai.DOMAIN_SEPARATOR();

      const variableDomain = {
        name: await variableDebtDai.name(),
        version: EIP712_REVISION,
        chainId: hre.network.config.chainId,
        verifyingContract: variableDebtDai.address,
      };
      const variableDomainSeparator =
        utils._TypedDataEncoder.hashDomain(variableDomain);

      expect(variableSeparator).to.be.equal(
        variableDomainSeparator,
        "Invalid variable domain separator"
      );
    });

    it("TC-variable-debt-token-15 User can borrow variable interest token on behalf of another user via permit", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        pool,
        variableDebtDai,
        dai,
        deployer: user1,
        users: [user2, user3],
      } = testEnv;

      const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
      const expiration = MAX_UINT_AMOUNT;
      const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
      const permitAmount = daiMintedAmount.div(3);
      const msgParams = buildDelegationWithSigParams(
        chainId,
        variableDebtDai.address,
        EIP712_REVISION,
        await variableDebtDai.name(),
        user3.address,
        nonce,
        expiration,
        permitAmount.toString()
      );

      const user2PrivateKey = testWallets[1].privateKey;
      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");

      const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

      expect(
        await variableDebtDai
          .connect(user1.signer)
          .delegationWithSig(
            user2.address,
            user3.address,
            permitAmount,
            expiration,
            v,
            r,
            s
          )
      );

      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal(permitAmount);

      await pool
        .connect(user3.signer)
        .borrow(dai.address, permitAmount, 0, user2.address);
      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");
    });

    it("TC-variable-debt-token-16 Variable debt delegation with delegator == address(0) (revert expected)", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        variableDebtDai,
        deployer: user1,
        users: [user2, user3],
      } = testEnv;

      const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
      const expiration = MAX_UINT_AMOUNT;
      const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
      const permitAmount = daiMintedAmount.div(3);
      const msgParams = buildDelegationWithSigParams(
        chainId,
        variableDebtDai.address,
        EIP712_REVISION,
        await variableDebtDai.name(),
        user3.address,
        nonce,
        expiration,
        permitAmount.toString()
      );

      const user2PrivateKey = testWallets[1].privateKey;
      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");

      const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

      await expect(
        variableDebtDai
          .connect(user1.signer)
          .delegationWithSig(
            ZERO_ADDRESS,
            user3.address,
            permitAmount,
            expiration,
            v,
            r,
            s
          )
      ).to.be.revertedWith(ProtocolErrors.ZERO_ADDRESS_NOT_VALID);

      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");
    });

    it("TC-variable-debt-token-17 Variable debt delegation with block.timestamp > deadline (revert expected)", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        variableDebtDai,
        deployer: user1,
        users: [user2, user3],
      } = testEnv;

      const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
      const expiration = (await timeLatest()).sub(500).toString();
      const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
      const permitAmount = daiMintedAmount.div(3);
      const msgParams = buildDelegationWithSigParams(
        chainId,
        variableDebtDai.address,
        EIP712_REVISION,
        await variableDebtDai.name(),
        user3.address,
        nonce,
        expiration,
        permitAmount.toString()
      );

      const user2PrivateKey = testWallets[1].privateKey;
      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");

      const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

      await expect(
        variableDebtDai
          .connect(user1.signer)
          .delegationWithSig(
            user2.address,
            user3.address,
            permitAmount,
            expiration,
            v,
            r,
            s
          )
      ).to.be.revertedWith(ProtocolErrors.INVALID_EXPIRATION);

      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");
    });

    it("TC-variable-debt-token-18 Variable debt delegation with wrong delegator", async () => {
      const testEnv = await loadFixture(fixture);
      const {
        variableDebtDai,
        deployer: user1,
        users: [user2, user3],
      } = testEnv;

      const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
      const expiration = MAX_UINT_AMOUNT;
      const nonce = (await variableDebtDai.nonces(user2.address)).toNumber();
      const permitAmount = daiMintedAmount.div(3);
      const msgParams = buildDelegationWithSigParams(
        chainId,
        variableDebtDai.address,
        EIP712_REVISION,
        await variableDebtDai.name(),
        user3.address,
        nonce,
        expiration,
        permitAmount.toString()
      );

      const user2PrivateKey = testWallets[1].privateKey;
      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");

      const {v, r, s} = getSignatureFromTypedData(user2PrivateKey, msgParams);

      await expect(
        variableDebtDai
          .connect(user1.signer)
          .delegationWithSig(
            user1.address,
            user3.address,
            permitAmount,
            expiration,
            v,
            r,
            s
          )
      ).to.be.revertedWith(ProtocolErrors.INVALID_SIGNATURE);

      expect(
        (
          await variableDebtDai.borrowAllowance(user2.address, user3.address)
        ).toString()
      ).to.be.equal("0");
    });
  });
});
