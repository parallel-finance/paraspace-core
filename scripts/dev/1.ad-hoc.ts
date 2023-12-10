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

    const addressProvider = await getPoolAddressesProvider();


    //use chainlink and need deploy OracleWrapper and update paraspace oracle
    const DOODLE = "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e";
    const WPUNKS = "0xb7F7F6C52F2e2fdb1963Eab30438024864c313F6";
    const MAYC = "0x60E4d786628Fea6478F785A6d7e704777c86a7c6";
    const CLONEX = "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b";
    const MOONBIRD = "0x23581767a106ae21c074b2276d25e5c3e136a68b";
    const OTHR = "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258";
    const BEANZ = "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949";

    const doodleAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        DOODLE,
        "DOODLE",
        false
    );
    const wpunkAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB",//punk address
        "WPUNKS",
        false
    );

    const maycAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        MAYC,
        "MAYC",
        false
    );

    const clonexAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        CLONEX,
        "CloneX",
        false
    );

    const moonbirdAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        MOONBIRD,
        "MOONBIRD",
        false
    );

    const otherAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        OTHR,
        "OTHR",
        false
    );

    const beanzAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        BEANZ,
        "BEANZ",
        false
    );


    //share v1 OracleWrapper and need to deploy OracleWrapper and update paraspace oracle
    const BAKC = "0xba30E5F9Bb24caa003E9f2f0497Ad287FDF95623";

    const bakcAggregator = await deployERC721OracleWrapper(
        addressProvider.address,
        nftOracle,
        BAKC,
        "BAKC",
        false
    );

    //share v1 OracleWrapper and don't need deploy OracleWrapper and update paraspace oracle
    const HVMTL = "0x4b15a9c28034dC83db40CD810001427d3BD7163D";//need verify code
    const DEGODS = "0x8821bee2ba0df28761afff119d66390d594cd280";//need verify code
    const EXP = "0x790b2cf29ed4f310bf7641f013c65d4560d28371";//need verify code
    const VSL = "0x5b1085136a811e55b2bb2ca1ea456ba82126a376";//need verify code
    const KODA = "0xe012baf811cf9c05c408e879c399960d1f305903";//need verify code
    const BLOCKS = "0x059EDD72Cd353dF5106D2B9cC5ab83a52287aC3a";//need verify code
    const MEEBITS = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";//need verify code

    const hvmtlAggregator = await getERC721OracleWrapper("HVMTL")
    await updateOracleWrapperSource(hvmtlAggregator)

    const degodsAggregator = await getERC721OracleWrapper("DEGODS")
    await updateOracleWrapperSource(degodsAggregator)

    const expAggregator = await getERC721OracleWrapper("EXP")
    await updateOracleWrapperSource(expAggregator)

    const vslAggregator = await getERC721OracleWrapper("VSL")
    await updateOracleWrapperSource(vslAggregator)

    const kodaAggregator = await getERC721OracleWrapper("KODA")
    await updateOracleWrapperSource(kodaAggregator)

    const blocksAggregator = await getERC721OracleWrapper("BLOCKS")
    await updateOracleWrapperSource(blocksAggregator)

    const meebitsAggregator = await getERC721OracleWrapper("MEEBITS");
    await updateOracleWrapperSource(meebitsAggregator);

    const paraspaceOracle = await getParaSpaceOracle();

    const assetArray = [
        DOODLE,
        WPUNKS,
        MAYC,
        CLONEX,
        MOONBIRD,
        OTHR,
        BEANZ,
        BAKC,
        HVMTL,
        DEGODS,
        EXP,
        VSL,
        KODA,
        BLOCKS,
        MEEBITS
    ];
    const nftOracleArray = [
        doodleAggregator.address,
        wpunkAggregator.address,
        maycAggregator.address,
        clonexAggregator.address,
        moonbirdAggregator.address,
        otherAggregator.address,
        beanzAggregator.address,
        bakcAggregator.address,
        hvmtlAggregator.address,
        degodsAggregator.address,
        expAggregator.address,
        vslAggregator.address,
        kodaAggregator.address,
        blocksAggregator.address,
        meebitsAggregator.address
    ];
    if (DRY_RUN) {
        const encodedData = paraspaceOracle.interface.encodeFunctionData(
            "setAssetSources",
            [assetArray, nftOracleArray]
        );
        await dryRunEncodedData(paraspaceOracle.address, encodedData);
    } else {
        await waitForTx(
            await paraspaceOracle.setAssetSources(assetArray, nftOracleArray)
        );
    }

    //need update OracleWrapper source
    const GHOST = "0x9401518f4ebba857baa879d9f76e1cc8b31ed197";
    const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
    const AZUKI = "0xed5af388653567af2f388e6224dc7c4b3241c544";
    const PPG = "0xbd3531da5cf5857e7cfaa92426877b022e612cf8";
    const ELEM = "0xB6a37b5d14D502c3Ab0Ae6f3a0E058BC9517786e";
    const MBEAN = "0x3Af2A97414d1101E2107a70E7F33955da1346305";

    const ghostAggregator = await getERC721OracleWrapper("GHOST");
    await updateOracleWrapperSource(ghostAggregator);

    const baycAggregator = await getERC721OracleWrapper("BAYC");
    await updateOracleWrapperSource(baycAggregator);

    const azukiAggregator = await getERC721OracleWrapper("AZUKI");
    await updateOracleWrapperSource(azukiAggregator);

    const ppgAggregator = await getERC721OracleWrapper("PPG");
    await updateOracleWrapperSource(ppgAggregator);

    const elemAggregator = await getERC721OracleWrapper("ELEM");
    await updateOracleWrapperSource(elemAggregator);

    const mbeanAggregator = await getERC721OracleWrapper("MBEAN");
    await updateOracleWrapperSource(mbeanAggregator);
/*
    const timeLock = await getTimeLockExecutor();
    const actions = await getTimeLockDataInDb();

    for (const a of actions) {
        console.log(a.actionHash);
        if (await timeLock.isActionQueued(a.actionHash)) {
            continue;
        }
        await waitForTx(
            await timeLock.queueTransaction(...a.action, GLOBAL_OVERRIDES)
        );
    }
    console.log("----------queue-buffered-txs finish.");

    const delay = await timeLock.getDelay();
    await increaseTime(delay.add(TIME_LOCK_BUFFERING_TIME).toNumber());
    console.log("----------increase-to-execution-time finish.");

    for (const a of actions) {
        console.log(a.actionHash);
        if (!(await timeLock.isActionQueued(a.actionHash))) {
            continue;
        }
        await waitForTx(
            await timeLock.executeTransaction(...a.action, GLOBAL_OVERRIDES)
        );
    }
    console.log("----------execute-buffered-txs finish.");


    await printPrice(DOODLE);
    //await printPrice(WPUNKS);
    await printPrice(MAYC);
    await printPrice(CLONEX);
    await printPrice(MOONBIRD);
    await printPrice(OTHR);
    await printPrice(BEANZ);
    await printPrice(BAKC);
    await printPrice(HVMTL);
    await printPrice(DEGODS);
    await printPrice(EXP);
    await printPrice(VSL);
    await printPrice(KODA);
    await printPrice(BLOCKS);
    await printPrice(GHOST);
    await printPrice(BAYC);
    await printPrice(AZUKI);
    await printPrice(MEEBITS);
    await printPrice(PPG);
    await printPrice(ELEM);
    await printPrice(MBEAN);*/

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
