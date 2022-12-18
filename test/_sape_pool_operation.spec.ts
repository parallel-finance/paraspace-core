import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {waitForTx} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";

import {ProtocolErrors} from "../helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {
  changePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {PTokenSApe} from "../types";
import {getPTokenSApe} from "../helpers/contracts-getters";

describe("SApe Pool Operation Test", () => {
  let testEnv: TestEnv;
  const sApeAddress = ONE_ADDRESS;
  let pSApeCoin: PTokenSApe;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {
      ape,
      users: [user1, depositor],
      protocolDataProvider,
      pool,
    } = testEnv;

    const {xTokenAddress: pSApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(sApeAddress);
    pSApeCoin = await getPTokenSApe(pSApeCoinAddress);

    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await supplyAndValidate(ape, "20000", depositor, true);

    return testEnv;
  };

  it("supply sApe is not allowed", async () => {
    const {
      users: [user1],
      pool,
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user1.signer).supply(sApeAddress, 111, user1.address, 0, {
        gasLimit: 12_450_000,
      })
    ).to.be.revertedWith(ProtocolErrors.SAPE_NOT_ALLOWED);
  });

  it("withdraw sApe is not allowed", async () => {
    const {
      users: [user1],
      ape,
      mayc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "10000", user1);

    const amount = await convertToCurrencyDecimals(ape.address, "5000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: amount}],
        []
      )
    );

    const balance = await pSApeCoin.balanceOf(user1.address);

    // HF = (51 * 0.7 + 5000 * 0.0036906841286 * 0.7) / (5000 * 0.0036906841286 ) = 2.6346006732655392383

    await expect(
      pool.connect(user1.signer).withdraw(sApeAddress, balance, user1.address, {
        gasLimit: 12_450_000,
      })
    ).to.be.revertedWith(ProtocolErrors.SAPE_NOT_ALLOWED);
  });

  it("borrow sApe is not allowed", async () => {
    const {
      users: [user1],
      pool,
    } = await loadFixture(fixture);

    await expect(
      pool.connect(user1.signer).borrow(sApeAddress, 111, 0, user1.address, {
        gasLimit: 12_450_000,
      })
    ).to.be.revertedWith(ProtocolErrors.BORROWING_NOT_ENABLED);
  });

  it("liquidate sApe is not allowed", async () => {
    const {
      users: [user1, liquidator],
      ape,
      mayc,
      pool,
      weth,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "10000", user1);

    const amount = await convertToCurrencyDecimals(ape.address, "5000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: amount}],
        []
      )
    );

    await supplyAndValidate(weth, "100", liquidator, true, "200000");

    // BorrowLimit: (51 * 0.325 + 5000 *  0.0036906841286 * 0.2 - 5000 * 0.0036906841286) = 1.8122634856
    const borrowAmount = await convertToCurrencyDecimals(weth.address, "1");
    expect(
      await pool
        .connect(user1.signer)
        .borrow(weth.address, borrowAmount, 0, user1.address)
    );

    // drop HF and ERC-721_HF below 1
    await changePriceAndValidate(mayc, "5");

    await expect(
      pool
        .connect(liquidator.signer)
        .liquidateERC20(
          weth.address,
          sApeAddress,
          user1.address,
          amount,
          false,
          {gasLimit: 5000000}
        )
    ).to.be.revertedWith(ProtocolErrors.SAPE_NOT_ALLOWED);
  });

  it("set sApe not as collateral is not allowed", async () => {
    const {
      users: [user1],
      ape,
      mayc,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(mayc, "1", user1, true);
    await mintAndValidate(ape, "10000", user1);

    const amount = await convertToCurrencyDecimals(ape.address, "5000");
    expect(
      await pool.connect(user1.signer).borrowApeAndStake(
        {
          nftAsset: mayc.address,
          borrowAsset: ape.address,
          borrowAmount: amount,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: amount}],
        []
      )
    );

    await expect(
      pool
        .connect(user1.signer)
        .setUserUseERC20AsCollateral(sApeAddress, false, {
          gasLimit: 12_450_000,
        })
    ).to.be.revertedWith(ProtocolErrors.SAPE_NOT_ALLOWED);
  });
});
