import {fromBn} from "evm-bn";
import rawBRE from "hardhat";
import {WAD} from "../../helpers/constants";
import {
  getApeCoinStaking,
  getAutoCompoundApe,
  getERC20,
  getPToken,
} from "../../helpers/contracts-getters";

const diff = async () => {
  console.time("diff");
  const attackBlock = 16845559;
  const beforeBlock = {blockTag: attackBlock - 1};
  const afterBlock = {blockTag: "latest"};
  const apeCoinStaking = await getApeCoinStaking();
  const pUSDC = await getPToken("0xe4F3747Ea30354da4A96c229f90F9B3dc93d8B06");
  const pwstETH = await getPToken("0x968aAc34cC8F607d2D34e138737a219229aBdc83");
  const pwETH = await getPToken("0xaA4b6506493582f169C9329AC0Da99fff23c2911");
  const pcAPE = await getPToken("0xDDDe38696FBe5d11497D72d8801F651642d62353");
  const ape = await getERC20("0x4d224452801ACEd8B2F0aebE155379bb5D594381");
  const usdc = await getERC20("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  const wstETH = await getERC20("0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0");
  const weth = await getERC20("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  const cAPE = await getAutoCompoundApe();

  console.log("before");
  console.log(
    "cAPE exchangeRate",
    fromBn(await cAPE.getPooledApeByShares(WAD, beforeBlock))
  );
  console.log(
    "cAPE totalSupply",
    (await cAPE.totalSupply(beforeBlock)).toString()
  );
  console.log(
    "cAPE totalShares",
    (await cAPE.getTotalShares(beforeBlock)).toString()
  );
  console.log(
    "cAPE balance",
    (await ape.balanceOf(cAPE.address, beforeBlock)).toString()
  );
  console.log(
    "pcAPE balance",
    (await cAPE.balanceOf(pcAPE.address, beforeBlock)).toString()
  );
  console.log(
    "pwstETH balance",
    (await wstETH.balanceOf(pwstETH.address, beforeBlock)).toString()
  );
  console.log(
    "pUSDC balance",
    (await usdc.balanceOf(pUSDC.address, beforeBlock)).toString()
  );
  console.log(
    "pWeth balance",
    (await weth.balanceOf(pwETH.address, beforeBlock)).toString()
  );
  console.log(
    "apeCoinStaking balance",
    (
      await apeCoinStaking.addressPosition(cAPE.address, beforeBlock)
    ).stakedAmount.toString()
  );
  console.log(
    "apeCoinStaking pendingRewards balance",
    (
      await apeCoinStaking.pendingRewards(0, cAPE.address, 0, beforeBlock)
    ).toString()
  );
  console.log();
  console.log();

  console.log("after");
  console.log(
    "cAPE exchangeRate",
    fromBn(await cAPE.getPooledApeByShares(WAD, afterBlock))
  );
  console.log(
    "cAPE totalSupply",
    (await cAPE.totalSupply(afterBlock)).toString()
  );
  console.log(
    "cAPE totalShares",
    (await cAPE.getTotalShares(afterBlock)).toString()
  );
  console.log(
    "cAPE balance",
    (await ape.balanceOf(cAPE.address, beforeBlock)).toString()
  );
  console.log(
    "pcAPE balance",
    (await cAPE.balanceOf(pcAPE.address, afterBlock)).toString()
  );
  console.log(
    "pwstETH balance",
    (await wstETH.balanceOf(pwstETH.address, afterBlock)).toString()
  );
  console.log(
    "pUSDC balance",
    (await usdc.balanceOf(pUSDC.address, afterBlock)).toString()
  );
  console.log(
    "pWeth balance",
    (await weth.balanceOf(pwETH.address, afterBlock)).toString()
  );
  console.log(
    "apeCoinStaking balance",
    (
      await apeCoinStaking.addressPosition(cAPE.address, afterBlock)
    ).stakedAmount.toString()
  );
  console.log(
    "apeCoinStaking pendingRewards balance",
    (
      await apeCoinStaking.pendingRewards(0, cAPE.address, 0, afterBlock)
    ).toString()
  );

  // 1853904571450207612349459  - 51981232718958766606221 = 1.8019233387312488457e+24 / 1e18 = 1801923.3387312488457
  // cAPE exchangeRate 1.232409456328880505
  // cAPE totalSupply 2691661925692416188688028
  // pcAPE balance 1853904571450207612349459
  // pwstETH balance 433750311462192053
  // pUSDC balance 7406585756649
  // after
  // cAPE exchangeRate 4.60727344124801931
  // cAPE totalSupply 3183876390281200802366496
  // pcAPE balance 51981232718958766606221
  // pwstETH balance 1000433750311462192053
  // pUSDC balance 206585756649

  // usdc loss = 7406585756649 - 206585756649 = 7200000000000 / 1e6 = 7200000
  // cape loss = 1853904571450207612349459 - 51981232718958766606221 = 1.8019233387312488457e+24 / 1e18 = 1801923.3387312488457
  // wstETH loss = 433750311462192053 - 1000433750311462192053 = -1e+21 / 1e18 = -1000
  // weth loss = 5039699388575280109138 - 3839699388575280109138 = 1.2e+21  / 1e18 = 1200
  // apeCoinStaking loss = 2691585095992416188688028 - 3183876390281200802366496 = -4.9229129428878461368e+23 / 1e18 = -492291.29428878461368

  // (1801923.3387312488457 - 492291.29428878461368) * 4.31  = 5644514
  // 7200000
  //
  // 5644514 + 7200000 - 2900 * 1718 = 7914514
  //
  // 7200000 - 492291 * 4.31 = 5078225.79 - 2909 * 1716 = 86381.79
  //
  // 86381 / 1718 = 50.812352941176470588 + 100 = 150.81235294117647059

  // 2691585095992416188688028 - 1839923170299999999999999 + 2332214464588784613678467 = 3.1838763902812008024e+24
  // 2.1735629866365906567e+24 - 1839923170299999999999999 / 1.23 = 6.776904904577288681e+23
  //
  // 3.1838763902812008024e+24 / 6.776904904577288681e+23 = 4.6981275893818905128
  // 2691585095992416188688028 / 2.1735629866365906567e+24  = 1.2383285474314328453
  //
  // 3.1838763902812008024e+24 - 2332214464588784613678467 = 8.5166192569241618872e+23
  //
  //   8.5166192569241618872e+23 / 6.776904904577288681e+23  = 1.2567122273136557123

  console.timeEnd("diff");
};

async function main() {
  await rawBRE.run("set-DRE");
  await diff();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
