import rawBRE from "hardhat";
import {
  getAggregator,
  getERC721,
  getERC721OracleWrapper,
  getMintableERC721,
  getNFTFloorOracle,
  getParaSpaceOracle,
  getPoolAddressesProvider,
  getPoolProxy,
  getPriceOracle,
  getTimeLockExecutor,
} from "../../helpers/contracts-getters";
import {
  DRY_RUN,
  GLOBAL_OVERRIDES,
  TIME_LOCK_BUFFERING_TIME,
} from "../../helpers/hardhat-constants";
import {
  dryRunEncodedData,
  getTimeLockDataInDb,
} from "../../helpers/contracts-helpers";
import {increaseTime, waitForTx} from "../../helpers/misc-utils";
import {assignWith} from "lodash";
import {ERC721OracleWrapper} from "../../types";
import {tEthereumAddress} from "../../helpers/types";
import {deployERC721OracleWrapper} from "../../helpers/contracts-deployments";
import {parseEther} from "ethers/lib/utils";
import {BigNumber} from "ethers";

const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
const PPG = "0xbd3531da5cf5857e7cfaa92426877b022e612cf8";
const PUNKS = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb";
const MAYC = "0x60E4d786628Fea6478F785A6d7e704777c86a7c6";
const OTHR = "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258";
const AZUKI = "0xed5af388653567af2f388e6224dc7c4b3241c544";
const BAKC = "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623";
const MOONBIRD = "0x23581767a106ae21c074b2276d25e5c3e136a68b";
const CLONEX = "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b";
const DOODLE = "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e";
const MEEBITS = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";
const BEANZ = "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949";
const BLOCKS = "0x059EDD72Cd353dF5106D2B9cC5ab83a52287aC3a";
const EXP = "0x790b2cf29ed4f310bf7641f013c65d4560d28371";
const VSL = "0x5b1085136a811e55b2bb2ca1ea456ba82126a376";
const KODA = "0xe012baf811cf9c05c408e879c399960d1f305903";
const DEGODS = "0x8821bee2ba0df28761afff119d66390d594cd280";
const HVMTL = "0x4b15a9c28034dC83db40CD810001427d3BD7163D";
const ELEM = "0xB6a37b5d14D502c3Ab0Ae6f3a0E058BC9517786e";
const MBEAN = "0x3Af2A97414d1101E2107a70E7F33955da1346305";
const GHOST = "0x9401518f4ebba857baa879d9f76e1cc8b31ed197";

const wPUNKS = "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6";

const nftOracle = "0x09C1A700BE5273eFcd1dF191757326ed41b2D456";

const updateOracleWrapperSource = async (
  oracleWrapper: ERC721OracleWrapper
) => {
  if (DRY_RUN) {
    const encodedData = oracleWrapper.interface.encodeFunctionData(
      "setOracle",
      [nftOracle]
    );
    await dryRunEncodedData(oracleWrapper.address, encodedData);
  } else {
    await waitForTx(await oracleWrapper.setOracle(nftOracle));
  }
};

