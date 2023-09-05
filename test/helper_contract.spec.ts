import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {AutoCompoundApe, HelperContract, PToken} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {mintAndValidate} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getHelperContract,
  getPToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT} from "../helpers/constants";
import {parseEther} from "ethers/lib/utils";
import {almostEqual} from "./helpers/uniswapv3-helper";
import {waitForTx} from "../helpers/misc-utils";
import {deployAutoCompoundApeImplAndAssignItToProxy} from "../helpers/contracts-deployments";
import {expect} from "chai";

describe("Helper contract Test", () => {
  let testEnv: TestEnv;
  let helperContract: HelperContract;
  let cApe: AutoCompoundApe;
  let pcApe: PToken;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {ape, users, apeCoinStaking, protocolDataProvider} = testEnv;

    const user1 = users[0];
    const user4 = users[5];

    helperContract = await getHelperContract();

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();
    const {xTokenAddress: pCApeAddress} =
      await protocolDataProvider.getReserveTokensAddresses(cApe.address);
    pcApe = await getPToken(pCApeAddress);

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    // user4 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user4.signer).deposit(user4.address, MINIMUM_LIQUIDITY)
    );

    return testEnv;
  };

  it("test convertApeCoinToPCApe and convertPCApeToApeCoin", async () => {
    const {
      users: [user1],
      ape,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "10000", user1);
    await waitForTx(
      await ape
        .connect(user1.signer)
        .approve(helperContract.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await helperContract
        .connect(user1.signer)
        .convertApeCoinToPCApe(parseEther("10000"))
    );
    const pcApeBalance = await pcApe.balanceOf(user1.address);
    almostEqual(pcApeBalance, parseEther("10000"));

    await waitForTx(
      await pcApe
        .connect(user1.signer)
        .approve(helperContract.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await helperContract
        .connect(user1.signer)
        .convertPCApeToApeCoin(pcApeBalance)
    );
    const apeBalance = await ape.balanceOf(user1.address);
    almostEqual(apeBalance, parseEther("10000"));
  });

  it("cApeMigration", async () => {
    const {
      users: [user1],
      ape,
    } = await loadFixture(fixture);

    await mintAndValidate(ape, "10000", user1);
    await waitForTx(
      await ape.connect(user1.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await cApe
        .connect(user1.signer)
        .deposit(user1.address, parseEther("10000"))
    );
    expect(await cApe.balanceOf(user1.address)).to.be.eq(parseEther("10000"));

    await waitForTx(
      await cApe
        .connect(user1.signer)
        .approve(helperContract.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await helperContract
        .connect(user1.signer)
        .cApeMigration(parseEther("10000"), user1.address)
    );
    expect(await cApe.balanceOf(user1.address)).to.be.eq(parseEther("10000"));
  });
});
