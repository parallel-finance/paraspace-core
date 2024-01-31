import rawBRE from "hardhat";
import {
    getAggregator,
    getERC721OracleWrapper, getNFTFloorOracle,
    getParaSpaceOracle,
    getPoolAddressesProvider, getTimeLockExecutor
} from "../../helpers/contracts-getters";
import {DRY_RUN, GLOBAL_OVERRIDES, TIME_LOCK_BUFFERING_TIME} from "../../helpers/hardhat-constants";
import {dryRunEncodedData, getTimeLockDataInDb} from "../../helpers/contracts-helpers";
import {increaseTime, waitForTx} from "../../helpers/misc-utils";
import {assignWith} from "lodash";
import {ERC721OracleWrapper} from "../../types";
import {tEthereumAddress} from "../../helpers/types";
import {deployERC721OracleWrapper} from "../../helpers/contracts-deployments";
import {parseEther} from "ethers/lib/utils";
import {BigNumber} from "ethers";

const nftOracle = "0x18caa8c2ae8e479ead2ca24913ab21f73549195e";



const updateOracleWrapperSource =  async (oracleWrapper: ERC721OracleWrapper) => {
    if (DRY_RUN) {
        const encodedData = oracleWrapper.interface.encodeFunctionData(
            "setOracle",
            [nftOracle]
        );
        await dryRunEncodedData(oracleWrapper.address, encodedData);
    } else {
        await waitForTx(
            await oracleWrapper.setOracle(nftOracle)
        );
    }
}

const printPrice =  async (asset: string) => {
    console.log("asset:", asset);
    const paraspaceOracle = await getParaSpaceOracle();
    const nftOracleContract = await getNFTFloorOracle(nftOracle);
    const paraPrice = await paraspaceOracle.getAssetPrice(asset)
    console.log("paraPrice:", paraPrice);
    const nftPrice = await nftOracleContract.getPrice(asset);
    console.log("nftPrice:", nftPrice);
}

const adHoc = async () => {
  console.time("ad-hoc");

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

    const collectionPriceMap = new Map<string, BigNumber>();
    collectionPriceMap.set(BAYC, parseEther("25.5"));
    collectionPriceMap.set(PPG, parseEther("16.76"));
    collectionPriceMap.set(PUNKS, parseEther("60"));
    collectionPriceMap.set(MAYC, parseEther("4.43"));
    collectionPriceMap.set(OTHR, parseEther("0.48"));
    collectionPriceMap.set(AZUKI, parseEther("7.2"));
    collectionPriceMap.set(BAKC, parseEther("1.42"));
    collectionPriceMap.set(MOONBIRD, parseEther("1.19"));
    collectionPriceMap.set(CLONEX, parseEther("1.25"));
    collectionPriceMap.set(DOODLE, parseEther("2.48"));
    collectionPriceMap.set(MEEBITS, parseEther("1.17"));
    collectionPriceMap.set(BEANZ, parseEther("0.43"));
    collectionPriceMap.set(BLOCKS, parseEther("8.48"));
    collectionPriceMap.set(EXP, parseEther("0.27"));
    collectionPriceMap.set(VSL, parseEther("0.16"));
    collectionPriceMap.set(KODA, parseEther("3.75"));
    collectionPriceMap.set(DEGODS, parseEther("3.15"));
    collectionPriceMap.set(HVMTL, parseEther("0.27"));
    collectionPriceMap.set(ELEM, parseEther("0.71"));
    collectionPriceMap.set(MBEAN, parseEther("1.02"));
    collectionPriceMap.set(GHOST, parseEther("0.4"));

    const nftOracleContract = await getNFTFloorOracle(nftOracle);
    for (const entry of collectionPriceMap.entries()) {
        const encodedData = nftOracleContract.interface.encodeFunctionData(
            "setEmergencyPrice",
            [entry[0], entry[1]]
        );
        await dryRunEncodedData(nftOracleContract.address, encodedData);
    }


    // nftOracleContract.setEmergencyPrice(BAYC, parseEther("25.5"));
    // nftOracleContract.setEmergencyPrice(PPG, parseEther("16.76"));
    // nftOracleContract.setEmergencyPrice(PUNKS, parseEther("60"));
    // nftOracleContract.setEmergencyPrice(MAYC, parseEther("4.43"));
    // nftOracleContract.setEmergencyPrice(OTHR, parseEther("0.48"));
    // nftOracleContract.setEmergencyPrice(AZUKI, parseEther("7.2"));
    // nftOracleContract.setEmergencyPrice(BAKC, parseEther("1.42"));
    // nftOracleContract.setEmergencyPrice(MOONBIRD, parseEther("1.19"));
    // nftOracleContract.setEmergencyPrice(CLONEX, parseEther("1.25"));
    // nftOracleContract.setEmergencyPrice(DOODLE, parseEther("2.48"));
    // nftOracleContract.setEmergencyPrice(MEEBITS, parseEther("1.17"));
    // nftOracleContract.setEmergencyPrice(BEANZ, parseEther("0.43"));
    // nftOracleContract.setEmergencyPrice(BLOCKS, parseEther("8.48"));
    // nftOracleContract.setEmergencyPrice(EXP, parseEther("0.27"));
    // nftOracleContract.setEmergencyPrice(VSL, parseEther("0.16"));
    // nftOracleContract.setEmergencyPrice(KODA, parseEther("3.75"));
    // nftOracleContract.setEmergencyPrice(DEGODS, parseEther("3.15"));
    // nftOracleContract.setEmergencyPrice(HVMTL, parseEther("0.27"));
    // nftOracleContract.setEmergencyPrice(ELEM, parseEther("0.71"));
    // nftOracleContract.setEmergencyPrice(MBEAN, parseEther("1.02"));
    // nftOracleContract.setEmergencyPrice(GHOST, parseEther("0.4"));

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
    // await printPrice(PPG);
    // await printPrice(ELEM);
    // await printPrice(MBEAN);
    // await printPrice(GHOST);

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