const updateAllOracleWrapperSource = async () => {
  const baycWrapper = await getERC721OracleWrapper("BAYC");
  const ppgWrapper = await getERC721OracleWrapper("PPG");
  const punksWrapper = await getERC721OracleWrapper("WPUNKS");
  const maycWrapper = await getERC721OracleWrapper("MAYC");
  const otherWrapper = await getERC721OracleWrapper("OTHR");
  const azukiWrapper = await getERC721OracleWrapper("AZUKI");
  const bakcWrapper = await getERC721OracleWrapper("BAKC");
  const moonbirdWrapper = await getERC721OracleWrapper("MOONBIRD");
  const clonexWrapper = await getERC721OracleWrapper("CloneX");
  const doodleWrapper = await getERC721OracleWrapper("DOODLE");
  const meebitsWrapper = await getERC721OracleWrapper("MEEBITS");
  const beanzWrapper = await getERC721OracleWrapper("BEANZ");
  const blocksWrapper = await getERC721OracleWrapper("BLOCKS");
  const expWrapper = await getERC721OracleWrapper("EXP");
  const vslWrapper = await getERC721OracleWrapper("VSL");
  const kodaWrapper = await getERC721OracleWrapper("KODA");
  const degodsWrapper = await getERC721OracleWrapper("DEGODS");
  const hvmtlWrapper = await getERC721OracleWrapper("HVMTL");
  const elemWrapper = await getERC721OracleWrapper("ELEM");
  const mbeanWrapper = await getERC721OracleWrapper("MBEAN");
  const ghostWrapper = await getERC721OracleWrapper("GHOST");

  console.log("--------------0");
  await updateOracleWrapperSource(baycWrapper);
  await updateOracleWrapperSource(ppgWrapper);
  await updateOracleWrapperSource(punksWrapper);
  await updateOracleWrapperSource(maycWrapper);
  await updateOracleWrapperSource(otherWrapper);
  await updateOracleWrapperSource(azukiWrapper);
  await updateOracleWrapperSource(bakcWrapper);
  await updateOracleWrapperSource(moonbirdWrapper);
  await updateOracleWrapperSource(clonexWrapper);
  await updateOracleWrapperSource(doodleWrapper);
  await updateOracleWrapperSource(meebitsWrapper);
  await updateOracleWrapperSource(beanzWrapper);
  await updateOracleWrapperSource(blocksWrapper);
  await updateOracleWrapperSource(expWrapper);
  await updateOracleWrapperSource(vslWrapper);
  await updateOracleWrapperSource(kodaWrapper);
  await updateOracleWrapperSource(degodsWrapper);
  await updateOracleWrapperSource(hvmtlWrapper);
  await updateOracleWrapperSource(elemWrapper);
  await updateOracleWrapperSource(mbeanWrapper);
  await updateOracleWrapperSource(ghostWrapper);

  console.log("--------------1");
  // await printPrice(BAYC);
  // await printPrice(PPG);
  // await printPrice(PUNKS);
  // await printPrice(MAYC);
  // await printPrice(OTHR);
  // await printPrice(AZUKI);
  // await printPrice(BAKC);
  // await printPrice(MOONBIRD);
  // await printPrice(CLONEX);
  // await printPrice(DOODLE);
  // await printPrice(MEEBITS);
  // await printPrice(BEANZ);
  // await printPrice(BLOCKS);
  // await printPrice(EXP);
  // await printPrice(VSL);
  // await printPrice(KODA);
  // await printPrice(DEGODS);
  // await printPrice(HVMTL);
  // await printPrice(ELEM);
  // await printPrice(MBEAN);
  // await printPrice(GHOST);
};

const adHoc = async () => {};

