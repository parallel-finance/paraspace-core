import rawBRE from "hardhat";
import {deployStakefishNFTOracleWrapper} from "../../helpers/contracts-deployments";
import {
  getFirstSigner,
  getParaSpaceOracle,
  getPoolProxy,
  getStakefishNFTOracleWrapper,
  getNTokenStakefish,
  getUiPoolDataProvider,
  getERC721,
} from "../../helpers/contracts-getters";
import {GLOBAL_OVERRIDES} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {
  IStakefishNFTManager__factory,
  IStakefishValidator__factory,
} from "../../types";

const adHoc = async () => {
  console.time("ad-hoc");
  // const validator = await IStakefishValidator__factory.connect(
  //   "0x7E5A381dCc37d9836AD742bF381dC825d1169cCe",
  //   await getFirstSigner()
  // );
  // console.log(await validator.getNFTArtUrl());
  // console.log(await validator.pubkey());
  // console.log(await validator.validatorIndex());
  // console.log(await validator.withdrawnBalance());
  // console.log(await validator.feePoolAddress());
  // console.log(await validator.getProtocolFee());
  // console.log(await validator.stateHistory());
  // console.log(await validator.stateHistory(0));
  // const oracle = await deployStakefishNFTOracleWrapper(
  //   "0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e"
  // );
  // for (let i = 1; i < 143; i++) {
  //   const nftManager = IStakefishNFTManager__factory.connect(
  //     "0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e",
  //     await getFirstSigner()
  //   );
  //   const validator = IStakefishValidator__factory.connect(
  //     await nftManager.validatorForTokenId(i),
  //     await getFirstSigner()
  //   );
  //   console.log(await validator.getNFTArtUrl());
  //   console.log(await validator.pubkey());
  //   console.log(await validator.validatorIndex());
  //   console.log(await validator.withdrawnBalance());
  //   console.log(await validator.feePoolAddress());
  //   console.log(await validator.getProtocolFee());
  //   // console.log(await validator.stateHistory());
  //   console.log(await validator.pendingFeePoolReward());
  //   // console.log((await oracle.getTokenPrice(i)).toString());
  // }
  // const paraspaceOracle = await getParaSpaceOracle();
  // const pool = await getPoolProxy();
  // console.log(
  //   await paraspaceOracle.getTokenPrice(
  //     "0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e",
  //     "142",
  //     GLOBAL_OVERRIDES
  //   )
  // );
  // const ui = await getUiPoolDataProvider();
  // console.log(
  //   (await pool.getReserveData("0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e"))
  //     .xTokenAddress
  // );
  // const nTokenStakefish = await getNTokenStakefish(
  //   "0xcFC920A44117daF2F0F90B64800Acf7BEb687aDa"
  // );
  // console.log(await nTokenStakefish.getNFTData("142"));
  //
  // console.log(
  //   await ui.getNTokenData(
  //     ["0xcFC920A44117daF2F0F90B64800Acf7BEb687aDa"],
  //     [["142"]]
  //   )
  // );
  //   await (
  //     await getStakefishNFTOracleWrapper(
  //       "0xD29C59bB9F11627F2c9e45F901A13b95B508CaEc"
  //     )
  //   ).getTokenPrice("142")
  // );
  // const validator = await IStakefishValidator__factory.connect(
  //   "0x46d829f409963F0d4aa827747406C47A0eAd3bB7",
  //   await getFirstSigner()
  // );
  // console.log(await validator.getNFTArtUrl());
  //
  // console.log(
  //   await paraspaceOracle.getAssetPrice(
  //     "0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e"
  //   )
  // );
  const pool = await getPoolProxy();
  const nft = await getERC721("0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e");
  await waitForTx(await nft.setApprovalForAll(pool.address, true));
  await waitForTx(
    await pool.supplyERC721(
      "0x5b41ffb9c448c02ff3d0401b0374b67efcb73c7e",
      [
        {
          tokenId: "142",
          useAsCollateral: true,
        },
      ],
      "0x2f2d07d60ea7330DD2314f4413CCbB2dC25276EF",
      0
    )
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
