import {fromBn} from "evm-bn";
import rawBRE from "hardhat";
import {WAD} from "../../helpers/constants";
import {deployUiPoolDataProvider} from "../../helpers/contracts-deployments";
import {
  getAutoCompoundApe,
  getERC20,
  getPToken,
  getVariableDebtToken,
} from "../../helpers/contracts-getters";
import {HACK_RECOVERY} from "../../helpers/hardhat-constants";
import {DRE} from "../../helpers/misc-utils";

const adHoc = async () => {
  console.time("ad-hoc");
  await deployUiPoolDataProvider(
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
  );
  const ape = await getERC20("0x4d224452801ACEd8B2F0aebE155379bb5D594381");
  const cape = await getAutoCompoundApe();
  const pcape = await getPToken("0xDDDe38696FBe5d11497D72d8801F651642d62353");
  const debtcape = await getVariableDebtToken(
    "0x0B51c7497C2875eAc76A68496FE5853DdbDA8091"
  );
  const weth = await getERC20("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  const pweth = await getPToken("0xaA4b6506493582f169C9329AC0Da99fff23c2911");
  const wETHVariableDebt = await getVariableDebtToken(
    "0x87F92191e14d970f919268045A57f7bE84559CEA"
  );
  const usdc = await getERC20("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  const wstETH = await getERC20("0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0");
  const pwstETH = await getERC20("0x968aAc34cC8F607d2D34e138737a219229aBdc83");
  const wstETHVariableDebt = await getERC20(
    "0xCA76D6D905b08e3224945bFA0340E92CCbbE5171"
  );
  const pusdc = await getPToken("0xe4F3747Ea30354da4A96c229f90F9B3dc93d8B06");
  const debtUsdc = await getVariableDebtToken(
    "0x1B36ad30F6866716FF08EB599597D8CE7607571d"
  );
  console.log(
    "eth balance",
    (await DRE.ethers.provider.getBalance(HACK_RECOVERY)).toString()
  );
  console.log("weth balance", (await weth.balanceOf(HACK_RECOVERY)).toString());
  console.log(
    "pweth balance",
    (await pweth.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log(
    "debtweth balance",
    (await wETHVariableDebt.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log(
    "wsteth balance",
    (await wstETH.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log(
    "pwsteth balance",
    (await pwstETH.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log(
    "debtweth balance",
    (await wstETHVariableDebt.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log("usdc balance", (await usdc.balanceOf(HACK_RECOVERY)).toString());
  console.log(
    "pusdc balance",
    (await pusdc.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log(
    "debtusdc balance",
    (await debtUsdc.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log("cape balance", (await cape.balanceOf(HACK_RECOVERY)).toString());
  console.log(
    "pcape balance",
    (await pcape.balanceOf(HACK_RECOVERY)).toString()
  );
  console.log(
    "debtcape balance",
    (await debtcape.balanceOf(HACK_RECOVERY)).toString()
  );

  console.log("ape balance", (await ape.balanceOf(HACK_RECOVERY)).toString());
  console.log();
  console.log("cape owner", await cape.owner());
  console.log("cape paused", await cape.paused());
  console.log(
    "cape exchangeRate",
    fromBn(await cape.getPooledApeByShares(WAD))
  );
  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