const replaceChainlinkOracle = async () => {
  //const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
  //const PPG = "0xbd3531da5cf5857e7cfaa92426877b022e612cf8";
  //const PUNKS = "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6";
  //const MAYC = "0x60E4d786628Fea6478F785A6d7e704777c86a7c6";
  //const OTHR = "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258";
  //const AZUKI = "0xed5af388653567af2f388e6224dc7c4b3241c544";
  // const BAKC = "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623";
  const MOONBIRD = "0x23581767a106ae21c074b2276d25e5c3e136a68b";
  const CLONEX = "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b";
  const DOODLE = "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e";
  // const MEEBITS = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";
  const BEANZ = "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949";
  // const BLOCKS = "0x059EDD72Cd353dF5106D2B9cC5ab83a52287aC3a";
  // const EXP = "0x790b2cf29ed4f310bf7641f013c65d4560d28371";
  // const VSL = "0x5b1085136a811e55b2bb2ca1ea456ba82126a376";
  // const KODA = "0xe012baf811cf9c05c408e879c399960d1f305903";
  // const DEGODS = "0x8821bee2ba0df28761afff119d66390d594cd280";
  // const HVMTL = "0x4b15a9c28034dC83db40CD810001427d3BD7163D";
  // const ELEM = "0xB6a37b5d14D502c3Ab0Ae6f3a0E058BC9517786e";
  // const MBEAN = "0x3Af2A97414d1101E2107a70E7F33955da1346305";
  // const GHOST = "0x9401518f4ebba857baa879d9f76e1cc8b31ed197";

  const collectionPriceMap = new Map<string, string>();
  //collectionPriceMap.set(AZUKI, "0xA8B9A447C73191744D5B79BcE864F343455E1150");
  collectionPriceMap.set(BEANZ, "0xA97477aB5ab6ED2f6A2B5Cbe59D71e88ad334b90");
  //collectionPriceMap.set(BAYC, "0x352f2Bc3039429fC2fe62004a1575aE74001CfcE");
  collectionPriceMap.set(CLONEX, "0x021264d59DAbD26E7506Ee7278407891Bb8CDCCc");
  //collectionPriceMap.set(PUNKS, "0x01B6710B01cF3dd8Ae64243097d91aFb03728Fdd");
  collectionPriceMap.set(DOODLE, "0x027828052840a43Cc2D0187BcfA6e3D6AcE60336");
  //collectionPriceMap.set(MAYC, "0x1823C89715Fe3fB96A24d11c917aCA918894A090");
  collectionPriceMap.set(
    MOONBIRD,
    "0x9cd36E0E8D3C27d630D00406ACFC3463154951Af"
  );
  //collectionPriceMap.set(OTHR, "0x6e3A4376B4C8D3ba49602f8542D9D3C4A87ba901");
  //collectionPriceMap.set(PPG, "0x9f2ba149c2A0Ee76043d83558C4E79E9F3E5731B");

  const pool = await getPoolProxy();
  const paraOracle = await getParaSpaceOracle();

  // for (const entry of collectionPriceMap.entries()) {
  //     console.log("collection:", entry[0]);
  //     const oracle = await getERC721OracleWrapper(entry[1]);
  //     const price = await oracle.latestAnswer();
  //     console.log("chainlink price:", price.toString());
  //
  //     const ownPrice = await paraOracle.getAssetPrice(entry[0]);
  //     console.log("current price:", ownPrice.toString());
  //
  //     const diff = (ownPrice.sub(price).div(1000000).toNumber()) / (ownPrice.div(1000000).toNumber());
  //     console.log("diff:", diff);
  // }
  // return;

  // const allUser :Array<string> = [];
  // for (const key of collectionPriceMap.keys()) {
  //     console.log("check:", key);
  //     const xToken = await pool.getReserveXToken(key);
  //     const erc721 = await getMintableERC721(xToken);
  //     const total = (await erc721.totalSupply()).toNumber();
  //     console.log("total:", total);
  //     for (let i=0; i<total; i++) {
  //         const tokenId = await erc721.tokenByIndex(i);
  //         const owner = await erc721.ownerOf(tokenId);
  //         if (!allUser.includes(owner)) {
  //             allUser.push(owner);
  //         }
  //     }
  // }
  // console.log("total user length:", allUser.length);
  // console.log("allUser:", JSON.stringify(allUser));

  // for (let i=0; i<allUser.length; i++) {
  //     const {healthFactor} = await pool.getUserAccountData(allUser[i]);
  //     if (healthFactor.lte(parseEther("1"))) {
  //         console.log("before: user:", allUser[i], "HF:", healthFactor.toString());
  //     }
  // }

  console.log("start to replace oracle");
  //replace oracle

  if (DRY_RUN) {
    const encodedData = paraOracle.interface.encodeFunctionData(
      "setAssetSources",
      [
        [BEANZ, CLONEX, DOODLE, MOONBIRD],
        [
          //collectionPriceMap.get(AZUKI)!,
          collectionPriceMap.get(BEANZ)!,
          //collectionPriceMap.get(BAYC)!,
          collectionPriceMap.get(CLONEX)!,
          //collectionPriceMap.get(PUNKS)!,
          collectionPriceMap.get(DOODLE)!,
          //collectionPriceMap.get(MAYC)!,
          collectionPriceMap.get(MOONBIRD)!,
          // collectionPriceMap.get(OTHR)!,
          // collectionPriceMap.get(PPG)!,
        ],
      ]
    );
    await dryRunEncodedData(paraOracle.address, encodedData);
  } else {
    await waitForTx(
      await paraOracle.setAssetSources(
        [BEANZ, CLONEX, DOODLE, MOONBIRD],
        [
          //collectionPriceMap.get(AZUKI)!,
          collectionPriceMap.get(BEANZ)!,
          //collectionPriceMap.get(BAYC)!,
          collectionPriceMap.get(CLONEX)!,
          //collectionPriceMap.get(PUNKS)!,
          collectionPriceMap.get(DOODLE)!,
          //collectionPriceMap.get(MAYC)!,
          collectionPriceMap.get(MOONBIRD)!,
          // collectionPriceMap.get(OTHR)!,
          // collectionPriceMap.get(PPG)!,
        ],
        GLOBAL_OVERRIDES
      )
    );
  }
  console.log("end replace oracle");

  //check user HF
  // for (let i=0; i<allUser.length; i++) {
  //     console.log("i:", i);
  //     const {healthFactor} = await pool.getUserAccountData(allUser[i]);
  //     if (healthFactor.lte(parseEther("1"))) {
  //         console.log("after: user:", allUser[i], "HF:", healthFactor.toString());
  //     }
  // }
};

const printPrice = async (asset: string) => {
  if (asset == PUNKS) {
    console.log("asset: punks");
    const paraspaceOracle = await getParaSpaceOracle();
    const paraPrice = await paraspaceOracle.getAssetPrice(wPUNKS);
    console.log("paraPrice:", paraPrice.toString());
  } else {
    const erc721 = await getERC721(asset);
    console.log("asset:", await erc721.symbol());
    const paraspaceOracle = await getParaSpaceOracle();
    const paraPrice = await paraspaceOracle.getAssetPrice(asset);
    console.log("paraPrice:", paraPrice.toString());
  }

  const nftOracleContract = await getNFTFloorOracle(nftOracle);
  const nftPrice = await nftOracleContract.getPrice(asset);
  console.log("new oracle price:", nftPrice.toString());
};

