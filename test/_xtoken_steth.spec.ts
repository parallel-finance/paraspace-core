import BigNumber from "bignumber.js";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {SignerWithAddress, TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {snapshot} from "./helpers/snapshot-manager";
import {advanceTimeAndBlock} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {tEthereumAddress} from "../helpers/types";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {PTokenStETH, StETHDebtToken} from "../types";
import {getPTokenStETH, getStETHDebtToken} from "../helpers/contracts-getters";

async function rebase(pool, steth, perc) {
  const currentSupply = new BigNumber((await steth.totalSupply()).toString());
  const supplyDelta = currentSupply.multipliedBy(perc);
  await steth.rebase(supplyDelta.toString(10));
}

async function fxtPt(t, amt) {
  return convertToCurrencyDecimals(t.address, amt);
}

async function check(amt, cmpAmt, token, tolarance) {
  const t = new BigNumber(tolarance)
    .multipliedBy(10 ** (await token.decimals()))
    .toString(10);
  expect(amt).to.be.gte(cmpAmt.sub(t)).lte(cmpAmt.add(t));
}

async function checkGt(amt, cmpAmt) {
  expect(amt).to.be.gt(cmpAmt);
}

// tolarance 1 StETH cent ~= 0.01 StETH
async function checkBal(token, addr, amt, tolarance = 0.01) {
  return check(
    await token.balanceOf(addr),
    await fxtPt(token, amt),
    token,
    tolarance
  );
}

async function checkBalGt(token, addr, amt) {
  const balanceOf = await token.balanceOf(addr);
  const targetAmt = await fxtPt(token, amt);
  return checkGt(balanceOf, targetAmt);
}

async function checkScaledBal(token, addr, amt, tolarance = 0.01) {
  return check(
    await token.scaledBalanceOf(addr),
    await fxtPt(token, amt),
    token,
    tolarance
  );
}

async function checkSupply(token, amt, tolarance = 0.01) {
  return check(
    await token.totalSupply(),
    await fxtPt(token, amt),
    token,
    tolarance
  );
}

async function checkSupplyGt(token, amt) {
  const totalSupply = await token.totalSupply();
  const targetAmt = await fxtPt(token, amt);
  return checkGt(totalSupply, targetAmt);
}

describe("StETH pToken & variableDebtToken", async () => {
  let lenderA: SignerWithAddress;
  let lenderB: SignerWithAddress;
  let lenderC: SignerWithAddress;
  let borrowerA: SignerWithAddress;
  let borrowerB: SignerWithAddress;
  let admin: SignerWithAddress;
  let lenderAAddress: tEthereumAddress;
  let lenderBAddress: tEthereumAddress;
  let lenderCAddress: tEthereumAddress;
  let borrowerAAddress: tEthereumAddress;
  let borrowerBAddress: tEthereumAddress;
  let adminAddress: tEthereumAddress;
  let treasuryAddress: tEthereumAddress;
  let reserveData;
  let snapthotId: string;
  let pstETH: PTokenStETH;
  let debtToken: StETHDebtToken;
  let testEnv: TestEnv;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {pool, stETH, deployer, users} = testEnv;

    lenderA = users[1];
    lenderB = users[2];
    lenderC = users[3];
    borrowerA = users[4];
    borrowerB = users[5];
    admin = users[6];

    lenderAAddress = lenderA.address;
    lenderBAddress = lenderB.address;
    lenderCAddress = lenderC.address;
    borrowerAAddress = borrowerA.address;
    borrowerBAddress = borrowerB.address;
    adminAddress = admin.address;
    reserveData = await pool.getReserveData(stETH.address);
    pstETH = await getPTokenStETH(reserveData.xTokenAddress);
    debtToken = await getStETHDebtToken(reserveData.variableDebtTokenAddress);

    treasuryAddress = await pstETH.RESERVE_TREASURY_ADDRESS();

    await stETH
      .connect(deployer.signer)
      .mint(deployer.address, await fxtPt(stETH, "1000000000"));
    await stETH
      .connect(deployer.signer)
      .transfer(lenderAAddress, await fxtPt(stETH, "100000"));
    await stETH
      .connect(deployer.signer)
      .transfer(lenderBAddress, await fxtPt(stETH, "100000"));
    await stETH
      .connect(deployer.signer)
      .transfer(lenderCAddress, await fxtPt(stETH, "100000"));
    await stETH
      .connect(deployer.signer)
      .transfer(adminAddress, await fxtPt(stETH, "1000"));
  });

  beforeEach("Take Blockchain Snapshot", async () => {
    snapthotId = await snapshot.take();
  });

  afterEach("Revert Blockchain to Snapshot", async () => {
    await snapshot.revert(snapthotId);
  });

  describe("steth rebasing", () => {
    describe("positive rebase", function () {
      it("should update total supply correctly", async () => {
        const {pool, stETH} = testEnv;

        const currentSupply = new BigNumber(
          (await stETH.totalSupply()).toString()
        );
        const supplyDelta = currentSupply.multipliedBy(+0.1);
        await rebase(pool, stETH, +0.1);
        const afterBalance = currentSupply.plus(supplyDelta);
        const newTotalSupply = await stETH.totalSupply();

        expect(newTotalSupply.toString()).to.be.equal(
          afterBalance.toString(10)
        );
      });
    });
    describe("negative rebase", function () {
      it("should update total supply correctly", async () => {
        const {pool, stETH} = testEnv;

        const currentSupply = new BigNumber(
          (await stETH.totalSupply()).toString()
        );
        const supplyDelta = currentSupply.multipliedBy(-0.1);
        await rebase(pool, stETH, -0.1);
        const afterBalance = currentSupply.plus(supplyDelta);
        const newTotalSupply = await stETH.totalSupply();

        expect(newTotalSupply.toString()).to.be.equal(
          afterBalance.toString(10)
        );
      });
    });
  });

  describe("user Transfer", () => {
    describe("when lenderA deposits 1000 StETH, transfers all to himself", function () {
      it("should update balances correctly", async () => {
        const {pool, stETH} = testEnv;

        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1000"));
        await pool
          .connect(lenderA.signer)
          .supply(
            stETH.address,
            await fxtPt(stETH, "1000"),
            lenderAAddress,
            "0"
          );

        const beforeBalance = await pstETH.scaledBalanceOf(lenderAAddress);
        await pstETH
          .connect(lenderA.signer)
          .transfer(lenderAAddress, await pstETH.balanceOf(lenderAAddress));
        const afterBalance = await pstETH.scaledBalanceOf(lenderAAddress);

        expect(beforeBalance.toString()).to.be.equal(afterBalance.toString());
      });
    });

    describe("deposit->borrow->rebase->repay->deposit->rebase", function () {
      it("should mint pToken correctly", async () => {
        const {pool, stETH, dai} = testEnv;

        // deposit
        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1"));
        await pool
          .connect(lenderA.signer)
          .supply(stETH.address, await fxtPt(stETH, "1"), lenderA.address, "0");
        // borrow
        await dai["mint(uint256)"](await fxtPt(dai, "400"));
        await dai.transfer(borrowerA.address, await fxtPt(dai, "400"));
        await dai
          .connect(borrowerA.signer)
          .approve(pool.address, await fxtPt(dai, "400"));
        await pool
          .connect(borrowerA.signer)
          .supply(dai.address, await fxtPt(dai, "400"), borrowerA.address, "0");
        await pool
          .connect(borrowerA.signer)
          .borrow(
            stETH.address,
            await fxtPt(stETH, "0.2"),
            "0",
            borrowerA.address
          );

        await checkBal(stETH, lenderA.address, "99999");
        await checkBal(pstETH, lenderA.address, "1");

        await checkBal(stETH, lenderB.address, "100000");
        await checkBal(pstETH, lenderB.address, "0");

        await checkBal(stETH, borrowerA.address, "0.2");
        await checkBal(debtToken, borrowerA.address, "0.2");

        await checkBal(stETH, pstETH.address, "0.8");

        // rebase
        await rebase(pool, stETH, +1.0); // + 100%

        await checkBal(stETH, lenderA.address, "199998");
        await checkBal(pstETH, lenderA.address, "2");

        await checkBal(stETH, lenderB.address, "200000");
        await checkBal(pstETH, lenderB.address, "0");

        await checkBal(stETH, borrowerA.address, "0.4");
        await checkBal(debtToken, borrowerA.address, "0.4");

        await checkBal(stETH, pstETH.address, "1.6");

        // repay
        await stETH
          .connect(borrowerA.signer)
          .approve(pool.address, await fxtPt(stETH, "0.4"));
        await pool
          .connect(borrowerA.signer)
          .repay(stETH.address, await fxtPt(stETH, "0.4"), borrowerA.address);

        await checkBal(stETH, lenderA.address, "199998");
        await checkBal(pstETH, lenderA.address, "2");

        await checkBal(stETH, lenderB.address, "200000");
        await checkBal(pstETH, lenderB.address, "0");

        await checkBal(stETH, borrowerA.address, "0");
        await checkBal(debtToken, borrowerA.address, "0");

        await checkBal(stETH, pstETH.address, "2");

        // deposit
        await stETH
          .connect(lenderB.signer)
          .approve(pool.address, await fxtPt(stETH, "1"));
        await pool
          .connect(lenderB.signer)
          .supply(stETH.address, await fxtPt(stETH, "1"), lenderB.address, "0");

        await checkBal(stETH, lenderA.address, "199998");
        await checkBal(pstETH, lenderA.address, "2");

        await checkBal(stETH, lenderB.address, "199999");
        await checkBal(pstETH, lenderB.address, "1");

        await checkBal(stETH, borrowerA.address, "0");
        await checkBal(debtToken, borrowerA.address, "0");

        await checkBal(stETH, pstETH.address, "3");

        // rebase
        await rebase(pool, stETH, +1.0); // + 100%

        await checkBal(stETH, lenderA.address, "399996");
        await checkBal(pstETH, lenderA.address, "4");

        await checkBal(stETH, lenderB.address, "399998");
        await checkBal(pstETH, lenderB.address, "2");

        await checkBal(stETH, borrowerA.address, "0");
        await checkBal(debtToken, borrowerA.address, "0");

        await checkBal(stETH, pstETH.address, "6");
      });
    });

    describe("when lenderA deposits 1000 StETH, transfers more than he has", function () {
      it("should update balances correctly", async () => {
        const {pool, stETH} = testEnv;

        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1000"));
        await pool
          .connect(lenderA.signer)
          .supply(
            stETH.address,
            await fxtPt(stETH, "1000"),
            lenderAAddress,
            "0"
          );

        await expect(
          pstETH
            .connect(lenderA.signer)
            .transfer(lenderAAddress, await fxtPt(stETH, "1001"), {
              gasLimit: 5000000,
            })
        ).to.be.reverted;
      });
    });

    describe("when borrowed amount > 0", function () {
      describe("when lenderA deposits 1000 StETH, transfers all to himself", function () {
        it("should update balances correctly", async () => {
          const {pool, dai, stETH} = testEnv;

          await stETH
            .connect(lenderA.signer)
            .approve(pool.address, await fxtPt(stETH, "1000"));
          await pool
            .connect(lenderA.signer)
            .supply(
              stETH.address,
              await fxtPt(stETH, "1000"),
              lenderAAddress,
              "0"
            );

          await dai["mint(uint256)"](await fxtPt(dai, "200000"));
          await dai.transfer(borrowerAAddress, await fxtPt(dai, "200000"));
          await dai
            .connect(borrowerA.signer)
            .approve(pool.address, await fxtPt(dai, "200000"));
          await pool
            .connect(borrowerA.signer)
            .supply(
              dai.address,
              await fxtPt(dai, "200000"),
              borrowerAAddress,
              "0"
            );

          await pool
            .connect(borrowerA.signer)
            .borrow(
              stETH.address,
              await fxtPt(stETH, "139"),
              "0",
              borrowerAAddress,
              {gasLimit: 5000000}
            );

          const beforeBalance = await pstETH.scaledBalanceOf(lenderAAddress);
          await pstETH
            .connect(lenderA.signer)
            .transfer(lenderAAddress, await pstETH.balanceOf(lenderAAddress), {
              gasLimit: 5000000,
            });
          const afterBalance = await pstETH.scaledBalanceOf(lenderAAddress);

          expect(beforeBalance.toString()).to.be.equal(afterBalance.toString());
        });
      });

      describe("when lenderA deposits 1000 StETH, transfers more than he has", function () {
        it("should update balances correctly", async () => {
          const {pool, dai, stETH} = testEnv;

          await stETH
            .connect(lenderA.signer)
            .approve(pool.address, await fxtPt(stETH, "1000"));
          await pool
            .connect(lenderA.signer)
            .supply(
              stETH.address,
              await fxtPt(stETH, "1000"),
              lenderAAddress,
              "0"
            );

          await dai["mint(uint256)"](await fxtPt(dai, "200000"));
          await dai.transfer(borrowerAAddress, await fxtPt(dai, "200000"));
          await dai
            .connect(borrowerA.signer)
            .approve(pool.address, await fxtPt(dai, "200000"));
          await pool
            .connect(borrowerA.signer)
            .supply(
              dai.address,
              await fxtPt(dai, "200000"),
              borrowerAAddress,
              "0"
            );

          await pool
            .connect(borrowerA.signer)
            .borrow(
              stETH.address,
              await fxtPt(stETH, "139"),
              "0",
              borrowerAAddress
            );

          await expect(
            pstETH
              .connect(lenderA.signer)
              .transfer(lenderAAddress, await fxtPt(stETH, "1001"))
          ).to.be.reverted;
        });
      });
    });
  });

  describe("user deposit", function () {
    describe("first deposit", function () {
      it("should mint correct number of pstETH tokens", async () => {
        const {pool, stETH} = testEnv;

        await checkBal(stETH, lenderAAddress, "100000");
        await checkBal(pstETH, lenderAAddress, "0");
        await checkBal(stETH, reserveData.xTokenAddress, "0");
        await checkSupply(pstETH, "0");

        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1000"));
        await pool
          .connect(lenderA.signer)
          .supply(
            stETH.address,
            await fxtPt(stETH, "1000"),
            lenderAAddress,
            "0"
          );

        expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
          await fxtPt(stETH, "1000")
        );

        await checkBal(stETH, lenderAAddress, "99000");
        await checkBal(pstETH, lenderAAddress, "1000");
        await checkBal(stETH, reserveData.xTokenAddress, "1000");
        await checkSupply(pstETH, "1000");
      });
    });

    it("should update balances after positive rebase", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "1000"));
      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "1000"), lenderAAddress, "0");

      await checkBal(stETH, lenderAAddress, "99000");
      await checkBal(pstETH, lenderAAddress, "1000");
      await checkBal(stETH, reserveData.xTokenAddress, "1000");
      await checkSupply(pstETH, "1000");

      await rebase(pool, stETH, 0.1); // + 10%

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "1100")
      );

      await checkBal(stETH, lenderAAddress, "108900");
      await checkBal(pstETH, lenderAAddress, "1100");
      await checkBal(stETH, reserveData.xTokenAddress, "1100");
      await checkSupply(pstETH, "1100");
    });

    it("should update balances after negative rebase", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "1000"));
      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "1000"), lenderAAddress, "0");

      await checkBal(stETH, lenderAAddress, "99000");
      await checkBal(pstETH, lenderAAddress, "1000");
      await checkBal(stETH, reserveData.xTokenAddress, "1000");
      await checkSupply(pstETH, "1000");

      await rebase(pool, stETH, -0.1); // - 10%

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "900")
      );

      await checkBal(stETH, lenderAAddress, "89100");
      await checkBal(pstETH, lenderAAddress, "900");
      await checkBal(stETH, reserveData.xTokenAddress, "900");
      await checkSupply(pstETH, "900");
    });

    it("should update balances after neutral rebase", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "1000"));
      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "1000"), lenderAAddress, "0");

      await checkBal(stETH, lenderAAddress, "99000");
      await checkBal(pstETH, lenderAAddress, "1000");
      await checkBal(stETH, reserveData.xTokenAddress, "1000");
      await checkSupply(pstETH, "1000");

      await rebase(pool, stETH, 0);

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "1000")
      );

      await checkBal(stETH, lenderAAddress, "99000");
      await checkBal(pstETH, lenderAAddress, "1000");
      await checkBal(stETH, reserveData.xTokenAddress, "1000");
      await checkSupply(pstETH, "1000");
    });
  });

  describe("lone user", function () {
    it("should mint correct number of pstETH tokens", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "11000"));
      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "1000"), lenderAAddress, "0");

      await checkBal(stETH, lenderAAddress, "99000");
      await checkBal(pstETH, lenderAAddress, "1000");
      await checkBal(stETH, reserveData.xTokenAddress, "1000");
      await checkSupply(pstETH, "1000");

      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "11000")
      );

      await checkBal(stETH, lenderAAddress, "89000");
      await checkBal(pstETH, lenderAAddress, "11000");
      await checkBal(stETH, reserveData.xTokenAddress, "11000");
      await checkSupply(pstETH, "11000");
    });

    it("should update balances after positive rebase", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "11000"));
      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "1000"), lenderAAddress, "0");
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      await checkBal(stETH, lenderAAddress, "89000");
      await checkBal(pstETH, lenderAAddress, "11000");
      await checkBal(stETH, reserveData.xTokenAddress, "11000");
      await checkSupply(pstETH, "11000");

      await rebase(pool, stETH, +0.1);

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "12100")
      );

      await checkBal(stETH, lenderAAddress, "97900");
      await checkBal(pstETH, lenderAAddress, "12100");
      await checkBal(stETH, reserveData.xTokenAddress, "12100");
      await checkSupply(pstETH, "12100");
    });

    it("should update balances after negative rebase", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "11000"));
      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "1000"), lenderAAddress, "0");
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      await checkBal(stETH, lenderAAddress, "89000");
      await checkBal(pstETH, lenderAAddress, "11000");
      await checkBal(stETH, reserveData.xTokenAddress, "11000");
      await checkSupply(pstETH, "11000");

      await rebase(pool, stETH, -0.1);

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "9900")
      );

      await checkBal(stETH, lenderAAddress, "80100");
      await checkBal(pstETH, lenderAAddress, "9900");
      await checkBal(stETH, reserveData.xTokenAddress, "9900");
      await checkSupply(pstETH, "9900");
    });
  });

  describe("many users", function () {
    it("should mint correct number of pstETH tokens", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));

      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "30000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      await checkBal(stETH, lenderAAddress, "70000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "30000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "35350");
      await checkSupply(pstETH, "35350");

      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "3000"), lenderAAddress, "0");

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "33000")
      );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "38350");
      await checkSupply(pstETH, "38350");
    });

    it("should update balances after positive rebase", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));

      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "30000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "3000"), lenderAAddress, "0");

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "33000")
      );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "38350");
      await checkSupply(pstETH, "38350");

      await rebase(pool, stETH, +0.1);

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "36300")
      );

      await checkBal(stETH, lenderAAddress, "73700");
      await checkBal(stETH, lenderBAddress, "104500");
      await checkBal(stETH, lenderCAddress, "109615");
      await checkBal(pstETH, lenderAAddress, "36300");
      await checkBal(pstETH, lenderBAddress, "5500");
      await checkBal(pstETH, lenderCAddress, "385");
      await checkBal(stETH, reserveData.xTokenAddress, "42185");
      await checkSupply(pstETH, "42185");
    });

    it("should update balances after negative rebase", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));

      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "30000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "3000"), lenderAAddress, "0");

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "33000")
      );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "38350");
      await checkSupply(pstETH, "38350");

      await rebase(pool, stETH, -0.1);

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "29700")
      );

      await checkBal(stETH, lenderAAddress, "60300");
      await checkBal(stETH, lenderBAddress, "85500");
      await checkBal(stETH, lenderCAddress, "89685");
      await checkBal(pstETH, lenderAAddress, "29700");
      await checkBal(pstETH, lenderBAddress, "4500");
      await checkBal(pstETH, lenderCAddress, "315");
      await checkBal(stETH, reserveData.xTokenAddress, "34515");
      await checkSupply(pstETH, "34515");
    });
  });

  describe("v large deposit", function () {
    it("should mint correct number of pstETH tokens", async () => {
      const {deployer, pool, stETH} = testEnv;

      await stETH
        .connect(deployer.signer)
        .transfer(lenderAAddress, await fxtPt(stETH, "100000"));
      await rebase(pool, stETH, 9999);

      await checkSupply(stETH, "10000000000000");

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "1000000000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "500000000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "500000000"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "1000000000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "500000000"),
          lenderBAddress,
          "0"
        );
      await pool
        .connect(lenderC.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "500000000"),
          lenderCAddress,
          "0"
        );

      await checkBal(stETH, lenderAAddress, "1000000000", 10000);
      await checkBal(stETH, lenderBAddress, "500000000", 10000);
      await checkBal(stETH, lenderCAddress, "500000000", 10000);
      await checkBal(pstETH, lenderAAddress, "1000000000", 10000);
      await checkBal(stETH, reserveData.xTokenAddress, "2000000000", 10000);
      await checkSupply(pstETH, "2000000000", 10000);

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "10"));
      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "10"), lenderAAddress, "0");

      expect(await pstETH.balanceOf(lenderAAddress)).to.eq(
        await fxtPt(stETH, "1000000010")
      );

      await checkBal(stETH, lenderAAddress, "999999990");
      await checkBal(stETH, lenderBAddress, "500000000", 10000);
      await checkBal(stETH, lenderCAddress, "500000000", 10000);
      await checkBal(pstETH, lenderAAddress, "1000000010");
      await checkBal(stETH, reserveData.xTokenAddress, "2000000010", 10000);
      await checkSupply(pstETH, "2000000010", 10000);
    });
  });

  describe("when borrow>0", function () {
    it("should mint correct number of pstETH tokens", async () => {
      const {deployer, dai, pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "400"));

      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "30000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      // borrower borrows 2500 StETH
      await dai
        .connect(deployer.signer)
        ["mint(uint256)"](await fxtPt(dai, "20000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "20000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "20000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "20000000"),
          borrowerAAddress,
          "0"
        );
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "2500"),
          "0",
          borrowerAAddress
        );

      await checkBal(stETH, lenderAAddress, "70000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "30000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "32850");
      await checkSupply(pstETH, "35350");

      await pool
        .connect(lenderA.signer)
        .supply(stETH.address, await fxtPt(stETH, "3000"), lenderAAddress, "0");

      expect(await pstETH.balanceOf(lenderAAddress)).to.be.gte(
        await fxtPt(stETH, "33000")
      );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "35850");
      await checkSupply(pstETH, "38350");
    });

    it("should update balances on positive rebase", async () => {
      const {deployer, dai, pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "33000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      await dai
        .connect(deployer.signer)
        ["mint(uint256)"](await fxtPt(dai, "20000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "20000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "20000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "20000000"),
          borrowerAAddress,
          "0"
        );
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "2500"),
          "0",
          borrowerAAddress
        );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "35850");
      await checkSupply(pstETH, "38350");

      await rebase(pool, stETH, +0.1);

      await checkBal(stETH, lenderAAddress, "73700");
      await checkBal(stETH, lenderBAddress, "104500");
      await checkBal(stETH, lenderCAddress, "109615");
      await checkBal(pstETH, lenderAAddress, "36300");
      await checkBal(pstETH, lenderBAddress, "5500");
      await checkBal(pstETH, lenderCAddress, "385");
      await checkBal(stETH, reserveData.xTokenAddress, "39435");

      await checkSupply(pstETH, "42185");
    });

    it("should update balances on negative rebase", async () => {
      const {deployer, dai, pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "33000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      await dai
        .connect(deployer.signer)
        ["mint(uint256)"](await fxtPt(dai, "2000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "2000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "2000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "2000000"),
          borrowerAAddress,
          "0"
        );
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "1399"),
          "0",
          borrowerAAddress
        );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "36951");
      await checkSupply(pstETH, "38350");

      await rebase(pool, stETH, -0.1);

      await checkBal(stETH, lenderAAddress, "60300");
      await checkBal(stETH, lenderBAddress, "85500");
      await checkBal(stETH, lenderCAddress, "89685");
      await checkBal(pstETH, lenderAAddress, "29700");
      await checkBal(pstETH, lenderBAddress, "4500");
      await checkBal(pstETH, lenderCAddress, "315");
      await checkBal(stETH, reserveData.xTokenAddress, "33255.9");

      await checkSupply(pstETH, "34515");
    });
  });

  describe("user withdraw", function () {
    describe("single deposit partial withdraw", function () {
      it("should burn correct number of pstETH tokens", async () => {
        const {pool, stETH} = testEnv;

        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1000"));
        await pool
          .connect(lenderA.signer)
          .supply(
            stETH.address,
            await fxtPt(stETH, "1000"),
            lenderAAddress,
            "0"
          );

        await checkBal(stETH, lenderAAddress, "99000");
        await checkBal(pstETH, lenderAAddress, "1000");
        await checkBal(stETH, reserveData.xTokenAddress, "1000");
        await checkSupply(pstETH, "1000");

        await pool
          .connect(lenderA.signer)
          .withdraw(stETH.address, await fxtPt(stETH, "100"), lenderAAddress);

        await checkBal(stETH, lenderAAddress, "99100");
        await checkBal(pstETH, lenderAAddress, "900");
        await checkBal(stETH, reserveData.xTokenAddress, "900");
        await checkSupply(pstETH, "900");
      });
    });

    describe("single deposit full withdraw", function () {
      it("should burn correct number of pstETH tokens", async () => {
        const {pool, stETH} = testEnv;

        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1000"));
        await pool
          .connect(lenderA.signer)
          .supply(
            stETH.address,
            await fxtPt(stETH, "1000"),
            lenderAAddress,
            "0"
          );

        await checkBal(stETH, lenderAAddress, "99000");
        await checkBal(pstETH, lenderAAddress, "1000");
        await checkBal(stETH, reserveData.xTokenAddress, "1000");
        await checkSupply(pstETH, "1000");

        await pool
          .connect(lenderA.signer)
          .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

        await checkBal(stETH, lenderAAddress, "100000");
        await checkBal(pstETH, lenderAAddress, "0");
        await checkBal(stETH, reserveData.xTokenAddress, "0");
        await checkSupply(pstETH, "0");
      });

      it("should burn correct number of pstETH positive rebase", async () => {
        const {pool, stETH} = testEnv;

        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1000"));
        await pool
          .connect(lenderA.signer)
          .supply(
            stETH.address,
            await fxtPt(stETH, "1000"),
            lenderAAddress,
            "0"
          );

        await checkBal(stETH, lenderAAddress, "99000");
        await checkBal(pstETH, lenderAAddress, "1000");
        await checkBal(stETH, reserveData.xTokenAddress, "1000");
        await checkSupply(pstETH, "1000");

        await rebase(pool, stETH, 0.1); // + 10%
        await pool
          .connect(lenderA.signer)
          .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

        await checkBal(stETH, lenderAAddress, "110000");
        await checkBal(pstETH, lenderAAddress, "0");
        await checkBal(stETH, reserveData.xTokenAddress, "0");
        await checkSupply(pstETH, "0");
      });

      it("should burn correct number of pstETH negative rebase", async () => {
        const {pool, stETH} = testEnv;

        await stETH
          .connect(lenderA.signer)
          .approve(pool.address, await fxtPt(stETH, "1000"));
        await pool
          .connect(lenderA.signer)
          .supply(
            stETH.address,
            await fxtPt(stETH, "1000"),
            lenderAAddress,
            "0"
          );

        await checkBal(stETH, lenderAAddress, "99000");
        await checkBal(pstETH, lenderAAddress, "1000");
        await checkBal(stETH, reserveData.xTokenAddress, "1000");
        await checkSupply(pstETH, "1000");

        await rebase(pool, stETH, -0.1); // - 10%
        await pool
          .connect(lenderA.signer)
          .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

        await checkBal(stETH, lenderAAddress, "90000");
        await checkBal(pstETH, lenderAAddress, "0");
        await checkBal(stETH, reserveData.xTokenAddress, "0");
        await checkSupply(pstETH, "0");
      });
    });
  });

  describe("lone user multiple withdraws", function () {
    it("should burn correct number of pstETH tokens", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "10000"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      await checkBal(stETH, lenderAAddress, "90000");
      await checkBal(pstETH, lenderAAddress, "10000");
      await checkBal(stETH, reserveData.xTokenAddress, "10000");
      await checkSupply(pstETH, "10000");

      await pool
        .connect(lenderA.signer)
        .withdraw(stETH.address, await fxtPt(stETH, "1000"), lenderAAddress);

      await checkBal(stETH, lenderAAddress, "91000");
      await checkBal(pstETH, lenderAAddress, "9000");
      await checkBal(stETH, reserveData.xTokenAddress, "9000");
      await checkSupply(pstETH, "9000");

      await advanceTimeAndBlock(3600 * 24 * 365); // 1 year
      await pool
        .connect(lenderA.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

      await checkBal(stETH, lenderAAddress, "100000");
      await checkBal(pstETH, lenderAAddress, "0");
      await checkBal(stETH, reserveData.xTokenAddress, "0");
      await checkSupply(pstETH, "0");
    });
  });

  describe("multiple withdraws", function () {
    it("should burn correct number of pstETH tokens", async () => {
      const {pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));

      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "30000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      await checkBal(stETH, lenderAAddress, "70000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "30000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "35350");
      await checkSupply(pstETH, "35350");

      await pool
        .connect(lenderC.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderCAddress);
      await pool
        .connect(lenderB.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderBAddress);
      await pool
        .connect(lenderA.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

      await checkBal(stETH, lenderAAddress, "100000");
      await checkBal(stETH, lenderBAddress, "100000");
      await checkBal(stETH, lenderCAddress, "100000");
      await checkBal(pstETH, lenderAAddress, "0");
      await checkBal(pstETH, lenderBAddress, "0");
      await checkBal(pstETH, lenderCAddress, "0");
      await checkBal(stETH, reserveData.xTokenAddress, "0");
      await checkSupply(pstETH, "0");
    });
  });

  describe("v large withdraw", function () {
    it("should burn correct number of pstETH tokens", async () => {
      const {deployer, pool, stETH} = testEnv;

      await stETH
        .connect(deployer.signer)
        .transfer(lenderAAddress, await fxtPt(stETH, "100000"));
      await rebase(pool, stETH, 9999);

      await checkSupply(stETH, "10000000000000");

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "1000000000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "500000000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "500000000"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "1000000000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "500000000"),
          lenderBAddress,
          "0"
        );
      await pool
        .connect(lenderC.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "500000000"),
          lenderCAddress,
          "0"
        );

      await checkBal(stETH, lenderAAddress, "1000000000", 10000);
      await checkBal(stETH, lenderBAddress, "500000000", 10000);
      await checkBal(stETH, lenderCAddress, "500000000", 10000);
      await checkBal(pstETH, lenderAAddress, "1000000000", 10000);
      await checkBal(stETH, reserveData.xTokenAddress, "2000000000", 10000);
      await checkSupply(pstETH, "2000000000", 10000);

      await pool
        .connect(lenderA.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

      await checkBal(stETH, lenderAAddress, "2000000000", 10000);
      await checkBal(stETH, lenderBAddress, "500000000", 10000);
      await checkBal(stETH, lenderCAddress, "500000000", 10000);
      await checkBal(pstETH, lenderAAddress, "0");
      await checkBal(stETH, reserveData.xTokenAddress, "1000000000", 10000);
      await checkSupply(pstETH, "1000000000", 10000);
    });
  });

  describe("when borrow>0", function () {
    it("should burn correct number of pstETH tokens", async () => {
      const {deployer, dai, pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "33000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      // borrower borrows 2500 StETH
      await dai
        .connect(deployer.signer)
        ["mint(uint256)"](await fxtPt(dai, "2000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "2000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "2000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "2000000"),
          borrowerAAddress,
          "0"
        );
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "1399"),
          "0",
          borrowerAAddress
        );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "36951");
      await checkSupply(pstETH, "38350");

      await pool
        .connect(lenderC.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderCAddress);

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "100000");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "0");
      await checkBal(stETH, reserveData.xTokenAddress, "36601");
      await checkSupply(pstETH, "38000");
    });

    it("should update balances on positive rebase", async () => {
      const {deployer, dai, pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "33000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      // borrower borrows 1399 StETH
      await dai
        .connect(deployer.signer)
        ["mint(uint256)"](await fxtPt(dai, "2000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "2000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "2000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "2000000"),
          borrowerAAddress,
          "0"
        );

      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "1399"),
          "0",
          borrowerAAddress
        );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "36951");
      await checkSupply(pstETH, "38350");

      await rebase(pool, stETH, +0.1);
      await pool
        .connect(lenderC.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderCAddress);

      await checkBal(stETH, lenderAAddress, "73700");
      await checkBal(stETH, lenderBAddress, "104500");
      await checkBal(stETH, lenderCAddress, "110000");
      await checkBal(pstETH, lenderAAddress, "36300");
      await checkBal(pstETH, lenderBAddress, "5500");
      await checkBal(pstETH, lenderCAddress, "0");
      await checkBal(stETH, reserveData.xTokenAddress, "40261.1");
      await checkSupply(pstETH, "41800");
    });

    it("should update balances on negative rebase", async () => {
      const {deployer, dai, pool, stETH} = testEnv;

      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "33000"));
      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "350"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "33000"),
          lenderAAddress,
          "0"
        );
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "350"), lenderCAddress, "0");

      // borrower borrows 1399 StETH
      await dai
        .connect(deployer.signer)
        ["mint(uint256)"](await fxtPt(dai, "2000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "2000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "2000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "2000000"),
          borrowerAAddress,
          "0"
        );
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "1399"),
          "0",
          borrowerAAddress
        );

      await checkBal(stETH, lenderAAddress, "67000");
      await checkBal(stETH, lenderBAddress, "95000");
      await checkBal(stETH, lenderCAddress, "99650");
      await checkBal(pstETH, lenderAAddress, "33000");
      await checkBal(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "350");
      await checkBal(stETH, reserveData.xTokenAddress, "36951");
      await checkSupply(pstETH, "38350");

      await rebase(pool, stETH, -0.1);
      await pool
        .connect(lenderC.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderCAddress);

      await checkBal(stETH, lenderAAddress, "60300");
      await checkBal(stETH, lenderBAddress, "85500");
      await checkBal(stETH, lenderCAddress, "90000");
      await checkBal(pstETH, lenderAAddress, "29700");
      await checkBal(pstETH, lenderBAddress, "4500");
      await checkBal(pstETH, lenderCAddress, "0");
      await checkBal(stETH, reserveData.xTokenAddress, "32940.9");
      await checkSupply(pstETH, "34200");
    });
  });

  describe("user borrow repay with interest", function () {
    it("should update accounting", async () => {
      const {pool, dai, stETH} = testEnv;

      // lender deposits StETH
      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "10000"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      // borrower deposits DAI
      await dai["mint(uint256)"](await fxtPt(dai, "2000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "2000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "2000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "2000000"),
          borrowerAAddress,
          "0"
        );

      await checkBal(stETH, lenderAAddress, "90000");
      await checkBal(pstETH, lenderAAddress, "10000");
      await checkSupply(pstETH, "10000");
      await checkBal(stETH, reserveData.xTokenAddress, "10000");
      await checkBal(stETH, borrowerAAddress, "0");
      await checkBal(debtToken, borrowerAAddress, "0");

      // borrower borrows StETH
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "1399"),
          "0",
          borrowerAAddress
        );

      await checkBal(stETH, lenderAAddress, "90000");
      await checkBal(pstETH, lenderAAddress, "10000");
      await checkSupply(pstETH, "10000");
      await checkBal(stETH, reserveData.xTokenAddress, "8601");
      await checkBal(stETH, borrowerAAddress, "1399");
      await checkBal(debtToken, borrowerAAddress, "1399");

      await advanceTimeAndBlock(10 * 3600 * 24 * 365); // 10 years

      await checkBal(stETH, lenderAAddress, "90000");
      await checkScaledBal(pstETH, lenderAAddress, "10000"); // P = 7500 + 2500
      await checkBalGt(pstETH, lenderAAddress, "10000"); // T = P + delta (I) > 10000
      await checkSupplyGt(pstETH, "10000");
      await checkBal(stETH, reserveData.xTokenAddress, "8601"); // unborrowed pool balance
      await checkBal(stETH, borrowerAAddress, "1399"); // borrower StETH balance
      await checkBalGt(debtToken, borrowerAAddress, "1399"); // 1399 (principal) + delta (I)
      await checkBal(pstETH, treasuryAddress, "0");

      // borrower gets some StETH to close out debt
      await stETH
        .connect(lenderC.signer)
        .transfer(borrowerAAddress, await fxtPt(stETH, "1500"));
      await checkBal(stETH, borrowerAAddress, "2899", 1);

      // borrower repays 1399 + delta (borrowed interest) StETH
      await stETH
        .connect(borrowerA.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(borrowerA.signer)
        .repay(stETH.address, MAX_UINT_AMOUNT, borrowerAAddress);

      await checkBal(stETH, lenderAAddress, "90000");
      await checkBalGt(pstETH, lenderAAddress, "10000");
      await checkSupplyGt(pstETH, "10000");
      await checkBalGt(stETH, reserveData.xTokenAddress, "10000");
      await checkBalGt(stETH, borrowerAAddress, "0");
      await checkBal(debtToken, borrowerAAddress, "0");
      await checkBal(pstETH, treasuryAddress, "0");

      const stETHBefore = await fxtPt(stETH, "90000");
      const lenderANewBalance = (await pstETH.balanceOf(lenderAAddress)).add(
        stETHBefore
      );

      await pool
        .connect(lenderA.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

      const lenderBalanceActual = await stETH.balanceOf(lenderAAddress);

      await check(lenderANewBalance, lenderBalanceActual, stETH, 0.01);
      await checkBal(pstETH, lenderAAddress, "0");

      await checkSupply(pstETH, "0");
      const treasuryAmount = await pstETH.balanceOf(treasuryAddress);
      const pstETHTotalSupply = await pstETH.totalSupply();
      await check(pstETHTotalSupply, treasuryAmount, pstETH, 0.01);

      await checkBalGt(stETH, reserveData.xTokenAddress, "0");
      await checkBal(pstETH, treasuryAddress, "0");
    });
  });

  describe("user borrow repay with positive rebase", function () {
    it("should update accounting", async () => {
      const {pool, dai, stETH} = testEnv;

      // lender deposits StETH
      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "10000"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      // borrower deposits DAI
      await dai["mint(uint256)"](await fxtPt(dai, "2000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "2000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "2000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "2000000"),
          borrowerAAddress,
          "0"
        );

      // borrower borrows StETH
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "1399"),
          "0",
          borrowerAAddress
        );

      await advanceTimeAndBlock(1 * 3600 * 24 * 365); // 10 years

      await rebase(pool, stETH, +0.25); // 25% rebase

      await checkBal(stETH, lenderAAddress, "112500");
      await checkScaledBal(pstETH, lenderAAddress, "12500");
      await checkBalGt(pstETH, lenderAAddress, "12500");
      await checkSupplyGt(pstETH, "12500");
      await checkBal(stETH, reserveData.xTokenAddress, "10751.25");
      await checkBal(stETH, borrowerAAddress, "1748.75"); // Borrowed StETH balance
      await checkBalGt(debtToken, borrowerAAddress, "1748.75");
      await checkBal(pstETH, treasuryAddress, "0"); // Treasury

      // borrower gets some StETH to close out debt
      await stETH
        .connect(lenderC.signer)
        .transfer(borrowerAAddress, await fxtPt(stETH, "1500"));
      await checkBal(stETH, borrowerAAddress, "3248.75", 1);

      // borrower repays 1399 + (borrowed interest) StETH
      await stETH
        .connect(borrowerA.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(borrowerA.signer)
        .repay(stETH.address, MAX_UINT_AMOUNT, borrowerAAddress, {
          gasLimit: 5000000,
        });

      await checkBal(stETH, lenderAAddress, "112500");
      await checkScaledBal(pstETH, lenderAAddress, "12500");
      await checkBalGt(pstETH, lenderAAddress, "12500");
      await checkSupplyGt(pstETH, "12500");
      await checkBalGt(stETH, reserveData.xTokenAddress, "12500");
      await checkBalGt(stETH, borrowerAAddress, "1469.6299");
      await checkBal(debtToken, borrowerAAddress, "0");
      await checkBal(pstETH, treasuryAddress, "0");

      const stETHBefore = await stETH.balanceOf(lenderAAddress);
      const expectedStETHAfter = (await pstETH.balanceOf(lenderAAddress)).add(
        stETHBefore
      );

      await pool.connect(lenderA.signer).withdraw(
        stETH.address,
        // await fxtPt(stETH, '12090'),
        MAX_UINT_AMOUNT,
        lenderAAddress,
        {
          gasLimit: 5000000,
        }
      );

      const stETHAfter = await stETH.balanceOf(lenderAAddress);

      await check(stETHAfter, expectedStETHAfter, stETH, 0.01);
      await checkScaledBal(pstETH, lenderAAddress, "0");
      await checkBal(pstETH, lenderAAddress, "0");

      const treasuryAmount = await pstETH.balanceOf(treasuryAddress);
      const pstETHTotalSupply = await pstETH.totalSupply();
      await check(pstETHTotalSupply, treasuryAmount, pstETH, 0.01);

      await checkBalGt(stETH, reserveData.xTokenAddress, "0");
      await checkBalGt(stETH, borrowerAAddress, "0");
      await checkBal(debtToken, borrowerAAddress, "0");
      await checkBal(pstETH, treasuryAddress, "0");
    });
  });

  describe("user borrow repay with negative rebase", function () {
    it("should update accounting", async () => {
      const {pool, dai, stETH} = testEnv;

      // lender deposits StETH
      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "10000"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      // borrower deposits DAI
      await dai["mint(uint256)"](await fxtPt(dai, "20000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "20000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "20000000"));
      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "20000000"),
          borrowerAAddress,
          "0"
        );

      // borrower borrows StETH
      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "1399"),
          "0",
          borrowerAAddress
        );

      await advanceTimeAndBlock(1 * 3600 * 24 * 365); // 10 years
      await rebase(pool, stETH, -0.25); // -25% rebase

      await checkBal(stETH, lenderAAddress, "67500.00");
      await checkScaledBal(pstETH, lenderAAddress, "7500");
      await checkBalGt(pstETH, lenderAAddress, "7500");
      await checkSupplyGt(pstETH, "7500");
      await checkBal(stETH, reserveData.xTokenAddress, "6450.75"); // unborrowed principal balance
      await checkBal(stETH, borrowerAAddress, "1049.25"); // Borrowed StETH balance
      await checkBalGt(debtToken, borrowerAAddress, "1049.25"); // 1049.25 (principal) + delta (I)
      await checkBal(pstETH, treasuryAddress, "0"); // Treasury

      // friend sends borrower some stETH to pay back interest
      await stETH
        .connect(lenderC.signer)
        .transfer(borrowerAAddress, await fxtPt(stETH, "1000"));

      // borrower repays 1399 + (borrowed interest) StETH
      await stETH
        .connect(borrowerA.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(borrowerA.signer)
        .repay(stETH.address, MAX_UINT_AMOUNT, borrowerAAddress);

      await checkBal(stETH, lenderAAddress, "67500.00");
      await checkScaledBal(pstETH, lenderAAddress, "7500");
      await checkBalGt(pstETH, lenderAAddress, "7500");
      await checkSupplyGt(pstETH, "7500");
      await checkBalGt(stETH, reserveData.xTokenAddress, "7518.222");
      await checkBalGt(stETH, borrowerAAddress, "0");
      await checkBal(debtToken, borrowerAAddress, "0");
      await checkBal(pstETH, treasuryAddress, "0");

      const stETHBefore = await stETH.balanceOf(lenderAAddress);
      const expectedStETHAfter = (await pstETH.balanceOf(lenderAAddress)).add(
        stETHBefore
      );

      await pool
        .connect(lenderA.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress);

      const stETHAfter = await stETH.balanceOf(lenderAAddress);

      await check(stETHAfter, expectedStETHAfter, stETH, 0.01);
      await checkScaledBal(pstETH, lenderAAddress, "0");
      await checkBal(pstETH, lenderAAddress, "0");

      await checkSupply(pstETH, "0");
      const treasuryAmount = await pstETH.balanceOf(treasuryAddress);
      const pstETHTotalSupply = await pstETH.totalSupply();
      await check(pstETHTotalSupply, treasuryAmount, pstETH, 0.01);

      await checkBalGt(stETH, reserveData.xTokenAddress, "0");
      await checkBalGt(stETH, borrowerAAddress, "0");
      await checkBal(debtToken, borrowerAAddress, "0");
      await checkBal(pstETH, treasuryAddress, "0");
    });
  });

  describe("multi user borrow repay", function () {
    it("should update accounting", async () => {
      const {pool, dai, stETH} = testEnv;

      // lender deposits StETH
      await stETH
        .connect(lenderA.signer)
        .approve(pool.address, await fxtPt(stETH, "10000"));
      await pool
        .connect(lenderA.signer)
        .supply(
          stETH.address,
          await fxtPt(stETH, "10000"),
          lenderAAddress,
          "0"
        );

      await stETH
        .connect(lenderB.signer)
        .approve(pool.address, await fxtPt(stETH, "5000"));
      await pool
        .connect(lenderB.signer)
        .supply(stETH.address, await fxtPt(stETH, "5000"), lenderBAddress, "0");

      await stETH
        .connect(lenderC.signer)
        .approve(pool.address, await fxtPt(stETH, "2500"));
      await pool
        .connect(lenderC.signer)
        .supply(stETH.address, await fxtPt(stETH, "2500"), lenderCAddress, "0");

      // borrowers deposits DAI and borrow StETH
      await dai["mint(uint256)"](await fxtPt(dai, "1000000000"));
      await dai.transfer(borrowerAAddress, await fxtPt(dai, "30000000"));
      await dai.transfer(borrowerBAddress, await fxtPt(dai, "50000000"));
      await dai
        .connect(borrowerA.signer)
        .approve(pool.address, await fxtPt(dai, "30000000"));
      await dai
        .connect(borrowerB.signer)
        .approve(pool.address, await fxtPt(dai, "50000000"));

      await pool
        .connect(borrowerA.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "30000000"),
          borrowerAAddress,
          "0"
        );
      await pool
        .connect(borrowerB.signer)
        .supply(
          dai.address,
          await fxtPt(dai, "50000000"),
          borrowerBAddress,
          "0"
        );

      await pool
        .connect(borrowerA.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "2500"),
          "0",
          borrowerAAddress
        );

      await pool
        .connect(borrowerB.signer)
        .borrow(
          stETH.address,
          await fxtPt(stETH, "5000"),
          "0",
          borrowerBAddress
        );

      // time passes and supply changes
      await advanceTimeAndBlock(1 * 3600 * 24 * 365); // 1 year
      await rebase(pool, stETH, 0.5); // +50% rebase

      // borrower A repays
      await stETH
        .connect(lenderC.signer)
        .transfer(borrowerAAddress, await fxtPt(stETH, "1000"));
      await stETH
        .connect(borrowerA.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(borrowerA.signer)
        .repay(stETH.address, MAX_UINT_AMOUNT, borrowerAAddress);

      // time passes and supply changes
      await advanceTimeAndBlock(1 * 3600 * 24 * 365); // 1 year
      await rebase(pool, stETH, -0.05); // -5% rebase

      // borrower B repays
      await stETH
        .connect(lenderC.signer)
        .transfer(borrowerBAddress, await fxtPt(stETH, "1000"));
      await stETH
        .connect(borrowerB.signer)
        .approve(pool.address, MAX_UINT_AMOUNT);
      await pool
        .connect(borrowerB.signer)
        .repay(stETH.address, MAX_UINT_AMOUNT, borrowerBAddress);
      // lenders pull out
      await pool
        .connect(lenderC.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress, {
          gasLimit: 5000000,
        });
      await pool
        .connect(lenderA.signer)
        .withdraw(stETH.address, MAX_UINT_AMOUNT, lenderAAddress, {
          gasLimit: 5000000,
        });

      // time passes and supply changes
      await advanceTimeAndBlock(1 * 3600 * 24 * 365); // 1 year
      await rebase(pool, stETH, -0.1); // -10% rebase

      await checkBal(pstETH, lenderAAddress, "0");
      await checkBalGt(pstETH, lenderBAddress, "5000");
      await checkBal(pstETH, lenderCAddress, "0");
      await checkBal(debtToken, borrowerAAddress, "0");
      await checkBal(debtToken, borrowerBAddress, "0");

      const lenderBBalance = await pstETH.balanceOf(lenderBAddress);
      const treasuryAmount = await pstETH.balanceOf(treasuryAddress);
      const currentTotalSup = await pstETH.totalSupply();
      await check(
        currentTotalSup,
        lenderBBalance.add(treasuryAmount),
        pstETH,
        0.01
      );

      const balanceOfPstETH = await stETH.balanceOf(reserveData.xTokenAddress);
      await checkGt(balanceOfPstETH, currentTotalSup); // repaid interests

      await checkBal(pstETH, treasuryAddress, "0");
    });
  });
});
