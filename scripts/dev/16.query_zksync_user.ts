import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import {utils} from "ethers";
import fs from "fs";

export const ZK_USERS_PATH = "zk-users.json";

function sleep(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

const query_zksync_user = async () => {
    console.time("query_zksync_user");

    const pool = await getPoolProxy();

    const startBlock = 10102844;//testnet
    //const startBlock = 9676427;//mainnet
    const endBlock = await pool.provider.getBlockNumber();

    const EventId = utils.id("ReserveUsedAsCollateralEnabled(address,address)");
    const filter = {
        address: pool.address,
        topics: [
            EventId
        ]
    };

    const userSet:Set<string> = new Set();

    console.log("current block:", endBlock);
    const interval = 500000;
    for (let block = startBlock; block < endBlock; ) {
        console.log("---------query block:", block);
        const ret = await pool.queryFilter(filter, block, block+interval);
        for (let i=0;i <ret.length; i++) {
            userSet.add(ret[i].topics[2])
        }
        console.log("current record length = " + userSet.size);
        block=block+interval;

        await sleep(500);
    }

    console.log("total record length = " + userSet.size);

    const userArr: Array<string> = [];
    userSet.forEach((value) => {
        const address = "0x" + value.substring(26);
        userArr.push(address)
        console.log(address);
    })

    fs.writeFileSync(ZK_USERS_PATH, JSON.stringify(userArr));

    console.timeEnd("query_zksync_user");
};

async function main() {
    await rawBRE.run("set-DRE");
    await query_zksync_user();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