const feedEmergencyPrice = async () => {
  console.time("ad-hoc");

  const collectionPriceMap = new Map<string, BigNumber>();
  collectionPriceMap.set(BAYC, parseEther("24.99"));
  collectionPriceMap.set(PPG, parseEther("16.76"));
  collectionPriceMap.set(PUNKS, parseEther("60"));
  collectionPriceMap.set(MAYC, parseEther("4.29"));
  collectionPriceMap.set(OTHR, parseEther("0.5"));
  collectionPriceMap.set(AZUKI, parseEther("6.9"));
  collectionPriceMap.set(BAKC, parseEther("1.33"));
  collectionPriceMap.set(MOONBIRD, parseEther("1.2"));
  collectionPriceMap.set(CLONEX, parseEther("1.15"));
  collectionPriceMap.set(DOODLE, parseEther("2.12"));
  collectionPriceMap.set(MEEBITS, parseEther("1.1"));
  collectionPriceMap.set(BEANZ, parseEther("0.43"));
  collectionPriceMap.set(BLOCKS, parseEther("7.94"));
  collectionPriceMap.set(EXP, parseEther("0.26"));
  collectionPriceMap.set(VSL, parseEther("0.17"));
  collectionPriceMap.set(KODA, parseEther("3.79"));
  collectionPriceMap.set(DEGODS, parseEther("3.09"));
  collectionPriceMap.set(HVMTL, parseEther("0.245"));
  collectionPriceMap.set(ELEM, parseEther("0.65"));
  collectionPriceMap.set(MBEAN, parseEther("1.04"));
  collectionPriceMap.set(GHOST, parseEther("0.4"));

  const nftOracleContract = await getNFTFloorOracle(nftOracle);
  // for (const entry of collectionPriceMap.entries()) {
  //   const encodedData = nftOracleContract.interface.encodeFunctionData(
  //     "setEmergencyPrice",
  //     [entry[0], entry[1]]
  //   );
  //   await dryRunEncodedData(nftOracleContract.address, encodedData);
  // }

  // await nftOracleContract.setEmergencyPrice([
  //   BAYC,
  //   PPG,
  //   PUNKS,
  //   MAYC,
  //   OTHR,
  //   AZUKI,
  //   BAKC,
  //   MOONBIRD,
  //   CLONEX,
  //   DOODLE,
  //   MEEBITS,
  //   BEANZ,
  //   BLOCKS,
  //   EXP,
  //     VSL,
  //     KODA,
  //     DEGODS,
  //     HVMTL,
  //     ELEM,
  //     MBEAN,
  //     GHOST
  // ], [
  //     collectionPriceMap.get(BAYC)!,
  //     collectionPriceMap.get(PPG)!,
  //     collectionPriceMap.get(PUNKS)!,
  //     collectionPriceMap.get(MAYC)!,
  //     collectionPriceMap.get(OTHR)!,
  //     collectionPriceMap.get(AZUKI)!,
  //     collectionPriceMap.get(BAKC)!,
  //     collectionPriceMap.get(MOONBIRD)!,
  //     collectionPriceMap.get(CLONEX)!,
  //     collectionPriceMap.get(DOODLE)!,
  //     collectionPriceMap.get(MEEBITS)!,
  //     collectionPriceMap.get(BEANZ)!,
  //     collectionPriceMap.get(BLOCKS)!,
  //     collectionPriceMap.get(EXP)!,
  //     collectionPriceMap.get(VSL)!,
  //     collectionPriceMap.get(KODA)!,
  //     collectionPriceMap.get(DEGODS)!,
  //     collectionPriceMap.get(HVMTL)!,
  //     collectionPriceMap.get(ELEM)!,
  //     collectionPriceMap.get(MBEAN)!,
  //     collectionPriceMap.get(GHOST)!,
  // ]);

  await printPrice(BAYC);
  await printPrice(PPG);
  // await printPrice(PUNKS);
  await printPrice(MAYC);
  await printPrice(OTHR);
  await printPrice(AZUKI);
  await printPrice(BAKC);
  await printPrice(MOONBIRD);
  await printPrice(CLONEX);
  await printPrice(DOODLE);
  await printPrice(MEEBITS);
  await printPrice(BEANZ);
  await printPrice(BLOCKS);
  await printPrice(EXP);
  await printPrice(VSL);
  await printPrice(KODA);
  await printPrice(DEGODS);
  await printPrice(HVMTL);
  await printPrice(ELEM);
  await printPrice(PPG);
  await printPrice(ELEM);
  await printPrice(MBEAN);
  await printPrice(GHOST);

  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await updateAllOracleWrapperSource();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
