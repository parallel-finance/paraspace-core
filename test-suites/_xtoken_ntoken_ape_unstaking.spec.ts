import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import {
  getMintableERC721,
  getPToken,
  getVariableDebtToken,
} from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {
  DRE,
  evmRevert,
  evmSnapshot,
  getDb,
  waitForTx,
} from "../deploy/helpers/misc-utils";
import {MintableERC721, PToken, VariableDebtToken} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";

import {
  borrowAndValidate,
  changePriceAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {ProtocolErrors} from "../deploy/helpers/types";

describe("APE Coin Unstaking", () => {
  let snap: string;
  let testEnv: TestEnv;
  let bakc: MintableERC721;
  let variableDebtApeCoin: VariableDebtToken;
  let pApeCoin: PToken;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      mayc,
      users: [user1, depositor],
      protocolDataProvider,
      nMAYC,
      pool,
    } = testEnv;
    const {
      xTokenAddress: pApeCoinAddress,
      variableDebtTokenAddress: variableDebtApeCoinAddress,
    } = await protocolDataProvider.getReserveTokensAddresses(ape.address || "");

    variableDebtApeCoin = await getVariableDebtToken(
      variableDebtApeCoinAddress
    );
    pApeCoin = await getPToken(pApeCoinAddress);

    await supplyAndValidate(ape, "20000", depositor, true);
    await changePriceAndValidate(ape, "0.001");

    await changePriceAndValidate(mayc, "50");

    const db = getDb();
    const address = db.get(`BAKC.${DRE.network.name}`).value()?.address;
    bakc = await getMintableERC721(address);
    await waitForTx(await bakc["mint(uint256,address)"]("1", user1.address));

    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await bakc.connect(user1.signer).setApprovalForAll(pool.address, true)
    );
  });

  beforeEach(async () => {
    snap = await evmSnapshot();
  });
  afterEach(async () => {
    await evmRevert(snap);
  });

  it("User 1 got unstaked from mayc pool and just need repay this debt", async () => {
    const {
      users: [user1, unstaker],
      ape,
      mayc,
      pool,
    } = testEnv;

    await supplyAndValidate(mayc, "1", user1, true);

    await borrowAndValidate(ape, "15000", user1);

    const amount = await convertToCurrencyDecimals(ape.address, "15000");
    expect(
      await pool
        .connect(user1.signer)
        .depositApeCoin(mayc.address, [{tokenId: 0, amount: amount}])
    );
    await expect(
      pool.connect(unstaker.signer).unstakeApePositionAndRepay(mayc.address, 0)
    ).to.be.revertedWith(ProtocolErrors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD);

    await changePriceAndValidate(ape, "0.01");

    let unstakerApeBalance = await ape.balanceOf(unstaker.address);
    expect(unstakerApeBalance).equal(0);

    await waitForTx(
      await pool
        .connect(unstaker.signer)
        .unstakeApePositionAndRepay(mayc.address, 0)
    );

    unstakerApeBalance = await ape.balanceOf(unstaker.address);
    expect(unstakerApeBalance).equal(amount.mul(3).div(1000));
    const apeDebt = await variableDebtApeCoin.balanceOf(user1.address);
    almostEqual(apeDebt, unstakerApeBalance);
  });

  it("User 1 got unstaked from mayc pool and need both repay this debt and supply", async () => {
    const {
      users: [user1, unstaker],
      ape,
      mayc,
      nMAYC,
      pool,
    } = testEnv;

    await supplyAndValidate(mayc, "1", user1, true);

    await borrowAndValidate(ape, "15000", user1);

    const cashAmount = await convertToCurrencyDecimals(ape.address, "5000");
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](user1.address, cashAmount)
    );

    const amount = await convertToCurrencyDecimals(ape.address, "20000");
    expect(
      await pool
        .connect(user1.signer)
        .depositApeCoin(mayc.address, [{tokenId: 0, amount: amount}])
    );

    await expect(
      pool.connect(unstaker.signer).unstakeApePositionAndRepay(mayc.address, 0)
    ).to.be.revertedWith(ProtocolErrors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD);

    await changePriceAndValidate(ape, "0.01");

    let unstakerApeBalance = await ape.balanceOf(unstaker.address);
    expect(unstakerApeBalance).equal(0);
    await waitForTx(
      await pool
        .connect(unstaker.signer)
        .unstakeApePositionAndRepay(mayc.address, 0)
    );
    unstakerApeBalance = await ape.balanceOf(unstaker.address);
    expect(unstakerApeBalance).equal(amount.mul(3).div(1000));

    const apeDebt = await variableDebtApeCoin.balanceOf(user1.address);
    almostEqual(apeDebt, 0);

    const apeDeposit = await pApeCoin.balanceOf(user1.address);
    almostEqual(
      apeDeposit,
      await convertToCurrencyDecimals(ape.address, "4940")
    );
  });

  it("User 1 got unstaked from mayc pool and bakc pool", async () => {
    const {
      users: [user1, unstaker],
      ape,
      mayc,
      nMAYC,
      pool,
    } = testEnv;

    await supplyAndValidate(mayc, "1", user1, true);

    await borrowAndValidate(ape, "15000", user1);

    const cashAmount = await convertToCurrencyDecimals(ape.address, "5000");
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](user1.address, cashAmount)
    );

    const amount = await convertToCurrencyDecimals(ape.address, "10000");
    expect(
      await pool
        .connect(user1.signer)
        .depositApeCoin(mayc.address, [{tokenId: 0, amount: amount}])
    );
    expect(await bakc.balanceOf(user1.address)).equal(1);
    expect(
      await pool
        .connect(user1.signer)
        .depositBAKC(mayc.address, [
          {mainTokenId: 0, bakcTokenId: 0, amount: amount},
        ])
    );
    expect(await bakc.balanceOf(user1.address)).equal(1);

    await expect(
      pool.connect(unstaker.signer).unstakeApePositionAndRepay(mayc.address, 0)
    ).to.be.revertedWith(ProtocolErrors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD);

    await changePriceAndValidate(ape, "0.01");

    let unstakerApeBalance = await ape.balanceOf(unstaker.address);
    expect(unstakerApeBalance).equal(0);
    await waitForTx(
      await pool
        .connect(unstaker.signer)
        .unstakeApePositionAndRepay(mayc.address, 0)
    );
    unstakerApeBalance = await ape.balanceOf(unstaker.address);
    expect(unstakerApeBalance).equal(amount.mul(6).div(1000));

    const apeDebt = await variableDebtApeCoin.balanceOf(user1.address);
    almostEqual(apeDebt, 0);

    const apeDeposit = await pApeCoin.balanceOf(user1.address);
    almostEqual(
      apeDeposit,
      await convertToCurrencyDecimals(ape.address, "4940")
    );
  });
});
