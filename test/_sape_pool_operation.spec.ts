import {expect} from "chai";
import {TestEnv} from "./helpers/make-suite";
import {waitForTx} from "../helpers/misc-utils";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";

import {ProtocolErrors} from "../helpers/types";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate, supplyAndValidate} from "./helpers/validated-steps";
import {ParaApeStaking, PTokenSApe} from "../types";
import {getParaApeStaking, getPTokenSApe} from "../helpers/contracts-getters";
import {parseEther} from "ethers/lib/utils";

describe("SApe Pool Operation Test", () => {
  let testEnv: TestEnv;
  const sApeAddress = ONE_ADDRESS;
  let pSApeCoin: PTokenSApe;
  let paraApeStaking: ParaApeStaking;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);

    const {
      ape,
      users: [user1, depositor],
      protocolDataProvider,
      pool,
    } = testEnv;

    paraApeStaking = await getParaApeStaking();

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
    await mintAndValidate(ape, "100000", user1);

    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(paraApeStaking.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await paraApeStaking.connect(user1.signer).depositApeCoinPool({
        onBehalf: user1.address,
        cashToken: ape.address,
        cashAmount: parseEther("100000"),
        isBAYC: false,
        tokenIds: [0],
      })
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
});
