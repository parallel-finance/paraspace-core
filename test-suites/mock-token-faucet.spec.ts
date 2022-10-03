import {expect} from "chai";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {makeSuite} from "./helpers/make-suite";
import {MOCK_TOKEN_MINT_VALUE} from "../deploy/market-config";

makeSuite("Mock Token Faucet", (testEnv) => {
  it("User mint all mock Tokens", async () => {
    const {
      mockTokenFaucet,
      dai,
      usdc,
      usdt,
      ape,
      wBTC,
      stETH,
      punk,
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
      await convertToCurrencyDecimals(
        dai.address,
        MOCK_TOKEN_MINT_VALUE.DAI.toString()
      )
    );

    const usdcBalance = await usdc.balanceOf(user1.address);
    expect(usdcBalance).to.be.equal(
      await convertToCurrencyDecimals(
        usdc.address,
        MOCK_TOKEN_MINT_VALUE.USDC.toString()
      )
    );

    const usdtBalance = await usdt.balanceOf(user1.address);
    expect(usdtBalance).to.be.equal(
      await convertToCurrencyDecimals(
        usdt.address,
        MOCK_TOKEN_MINT_VALUE.USDT.toString()
      )
    );

    const apeBalance = await ape.balanceOf(user1.address);
    expect(apeBalance).to.be.equal(
      await convertToCurrencyDecimals(
        ape.address,
        MOCK_TOKEN_MINT_VALUE.APE.toString()
      )
    );

    const wBTCBalance = await wBTC.balanceOf(user1.address);
    expect(wBTCBalance).to.be.equal(
      await convertToCurrencyDecimals(
        wBTC.address,
        MOCK_TOKEN_MINT_VALUE.WBTC.toString()
      )
    );

    const stETHBalance = await stETH.balanceOf(user1.address);
    expect(stETHBalance).to.be.equal(
      await convertToCurrencyDecimals(
        stETH.address,
        MOCK_TOKEN_MINT_VALUE.stETH.toString()
      )
    );
    const aWETHBalance = await aWETH.balanceOf(user1.address);
    expect(aWETHBalance).to.be.equal(
      await convertToCurrencyDecimals(
        aWETH.address,
        MOCK_TOKEN_MINT_VALUE.stETH.toString()
      )
    );

    const baycBalance = await bayc.balanceOf(user1.address);
    expect(baycBalance.toString()).to.be.equal(
      MOCK_TOKEN_MINT_VALUE.BAYC.toString()
    );

    const maycBalance = await mayc.balanceOf(user1.address);
    expect(maycBalance.toString()).to.be.equal(
      MOCK_TOKEN_MINT_VALUE.MAYC.toString()
    );

    const doodleBalance = await doodles.balanceOf(user1.address);
    expect(doodleBalance.toString()).to.be.equal(
      MOCK_TOKEN_MINT_VALUE.DOODLE.toString()
    );

    const punkBalance = await punk.balanceOf(user1.address);
    expect(punkBalance.toString()).to.be.equal(
      MOCK_TOKEN_MINT_VALUE.CRYPTO_PUNK.toString()
    );
  });

  it("update DAI config and mint", async () => {
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

  it("update BAYC config and mint", async () => {
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

  it("update PUNK config and mint", async () => {
    const {
      mockTokenFaucet,
      punk,
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
