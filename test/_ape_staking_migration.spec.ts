import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {
  AutoCompoundApe,
  ParaApeStaking,
  PToken,
  PTokenSApe,
  VariableDebtToken,
} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {
  changePriceAndValidate,
  changeSApePriceAndValidate,
  mintAndValidate,
  supplyAndValidate,
} from "./helpers/validated-steps";
import {
  getAutoCompoundApe,
  getParaApeStaking,
  getPToken,
  getPTokenSApe,
  getVariableDebtToken,
} from "../helpers/contracts-getters";
import {MAX_UINT_AMOUNT, ONE_ADDRESS} from "../helpers/constants";
import {advanceTimeAndBlock, waitForTx} from "../helpers/misc-utils";
import {parseEther} from "ethers/lib/utils";

describe("Para Ape Staking Test", () => {
  let testEnv: TestEnv;
  let variableDebtCApeCoin: VariableDebtToken;
  let paraApeStaking: ParaApeStaking;
  let cApe: AutoCompoundApe;
  let pcApeCoin: PToken;
  let pSApeCoin: PTokenSApe;
  const sApeAddress = ONE_ADDRESS;
  let MINIMUM_LIQUIDITY;

  const fixture = async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {
      ape,
      users: [user1, , , user4, , user6],
      apeCoinStaking,
      pool,
      protocolDataProvider,
      configurator,
      poolAdmin,
    } = testEnv;

    paraApeStaking = await getParaApeStaking();

    await waitForTx(
      await paraApeStaking
        .connect(poolAdmin.signer)
        .setApeStakingBot(user4.address)
    );

    cApe = await getAutoCompoundApe();
    MINIMUM_LIQUIDITY = await cApe.MINIMUM_LIQUIDITY();

    const {
      xTokenAddress: pcApeCoinAddress,
      variableDebtTokenAddress: variableDebtCApeCoinAddress,
    } = await protocolDataProvider.getReserveTokensAddresses(cApe.address);
    variableDebtCApeCoin = await getVariableDebtToken(
      variableDebtCApeCoinAddress
    );
    pcApeCoin = await getPToken(pcApeCoinAddress);

    const {xTokenAddress: pSApeCoinAddress} =
      await protocolDataProvider.getReserveTokensAddresses(sApeAddress);
    pSApeCoin = await getPTokenSApe(pSApeCoinAddress);

    // send extra tokens to the apestaking contract for rewards
    await waitForTx(
      await ape
        .connect(user1.signer)
        ["mint(address,uint256)"](
          apeCoinStaking.address,
          parseEther("100000000000")
        )
    );

    // user6 deposit MINIMUM_LIQUIDITY to make test case easy
    await mintAndValidate(ape, "1", user6);
    await waitForTx(
      await ape.connect(user6.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe.connect(user6.signer).deposit(user6.address, MINIMUM_LIQUIDITY)
    );

    // user4 deposit and supply cApe to MM
    expect(
      await configurator
        .connect(poolAdmin.signer)
        .setSupplyCap(cApe.address, "20000000000")
    );
    await mintAndValidate(ape, "10000000000", user4);
    await waitForTx(
      await ape.connect(user4.signer).approve(cApe.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await cApe
        .connect(user4.signer)
        .deposit(user4.address, parseEther("10000000000"))
    );
    await waitForTx(
      await cApe.connect(user4.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );
    await waitForTx(
      await pool
        .connect(user4.signer)
        .supply(cApe.address, parseEther("10000000000"), user4.address, 0)
    );

    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .unlimitedApproveTo(ape.address, paraApeStaking.address)
    );
    await waitForTx(
      await pool
        .connect(poolAdmin.signer)
        .unlimitedApproveTo(cApe.address, paraApeStaking.address)
    );

    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await changePriceAndValidate(ape, "0.0001");
    await changePriceAndValidate(cApe, "0.0001");
    await changeSApePriceAndValidate(sApeAddress, "0.0001");

    return testEnv;
  };

  it("Full position, without borrow in V1 migration to ApeCoin Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);
    await mintAndValidate(ape, "250000", user1);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("250000"),
        },
        [{tokenId: 0, amount: parseEther("200000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("200000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 6,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 8,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: ape.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("14400")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );
  });

  it("Full position, with borrow in V1 migration to ApeCoin Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: parseEther("250000"),
          cashAsset: ape.address,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: parseEther("200000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("250000"),
      parseEther("10")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("200000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 6,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 8,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: ape.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("235600"),
      parseEther("100")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );
  });

  it("Not Full position, without borrow in V1 migration to ApeCoin Pool(need borrow during migration)", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);
    await mintAndValidate(ape, "150000", user1);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("150000"),
        },
        [{tokenId: 0, amount: parseEther("100000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("150000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("100000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 6,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 8,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: cApe.address,
          totalAmount: parseEther("85600"),
          borrowAmount: parseEther("85600"),
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("85600"),
      parseEther("100")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );
  });

  it("Not Full position, with borrow in V1 migration to ApeCoin Pool(need borrow during migration)", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: parseEther("150000"),
          cashAsset: ape.address,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: parseEther("100000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("150000"),
      parseEther("10")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("150000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("100000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 6,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 8,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: cApe.address,
          totalAmount: parseEther("85600"),
          borrowAmount: parseEther("85600"),
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("235600"),
      parseEther("100")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );
  });

  it("Full position, without borrow in V1 migration to NFT Single Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);
    await mintAndValidate(ape, "250000", user1);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("250000"),
        },
        [{tokenId: 0, amount: parseEther("200000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("200000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 3,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 5,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
        ],
        {
          asset: ape.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("264400")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(parseEther("0"));
  });

  it("Full position, with borrow in V1 migration to NFT Single Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: parseEther("250000"),
          cashAsset: ape.address,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: parseEther("200000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("250000"),
      parseEther("10")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("200000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 3,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 5,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
        ],
        {
          asset: ape.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("14400"),
      parseEther("100")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(0);
  });

  it("Not Full position, without borrow in V1 migration to NFT Single Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);
    await mintAndValidate(ape, "150000", user1);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("150000"),
        },
        [{tokenId: 0, amount: parseEther("100000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("150000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("100000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 3,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 5,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
        ],
        {
          asset: cApe.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("164400"),
      parseEther("100")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(0);
  });

  it("Not Full position, with borrow in V1 migration to NFT Single Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: parseEther("150000"),
          cashAsset: ape.address,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: parseEther("100000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("150000"),
      parseEther("10")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("150000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("100000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 3,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 5,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
        ],
        {
          asset: cApe.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("14400"),
      parseEther("100")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(0);
  });

  it("Full position, without borrow in V1 migration to NFT Pair Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);
    await mintAndValidate(ape, "250000", user1);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("250000"),
        },
        [{tokenId: 0, amount: parseEther("200000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("200000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 1,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: ape.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("264400")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(parseEther("0"));
  });

  it("Full position, with borrow in V1 migration to NFT Pair Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: parseEther("250000"),
          cashAsset: ape.address,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: parseEther("200000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("250000"),
      parseEther("10")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("250000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("200000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 1,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: ape.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("14400"),
      parseEther("100")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(0);
  });

  it("Not Full position, without borrow in V1 migration to NFT Pair Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);
    await mintAndValidate(ape, "150000", user1);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("150000"),
        },
        [{tokenId: 0, amount: parseEther("100000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("150000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("100000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 1,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: cApe.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("164400"),
      parseEther("100")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(0);
  });

  it("Not Full position, with borrow in V1 migration to NFT Pair Pool", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: cApe.address,
          borrowAmount: parseEther("150000"),
          cashAsset: ape.address,
          cashAmount: 0,
        },
        [{tokenId: 0, amount: parseEther("100000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("150000"),
      parseEther("10")
    );
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(
      parseEther("150000")
    );

    await advanceTimeAndBlock(7200);

    await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("100000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 1,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: cApe.address,
          totalAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    expect(await variableDebtCApeCoin.balanceOf(user1.address)).to.be.eq(0);
    expect(await pcApeCoin.balanceOf(user1.address)).to.be.closeTo(
      parseEther("14400"),
      parseEther("100")
    );
    expect(await pSApeCoin.balanceOf(user1.address)).to.be.eq(0);
  });

  /*
  it("gas test: test 1 pair of BAYC with BAKC position migration", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "1", user1, true);
    await supplyAndValidate(bakc, "1", user1, true);
    await mintAndValidate(ape, "250000", user1);

    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("250000"),
        },
        [{tokenId: 0, amount: parseEther("200000")}],
        [{mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")}]
      )
    );

    await advanceTimeAndBlock(7200);

    const txRecepient = await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [{tokenId: 0, amount: parseEther("200000")}],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 6,
            apeTokenIds: [0],
            bakcTokenIds: [],
          },
          {
            PoolId: 8,
            apeTokenIds: [0],
            bakcTokenIds: [0],
          },
        ],
        {
          asset: ape.address,
          cashAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    console.log("-----------------gas used:", txRecepient.gasUsed.toString());
  });

  it("gas test: test 5 pair of BAYC with BAKC position migration", async () => {
    const {
      users: [user1],
      bayc,
      bakc,
      ape,
      pool,
    } = await loadFixture(fixture);

    await supplyAndValidate(bayc, "5", user1, true);
    await supplyAndValidate(bakc, "5", user1, true);
    await mintAndValidate(ape, "1250000", user1);

    await waitForTx(
      await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
    );

    await waitForTx(
      await pool.connect(user1.signer).borrowApeAndStakeV2(
        {
          nftAsset: bayc.address,
          borrowAsset: ape.address,
          borrowAmount: 0,
          cashAsset: ape.address,
          cashAmount: parseEther("1250000"),
        },
        [
          {tokenId: 0, amount: parseEther("200000")},
          {tokenId: 1, amount: parseEther("200000")},
          {tokenId: 2, amount: parseEther("200000")},
          {tokenId: 3, amount: parseEther("200000")},
          {tokenId: 4, amount: parseEther("200000")},
        ],
        [
          {mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")},
          {mainTokenId: 1, bakcTokenId: 1, amount: parseEther("50000")},
          {mainTokenId: 2, bakcTokenId: 2, amount: parseEther("50000")},
          {mainTokenId: 3, bakcTokenId: 3, amount: parseEther("50000")},
          {mainTokenId: 4, bakcTokenId: 4, amount: parseEther("50000")},
        ]
      )
    );

    await advanceTimeAndBlock(7200);

    const txRecepient = await waitForTx(
      await pool.connect(user1.signer).apeStakingMigration(
        [
          {
            nftAsset: bayc.address,
            _nfts: [
              {tokenId: 0, amount: parseEther("200000")},
              {tokenId: 1, amount: parseEther("200000")},
              {tokenId: 2, amount: parseEther("200000")},
              {tokenId: 3, amount: parseEther("200000")},
              {tokenId: 4, amount: parseEther("200000")},
            ],
            _nftPairs: [
              {
                mainTokenId: 0,
                bakcTokenId: 0,
                amount: parseEther("50000"),
                isUncommit: true,
              },
              {
                mainTokenId: 1,
                bakcTokenId: 1,
                amount: parseEther("50000"),
                isUncommit: true,
              },
              {
                mainTokenId: 2,
                bakcTokenId: 2,
                amount: parseEther("50000"),
                isUncommit: true,
              },
              {
                mainTokenId: 3,
                bakcTokenId: 3,
                amount: parseEther("50000"),
                isUncommit: true,
              },
              {
                mainTokenId: 4,
                bakcTokenId: 4,
                amount: parseEther("50000"),
                isUncommit: true,
              },
            ],
          },
        ],
        [
          {
            PoolId: 6,
            apeTokenIds: [0, 1, 2, 3, 4],
            bakcTokenIds: [],
          },
          {
            PoolId: 8,
            apeTokenIds: [0, 1, 2, 3, 4],
            bakcTokenIds: [0, 1, 2, 3, 4],
          },
        ],
        {
          asset: ape.address,
          cashAmount: 0,
          borrowAmount: 0,
          openSApeCollateralFlag: true,
        }
      )
    );
    console.log("-----------------gas used:", txRecepient.gasUsed.toString());
  });

    it("gas test: test 10 pair of BAYC with BAKC position migration", async () => {
        const {
            users: [user1],
            bayc,
            bakc,
            ape,
            pool,
        } = await loadFixture(fixture);

        await supplyAndValidate(bayc, "10", user1, true);
        await supplyAndValidate(bakc, "10", user1, true);
        await mintAndValidate(ape, "2500000", user1);

        await waitForTx(
            await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
        );

        await waitForTx(
            await pool.connect(user1.signer).borrowApeAndStakeV2(
                {
                    nftAsset: bayc.address,
                    borrowAsset: ape.address,
                    borrowAmount: 0,
                    cashAsset: ape.address,
                    cashAmount: parseEther("2500000"),
                },
                [
                    {tokenId: 0, amount: parseEther("200000")},
                    {tokenId: 1, amount: parseEther("200000")},
                    {tokenId: 2, amount: parseEther("200000")},
                    {tokenId: 3, amount: parseEther("200000")},
                    {tokenId: 4, amount: parseEther("200000")},
                    {tokenId: 5, amount: parseEther("200000")},
                    {tokenId: 6, amount: parseEther("200000")},
                    {tokenId: 7, amount: parseEther("200000")},
                    {tokenId: 8, amount: parseEther("200000")},
                    {tokenId: 9, amount: parseEther("200000")},
                ],
                [
                    {mainTokenId: 0, bakcTokenId: 0, amount: parseEther("50000")},
                    {mainTokenId: 1, bakcTokenId: 1, amount: parseEther("50000")},
                    {mainTokenId: 2, bakcTokenId: 2, amount: parseEther("50000")},
                    {mainTokenId: 3, bakcTokenId: 3, amount: parseEther("50000")},
                    {mainTokenId: 4, bakcTokenId: 4, amount: parseEther("50000")},
                    {mainTokenId: 5, bakcTokenId: 5, amount: parseEther("50000")},
                    {mainTokenId: 6, bakcTokenId: 6, amount: parseEther("50000")},
                    {mainTokenId: 7, bakcTokenId: 7, amount: parseEther("50000")},
                    {mainTokenId: 8, bakcTokenId: 8, amount: parseEther("50000")},
                    {mainTokenId: 9, bakcTokenId: 9, amount: parseEther("50000")},
                ]
            )
        );

        await advanceTimeAndBlock(7200);

        const txRecepient = await waitForTx(
            await pool.connect(user1.signer).apeStakingMigration(
                [
                    {
                        nftAsset: bayc.address,
                        _nfts: [
                            {tokenId: 0, amount: parseEther("200000")},
                            {tokenId: 1, amount: parseEther("200000")},
                            {tokenId: 2, amount: parseEther("200000")},
                            {tokenId: 3, amount: parseEther("200000")},
                            {tokenId: 4, amount: parseEther("200000")},
                            {tokenId: 5, amount: parseEther("200000")},
                            {tokenId: 6, amount: parseEther("200000")},
                            {tokenId: 7, amount: parseEther("200000")},
                            {tokenId: 8, amount: parseEther("200000")},
                            {tokenId: 9, amount: parseEther("200000")},
                        ],
                        _nftPairs: [
                            {
                                mainTokenId: 0,
                                bakcTokenId: 0,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 1,
                                bakcTokenId: 1,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 2,
                                bakcTokenId: 2,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 3,
                                bakcTokenId: 3,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 4,
                                bakcTokenId: 4,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 5,
                                bakcTokenId: 5,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 6,
                                bakcTokenId: 6,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 7,
                                bakcTokenId: 7,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 8,
                                bakcTokenId: 8,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                            {
                                mainTokenId: 9,
                                bakcTokenId: 9,
                                amount: parseEther("50000"),
                                isUncommit: true,
                            },
                        ],
                    },
                ],
                [
                    {
                        PoolId: 6,
                        apeTokenIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                        bakcTokenIds: [],
                    },
                    {
                        PoolId: 8,
                        apeTokenIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                        bakcTokenIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                    },
                ],
                {
                    asset: ape.address,
                    cashAmount: 0,
                    borrowAmount: 0,
                    openSApeCollateralFlag: true,
                }
            )
        );
        console.log("-----------------gas used:", txRecepient.gasUsed.toString());
    });

    it("gas test: test 1 pair of BAYC position migration", async () => {
        const {
            users: [user1],
            bayc,
            ape,
            pool,
        } = await loadFixture(fixture);

        await supplyAndValidate(bayc, "1", user1, true);
        await mintAndValidate(ape, "200000", user1);


        await waitForTx(
            await pool.connect(user1.signer).borrowApeAndStakeV2(
                {
                    nftAsset: bayc.address,
                    borrowAsset: ape.address,
                    borrowAmount: 0,
                    cashAsset: ape.address,
                    cashAmount: parseEther("200000"),
                },
                [{tokenId: 0, amount: parseEther("200000")}],
                []
            )
        );

        await advanceTimeAndBlock(7200);

        const txRecepient = await waitForTx(
            await pool.connect(user1.signer).apeStakingMigration(
                [
                    {
                        nftAsset: bayc.address,
                        _nfts: [{tokenId: 0, amount: parseEther("200000")}],
                        _nftPairs: [],
                    },
                ],
                [
                    {
                        PoolId: 6,
                        apeTokenIds: [0],
                        bakcTokenIds: [],
                    },
                ],
                {
                    asset: ape.address,
                    cashAmount: 0,
                    borrowAmount: 0,
                    openSApeCollateralFlag: true,
                }
            )
        );
        console.log("-----------------gas used:", txRecepient.gasUsed.toString());
    });

    it("gas test: test 5 pair of BAYC position migration", async () => {
        const {
            users: [user1],
            bayc,
            ape,
            pool,
        } = await loadFixture(fixture);

        await supplyAndValidate(bayc, "5", user1, true);
        await mintAndValidate(ape, "1000000", user1);

        await waitForTx(
            await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
        );

        await waitForTx(
            await pool.connect(user1.signer).borrowApeAndStakeV2(
                {
                    nftAsset: bayc.address,
                    borrowAsset: ape.address,
                    borrowAmount: 0,
                    cashAsset: ape.address,
                    cashAmount: parseEther("1000000"),
                },
                [
                    {tokenId: 0, amount: parseEther("200000")},
                    {tokenId: 1, amount: parseEther("200000")},
                    {tokenId: 2, amount: parseEther("200000")},
                    {tokenId: 3, amount: parseEther("200000")},
                    {tokenId: 4, amount: parseEther("200000")},
                ],
                []
            )
        );

        await advanceTimeAndBlock(7200);

        const txRecepient = await waitForTx(
            await pool.connect(user1.signer).apeStakingMigration(
                [
                    {
                        nftAsset: bayc.address,
                        _nfts: [
                            {tokenId: 0, amount: parseEther("200000")},
                            {tokenId: 1, amount: parseEther("200000")},
                            {tokenId: 2, amount: parseEther("200000")},
                            {tokenId: 3, amount: parseEther("200000")},
                            {tokenId: 4, amount: parseEther("200000")},
                        ],
                        _nftPairs: [],
                    },
                ],
                [
                    {
                        PoolId: 6,
                        apeTokenIds: [0, 1, 2, 3, 4],
                        bakcTokenIds: [],
                    },
                ],
                {
                    asset: ape.address,
                    cashAmount: 0,
                    borrowAmount: 0,
                    openSApeCollateralFlag: true,
                }
            )
        );
        console.log("-----------------gas used:", txRecepient.gasUsed.toString());
    });

    it("gas test: test 10 pair of BAYC position migration", async () => {
        const {
            users: [user1],
            bayc,
            ape,
            pool,
        } = await loadFixture(fixture);

        await supplyAndValidate(bayc, "10", user1, true);
        await mintAndValidate(ape, "2000000", user1);

        await waitForTx(
            await ape.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
        );

        await waitForTx(
            await pool.connect(user1.signer).borrowApeAndStakeV2(
                {
                    nftAsset: bayc.address,
                    borrowAsset: ape.address,
                    borrowAmount: 0,
                    cashAsset: ape.address,
                    cashAmount: parseEther("2000000"),
                },
                [
                    {tokenId: 0, amount: parseEther("200000")},
                    {tokenId: 1, amount: parseEther("200000")},
                    {tokenId: 2, amount: parseEther("200000")},
                    {tokenId: 3, amount: parseEther("200000")},
                    {tokenId: 4, amount: parseEther("200000")},
                    {tokenId: 5, amount: parseEther("200000")},
                    {tokenId: 6, amount: parseEther("200000")},
                    {tokenId: 7, amount: parseEther("200000")},
                    {tokenId: 8, amount: parseEther("200000")},
                    {tokenId: 9, amount: parseEther("200000")},
                ],
                []
            )
        );

        await advanceTimeAndBlock(7200);

        const txRecepient = await waitForTx(
            await pool.connect(user1.signer).apeStakingMigration(
                [
                    {
                        nftAsset: bayc.address,
                        _nfts: [
                            {tokenId: 0, amount: parseEther("200000")},
                            {tokenId: 1, amount: parseEther("200000")},
                            {tokenId: 2, amount: parseEther("200000")},
                            {tokenId: 3, amount: parseEther("200000")},
                            {tokenId: 4, amount: parseEther("200000")},
                            {tokenId: 5, amount: parseEther("200000")},
                            {tokenId: 6, amount: parseEther("200000")},
                            {tokenId: 7, amount: parseEther("200000")},
                            {tokenId: 8, amount: parseEther("200000")},
                            {tokenId: 9, amount: parseEther("200000")},
                        ],
                        _nftPairs: [],
                    },
                ],
                [
                    {
                        PoolId: 6,
                        apeTokenIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
                        bakcTokenIds: [],
                    },
                ],
                {
                    asset: ape.address,
                    cashAmount: 0,
                    borrowAmount: 0,
                    openSApeCollateralFlag: true,
                }
            )
        );
        console.log("-----------------gas used:", txRecepient.gasUsed.toString());
    });*/
});
