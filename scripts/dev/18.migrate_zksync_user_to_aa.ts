import rawBRE from "hardhat";
import {getPoolProxy} from "../../helpers/contracts-getters";
import fs from "fs";
import {waitForTx} from "../../helpers/misc-utils";

export const ZK_USERS_PATH = "zk-users.json";

const migrate_zksync_user = async () => {
  console.time("migrate_zksync_user");

  if (fs.existsSync(ZK_USERS_PATH)) {
    const users = JSON.parse(fs.readFileSync(ZK_USERS_PATH, "utf8"));

    const startIndex = Number(process.env.AA_MIGRATION_START_INDEX || "0");

    const pool = await getPoolProxy();

    const batchAmount = 20;
    let migrationUsers: Array<string> = [];
    let userSalts: Array<string> = [];
    let usersCount = 0;
    for (let i = startIndex; i < users.length; i++) {
      migrationUsers.push(users[i]);
      userSalts.push(String(i+2));
      usersCount++;
      if (usersCount == batchAmount || i == users.length - 1) {
        await waitForTx(await pool.batchPositionMoveToAA(migrationUsers, userSalts));

        migrationUsers = [];
        userSalts = [];
        usersCount = 0;
        if (i == users.length - 1) {
          console.log("migration success.");
        } else {
          console.log("next migration index:", i + 1);
        }
      }
    }
  } else {
    console.error("user list not existed");
  }

  console.timeEnd("migrate_zksync_user");
};

async function main() {
  await rawBRE.run("set-DRE");
  await migrate_zksync_user();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
