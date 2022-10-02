import {expect} from "chai";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {RateMode} from "../deploy/helpers/types";
import {MOCK_CHAINLINK_AGGREGATORS_PRICES} from "../deploy/market-config";
import {makeSuite} from "./helpers/make-suite";

makeSuite("Punk nToken Mint and Burn Event Accounting", (testEnv) => {
  let firstDaiDeposit;
  let secondDaiDeposit;
  // let thirdDaiDeposit;
  const wPunksFloorPrice = BigNumber.from(
    MOCK_CHAINLINK_AGGREGATORS_PRICES.WPUNKS
  );

  // let wPunkGatewayProxy;
  // let wPunkGatewayProxy;
  // const EIP712_REVISION = "1";

  before("Initialize Depositors", async () => {
    const {
      dai,
      punk,
      wPunk,
      users: [, , user3],
      wPunkGatewayProxy,
    } = testEnv;

    firstDaiDeposit = await convertToCurrencyDecimals(dai.address, "10000");
    secondDaiDeposit = await convertToCurrencyDecimals(dai.address, "20000");
    await convertToCurrencyDecimals(dai.address, "50000");

    // withdrawPunk
    await waitForTx(await punk.connect(user3.signer)["getPunk(uint256)"](0));
    await punk.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(await punk.connect(user3.signer).offerPunkForSale(0, 0));

    // withdrawPunkWithPermit
    await waitForTx(await punk.connect(user3.signer)["getPunk(uint256)"](1));
    await punk.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(await punk.connect(user3.signer).offerPunkForSale(1, 0));

    // wPunkGatewayProxy = await ethers.getContractFactory("wPunkGatewayProxy");
    // wPunkGatewayProxy = await wPunkGatewayProxy.deploy(
    //   punk.address,
    //   wPunk.address,
    //   user3.address,
    //   pool.address
    // );

    const proxy = await wPunkGatewayProxy.proxy();
    console.log("proxy from wPunkGateway is ", proxy);

    await waitForTx(
      await wPunk
        .connect(user3.signer)
        .setApprovalForAll(wPunkGatewayProxy.address, true)
    );
  });

  it("User 3 deposits WPUNK", async () => {
    const {
      wPunk,
      nWPunk,
      // paraspace,
      users: [, , user3],
      pool,
      wPunkGateway,
      wPunkGatewayProxy,
    } = testEnv;

    const availableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    expect(availableToBorrow).to.be.equal(0);
    const totalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;
    expect(totalCollateral).to.be.equal(0);

    console.log("Before proxy supplyPunk");
    console.log("wPunkGateway address is ", wPunkGateway.address);
    console.log("wPunkGatewayProxy address is ", wPunkGatewayProxy.address);
    console.log("user3 address is", user3.address);
    await wPunkGatewayProxy
      .connect(user3.signer)
      .supplyPunk(
        pool.address,
        [{tokenId: 0, useAsCollateral: true}],
        user3.address,
        "0"
      );

    const nWPunkBalance = await nWPunk.balanceOf(user3.address);
    expect(nWPunkBalance).to.be.equal(1);

    const newTotalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;
    expect(newTotalCollateral).to.be.eq(wPunksFloorPrice);

    // const initialParaSpaceBalance = await paraspace.balanceOf(user3.address);
    // // advance blocks and assert user is acquiring ParaSpace interest
    // advanceTimeAndBlock(3600);
    // const paraspaceBalance = await paraspace.balanceOf(user3.address);
    // // TODO(ivan.solomonoff): We'd need to merge tokenomics repo in order to perform checks on rewards within this same suite setup
    // // TODO(ivan.solomonoff): This is currently set at 0% APY, but in documentation we say it should earn interest on a per block basis
    // // expect(paraspaceBalance).to.be.gt(initialParaSpaceBalance);

    // availableToBorrow must've increased in exactly NFT's floor price * 30% (LTV)
    const newAvailableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;

    const expectedAvailableToBorrow = wPunksFloorPrice
      .mul(BigNumber.from(30))
      .div(BigNumber.from(100));
    expect(newAvailableToBorrow).to.be.eq(expectedAvailableToBorrow);

    const wPunkBalance = await wPunk.balanceOf(user3.address);
    expect(wPunkBalance).to.be.equal(0);
  });

  it("User 2 deposits 10k DAI and User 3 borrows 8K DAI", async () => {
    const {
      dai,
      variableDebtDai,
      users: [, , user3],
      gatewayAdmin: user4,
      pool,
      helpersContract,
    } = testEnv;

    await waitForTx(
      await dai
        .connect(user4.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user 4 wallet
    await waitForTx(
      await dai.connect(user4.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 4 - Deposit dai
    await waitForTx(
      await pool
        .connect(user4.signer)
        .supply(dai.address, firstDaiDeposit, user4.address, "0")
    );

    await variableDebtDai.balanceOf(user3.address);

    // User 3 - Borrow dai
    const borrowAmount = await convertToCurrencyDecimals(dai.address, "8000");

    await waitForTx(
      await pool
        .connect(user3.signer)
        .borrow(
          dai.address,
          borrowAmount,
          RateMode.Variable,
          "0",
          user3.address
        )
    );

    await variableDebtDai.balanceOf(user3.address);

    await helpersContract.getUserReserveData(dai.address, user3.address);
  });

  it("User 3 tries to withdraw the deposited WPUNK without paying the accrued interest (should fail)", async () => {
    const {
      users: [, , user3],
      pool,
      wPunkGatewayProxy,
    } = testEnv;

    expect(
      wPunkGatewayProxy
        .connect(user3.signer)
        .withdrawPunk(pool.address, [0], user3.address)
    ).to.be.reverted;
  });

  it("User 3 tries to withdraw the deposited WPUNK from collateral without paying the accrued interest (should fail)", async () => {
    const {
      wPunk,
      users: [, , user3],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user3.signer)
        .setUserUseERC721AsCollateral(wPunk.address, [0], false)
    ).to.be.reverted;
  });

  it("User 3 tries to send the nToken to User 4 (should fail)", async () => {
    const {
      nWPunk,
      users: [, , user3],
      gatewayAdmin: user4,
    } = testEnv;

    expect(
      nWPunk.connect(user3.signer).transferFrom(user3.address, user4.address, 1)
    ).to.be.reverted;
  });

  it("User 3 adds 20K dai as collateral and then removes their WPUNK from collateral without paying the accrued interest", async () => {
    const {
      dai,
      wPunk,
      nWPunk,
      users: [, , user3],
      pool,
    } = testEnv;

    // User 3 - Mints 20k dai
    await waitForTx(
      await dai
        .connect(user3.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "20000"))
    );

    // User 3 - approves dai for pool
    await waitForTx(
      await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // User 3 - Deposit dai
    await waitForTx(
      await pool
        .connect(user3.signer)
        .supply(dai.address, secondDaiDeposit, user3.address, "0")
    );

    // User 3 - marks dai as collateral
    await waitForTx(
      await pool
        .connect(user3.signer)
        .setUserUseReserveAsCollateral(dai.address, true)
    );

    const availableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    const totalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;

    // User 3 - marks ERC721 as not collateral
    await waitForTx(
      await pool
        .connect(user3.signer)
        .setUserUseERC721AsCollateral(wPunk.address, [0], false)
    );

    const newTotalCollateral = (await pool.getUserAccountData(user3.address))
      .totalCollateralBase;
    expect(newTotalCollateral).to.be.lt(totalCollateral);

    const newAvailableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    expect(newAvailableToBorrow).to.be.lt(availableToBorrow);

    const wPunkBalance = await wPunk.balanceOf(user3.address);
    expect(wPunkBalance).to.be.equal(0);

    const nWPunkBalance = await nWPunk.balanceOf(user3.address);
    expect(nWPunkBalance).to.be.equal(1);
  });

  it("User 3 redeems the supplied WPunks", async () => {
    const {
      wPunk,
      nWPunk,
      users: [, , user3],
      pool,
      wPunkGatewayProxy,
      punk,
    } = testEnv;
    const availableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    (await pool.getUserAccountData(user3.address)).totalCollateralBase;

    // withdraw WPUNKS
    await waitForTx(
      await nWPunk
        .connect(user3.signer)
        .setApprovalForAll(wPunkGatewayProxy.address, true)
    );

    await nWPunk.isApprovedForAll(user3.address, wPunkGatewayProxy.address);

    // withdraw WPUNKS
    const withdrawWPUNKSTx = await wPunkGatewayProxy
      .connect(user3.signer)
      .withdrawPunk(pool.address, [0], user3.address);

    await withdrawWPUNKSTx.wait();

    const nWPunkBalance = await nWPunk.balanceOf(user3.address);
    expect(nWPunkBalance).to.be.equal(0);

    const wPunkBalance = await wPunk.balanceOf(user3.address);
    expect(wPunkBalance).to.be.equal(0);

    // minted both id of 0 and 1 at the beginning so Punk balance should be back at 2
    const punkBalance = await punk.balanceOf(user3.address);
    expect(punkBalance).to.be.equal(2);

    // availableToBorrow must've decreased
    const newAvailableToBorrow = (await pool.getUserAccountData(user3.address))
      .availableBorrowsBase;
    expect(newAvailableToBorrow).to.be.lt(availableToBorrow);
  });

  it("User 3 tries to remove the deposited DAI from collateral without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [, , user3],
      pool,
    } = testEnv;

    expect(
      pool
        .connect(user3.signer)
        .setUserUseReserveAsCollateral(dai.address, false)
    ).to.be.reverted;
  });

  it("User 3 tries to withdraw the deposited DAI without paying the accrued interest (should fail)", async () => {
    const {
      dai,
      users: [, , user3],
      pool,
    } = testEnv;

    expect(pool.connect(user3.signer).withdraw(dai.address, [0], user3.address))
      .to.be.reverted;
  });

  it("User 3 pays the accrued interest and withdraw deposited DAI", async () => {
    const {
      dai,
      users: [, , user3],
      pool,
    } = testEnv;
    await waitForTx(
      await dai
        .connect(user3.signer)
        ["mint(uint256)"](await convertToCurrencyDecimals(dai.address, "10000"))
    );

    // approve protocol to access user3 wallet
    await waitForTx(
      await dai.connect(user3.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    // repay dai loan
    const repayTx = await pool
      .connect(user3.signer)
      .repay(
        dai.address,
        firstDaiDeposit,
        RateMode.Variable,
        user3.address,
        false
      );
    await repayTx.wait();

    const daiBalanceBefore = await dai.balanceOf(user3.address);
    await ethers.utils.formatUnits(daiBalanceBefore, 18);

    // withdraw DAI
    const withdrawDAITx = await pool
      .connect(user3.signer)
      .withdraw(dai.address, secondDaiDeposit, user3.address);

    await withdrawDAITx.wait();

    await dai.balanceOf(user3.address);
  });

  // it("User 3 deposits WPUNK, signs signature and withdraws with permit", async () => {
  //   const {
  //     punk,
  //     wPunk,
  //     nWPunk,
  //     users: [,, user3],
  //     pool,
  //     helpersContract,
  //     wPunkGatewayProxy,
  //   } = testEnv;
  //   await waitForTx(await punk.connect(user3.signer).offerPunkForSale(0, 0));

  //   console.log("before deposit ------------------- ");
  //   // deposits WPUNK
  //   await wPunkGatewayProxy
  //     .connect(user3.signer)
  //     .supplyPunk(pool.address, [[1, true]], user3.address, "0");

  //   const nWPunkBalance = await nWPunk.balanceOf(user3.address);
  //   expect(nWPunkBalance).to.be.equal(1);

  //   console.log("before signature ------------------- ");
  //   // signs signature
  //   const chainId = hre.network.config.chainId || HARDHAT_CHAINID;
  //   const deadline = MAX_UINT_AMOUNT;
  //   const nonce = (await nWPunk.nonces(user3.address)).toNumber();
  //   const permitAmount = "1";
  //   const msgParams = buildPermitParams(
  //     chainId,
  //     nWPunk.address,
  //     EIP712_REVISION,
  //     await nWPunk.name(),
  //     user3.address,
  //     wPunkGatewayProxy.address,
  //     nonce,
  //     deadline,
  //     permitAmount
  //   );

  //   const ownerPrivateKey = testWallets[0].secretKey;

  //   console.log("before getApproved ------------------- ");
  //   expect((await nWPunk.getApproved(1)).toString()).to.be.equal(
  //     "0x0000000000000000000000000000000000000000"
  //   );

  //   const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

  //   console.log("before withdraw ------------------- ");
  //   // withdraws with permit
  //   await waitForTx(
  //     await wPunkGatewayProxy
  //       .connect(user3.signer)
  //       .withdrawPunkWithPermit(
  //         pool.address,
  //         [1],
  //         user3.address,
  //         deadline,
  //         v,
  //         r,
  //         s
  //       )
  //   );
  // });

  it("getWPunk address returns correct address", async () => {
    const {
      wPunk,
      users: [, , user3],
      wPunkGatewayProxy,
    } = testEnv;

    const wPunkAddress = await wPunkGatewayProxy
      .connect(user3.signer)
      .getWPunkAddress();

    expect(wPunkAddress).to.be.equal(wPunk.address);
  });

  it("wPunkGatewayProxy receives 1 WPUNK and 1 PUNK", async () => {
    const {
      users: [, , user3],
      punk,
      wPunk,
      wPunkGatewayProxy,
    } = testEnv;
    // WPUNK
    await waitForTx(await punk.connect(user3.signer)["getPunk(uint256)"](2));
    await punk.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(await punk.connect(user3.signer).offerPunkForSale(2, 0));
    await waitForTx(await wPunk.connect(user3.signer).registerProxy());
    const proxy = await wPunk.proxyInfo(user3.address);
    await waitForTx(await punk.connect(user3.signer).transferPunk(proxy, 2));
    await waitForTx(await wPunk.connect(user3.signer).mint(2));
    await waitForTx(
      await wPunk
        .connect(user3.signer)
        ["safeTransferFrom(address,address,uint256)"](
          user3.address,
          wPunkGatewayProxy.address,
          2
        )
    );

    // PUNK
    await waitForTx(await punk.connect(user3.signer)["getPunk(uint256)"](3));
    await punk.connect(user3.signer).balanceOf(user3.address);

    await waitForTx(await punk.connect(user3.signer).offerPunkForSale(3, 0));
    await waitForTx(
      await punk
        .connect(user3.signer)
        .transferPunk(wPunkGatewayProxy.address, 3)
    );
  });

  it("Owner does emergency wpunk transfer of punk 2 to User 3", async () => {
    const {
      users: [, , user3],
      deployer,
      wPunkGatewayProxy,
    } = testEnv;
    const owner = deployer;

    await waitForTx(
      await wPunkGatewayProxy
        .connect(owner.signer)
        .emergencyTokenTransfer(wPunkGatewayProxy.address, user3.address, 2)
    );
  });

  it("Owner does emergency punk transfer of punk 3 to User 3", async () => {
    const {
      users: [, , user3],
      deployer,
      wPunkGatewayProxy,
    } = testEnv;
    const owner = deployer;

    await waitForTx(
      await wPunkGatewayProxy
        .connect(owner.signer)
        .emergencyPunkTransfer(user3.address, 3)
    );
  });
});
