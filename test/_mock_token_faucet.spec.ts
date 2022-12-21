import {expect} from "chai";
import {getParaSpaceConfig, waitForTx} from "../helpers/misc-utils";
import {convertToCurrencyDecimals} from "../helpers/contracts-helpers";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";

describe("Mock Token Faucet", () => {
  let testEnv: TestEnv;

  let daiMintValue: string;
  let usdcMintValue: string;
  let usdtMintValue: string;
  let apeMintValue: string;
  let wBTCMintValue: string;
  let stETHMintValue: string;
  let baycMintValue: string;
  let maycMintValue: string;
  let doodleMintValue: string;
  let cryptoPunkMintValue: string;
  let tokenFaucetMintValue: {[key: string]: number} | undefined;

  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    tokenFaucetMintValue = getParaSpaceConfig().Mocks!.TokenFaucetMintValue;

    daiMintValue = tokenFaucetMintValue.DAI.toString();
    usdcMintValue = tokenFaucetMintValue.USDC.toString();
    usdtMintValue = tokenFaucetMintValue.USDT.toString();
    apeMintValue = tokenFaucetMintValue.APE.toString();
    wBTCMintValue = tokenFaucetMintValue.WBTC.toString();
    stETHMintValue = tokenFaucetMintValue.stETH.toString();
    baycMintValue = tokenFaucetMintValue.BAYC.toString();
    maycMintValue = tokenFaucetMintValue.MAYC.toString();
    doodleMintValue = tokenFaucetMintValue.DOODLE.toString();
    cryptoPunkMintValue = tokenFaucetMintValue.PUNKS.toString();
  });

  it("TC-mock-token-faucet-01 User mints all mock Tokens", async () => {
    const {
      mockTokenFaucet,
      dai,
      usdc,
      usdt,
      ape,
      wBTC,
      stETH,
      punks: punk,
      bayc,
      mayc,
      doodles,
      aWETH,
      users: [user1],
    } = testEnv;

    await waitForTx(
      await mockTokenFaucet.connect(user1.signer).mint(user1.address)
    );

    const daiBalance = await dai.balanceOf(user1.address);
    expect(daiBalance).to.be.equal(
      await convertToCurrencyDecimals(dai.address, daiMintValue)
    );

    const usdcBalance = await usdc.balanceOf(user1.address);
    expect(usdcBalance).to.be.equal(
      await convertToCurrencyDecimals(usdc.address, usdcMintValue)
    );

    const usdtBalance = await usdt.balanceOf(user1.address);
    expect(usdtBalance).to.be.equal(
      await convertToCurrencyDecimals(usdt.address, usdtMintValue)
    );

    const apeBalance = await ape.balanceOf(user1.address);
    expect(apeBalance).to.be.equal(
      await convertToCurrencyDecimals(ape.address, apeMintValue)
    );

    const wBTCBalance = await wBTC.balanceOf(user1.address);
    expect(wBTCBalance).to.be.equal(
      await convertToCurrencyDecimals(wBTC.address, wBTCMintValue)
    );

    const stETHBalance = await stETH.balanceOf(user1.address);
    expect(stETHBalance).to.be.equal(
      await convertToCurrencyDecimals(stETH.address, stETHMintValue)
    );
    const aWETHBalance = await aWETH.balanceOf(user1.address);
    expect(aWETHBalance).to.be.equal(
      await convertToCurrencyDecimals(aWETH.address, stETHMintValue)
    );

    const baycBalance = await bayc.balanceOf(user1.address);
    expect(baycBalance.toString()).to.be.equal(baycMintValue);

    const maycBalance = await mayc.balanceOf(user1.address);
    expect(maycBalance.toString()).to.be.equal(maycMintValue);

    const doodleBalance = await doodles.balanceOf(user1.address);
    expect(doodleBalance.toString()).to.be.equal(doodleMintValue);

    const punkBalance = await punk.balanceOf(user1.address);
    expect(punkBalance.toString()).to.be.equal(cryptoPunkMintValue);
  });

  it("TC-mock-token-faucet-02 Update ERC20 config and mint", async () => {
    const {
      mockTokenFaucet,
      dai,
      deployer,
      users: [user1],
    } = testEnv;

    await waitForTx(
      await mockTokenFaucet.connect(deployer.signer).addERC20([
        {
          name: "DAI",
          addr: dai.address,
          mintValue: 20000,
        },
      ])
    );

    const daiBalanceBefore = await dai.balanceOf(user1.address);

    await waitForTx(
      await mockTokenFaucet.connect(user1.signer).mint(user1.address)
    );

    const daiBalanceAfter = await dai.balanceOf(user1.address);

    expect(daiBalanceAfter).to.be.equal(
      daiBalanceBefore.add(
        await convertToCurrencyDecimals(dai.address, "20000")
      )
    );
  });

  it("TC-mock-token-faucet-03 Update ERC721 config and mint", async () => {
    const {
      mockTokenFaucet,
      bayc,
      deployer,
      users: [user1],
    } = testEnv;

    await waitForTx(
      await mockTokenFaucet.connect(deployer.signer).addERC721([
        {
          name: "BAYC",
          addr: bayc.address,
          mintValue: 4,
        },
      ])
    );

    const baycBalanceBefore = await bayc.balanceOf(user1.address);

    await waitForTx(
      await mockTokenFaucet.connect(user1.signer).mint(user1.address)
    );

    const baycBalanceAfter = await bayc.balanceOf(user1.address);

    expect(baycBalanceAfter.toNumber()).to.be.equal(
      baycBalanceBefore.toNumber() + 4
    );
  });

  it("TC-mock-token-faucet-04 Update PUNK config and mint", async () => {
    const {
      mockTokenFaucet,
      punks: punk,
      deployer,
      users: [user1],
    } = testEnv;

    await waitForTx(
      await mockTokenFaucet.connect(deployer.signer).updatePunk({
        name: "PUNKS",
        addr: punk.address,
        mintValue: 0,
      })
    );

    const punkBalanceBefore = await punk.balanceOf(user1.address);

    await waitForTx(
      await mockTokenFaucet.connect(user1.signer).mint(user1.address)
    );

    const punkBalanceAfter = await punk.balanceOf(user1.address);

    expect(punkBalanceAfter.toNumber()).to.be.equal(
      punkBalanceBefore.toNumber()
    );

    // await waitForTx(
    //   await mockTokenFaucet.connect(deployer.signer).updatePunk({
    //     name: "BAYC",
    //     addr: punk.address,
    //     mintValue: 50,
    //   })
    // );

    // // cost too much time
    // for (let index = 0; index < 200; index++) {
    //   await waitForTx(
    //     await mockTokenFaucet.connect(user1.signer).mint(user1.address)
    //   );
    // }

    // const punkBalanceAfter2 = await punk.balanceOf(user1.address);

    // expect(punkBalanceAfter2.toNumber()).to.be.equal(10000);
  });
});
