import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import fs from "fs";
import {parseEther} from "ethers/lib/utils";
import {waitForTx} from "../../helpers/misc-utils";

export const ZK_USERS_PATH = "zk-users.json";
export const ZK_USERS_LEVEL_0_PATH = "zk-users-level0.json";
export const ZK_USERS_LEVEL_1_PATH = "zk-users-level1.json";
export const ZK_USERS_LEVEL_2_PATH = "zk-users-level2.json";

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const ensure_file_existed = async (filePath) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "[]");
    }
}

const filter_zksync_user = async () => {
    console.time("filter_zksync_user");

    if (fs.existsSync(ZK_USERS_PATH)) {
        const users = JSON.parse(fs.readFileSync(ZK_USERS_PATH, "utf8"));

        const startIndex = Number(process.env.AA_FILTER_START_INDEX || "0");

        const pool = await getPoolProxy();

        const valueUserArr0: Array<string> = JSON.parse(fs.readFileSync(ZK_USERS_LEVEL_0_PATH, "utf8"));
        const valueUserArr1: Array<string> = JSON.parse(fs.readFileSync(ZK_USERS_LEVEL_1_PATH, "utf8"));
        const valueUserArr2: Array<string> = JSON.parse(fs.readFileSync(ZK_USERS_LEVEL_2_PATH, "utf8"));
        const batchAmount = 50;
        for (let i=startIndex; i<users.length; i++) {
            const user = users[i];
            const value = (await pool.getUserAccountData(user)).totalCollateralBase;
            console.log("user index:", i);
            console.log("user totalCollateralBase value:", value);
            if (value.gt(parseEther("0"))) {
                valueUserArr0.push(user);
                if (value.gte(parseEther("0.1"))) {
                    valueUserArr1.push(user)
                    if (value.gte(parseEther("1"))) {
                        valueUserArr2.push(user)
                    }
                }
            }
            if ((i+1) % batchAmount == 0) {
                fs.writeFileSync(ZK_USERS_LEVEL_0_PATH, JSON.stringify(valueUserArr0));
                fs.writeFileSync(ZK_USERS_LEVEL_1_PATH, JSON.stringify(valueUserArr1));
                fs.writeFileSync(ZK_USERS_LEVEL_2_PATH, JSON.stringify(valueUserArr2));
                console.log("write file. stored index:", i);
            } else {
                await sleep(100);
            }
        }

        console.log("value0 user size:", valueUserArr0.length);
        console.log("value1 user size:", valueUserArr1.length);
        console.log("value2 user size:", valueUserArr2.length);

        fs.writeFileSync(ZK_USERS_LEVEL_0_PATH, JSON.stringify(valueUserArr0));
        fs.writeFileSync(ZK_USERS_LEVEL_1_PATH, JSON.stringify(valueUserArr1));
        fs.writeFileSync(ZK_USERS_LEVEL_2_PATH, JSON.stringify(valueUserArr2));
    } else {
        console.error("user list not existed");
    }

    console.timeEnd("filter_zksync_user");
};

async function main() {
    await rawBRE.run("set-DRE");
    await ensure_file_existed(ZK_USERS_LEVEL_0_PATH);
    await ensure_file_existed(ZK_USERS_LEVEL_1_PATH);
    await ensure_file_existed(ZK_USERS_LEVEL_2_PATH);
    await filter_zksync_user();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
