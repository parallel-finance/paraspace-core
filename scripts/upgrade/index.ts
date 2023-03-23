import dotenv from "dotenv";
import {upgradePToken} from "./ptoken";
import {upgradeNToken} from "./ntoken";
import {resetPool} from "./pool";

dotenv.config();

export const upgradeAll = async (verify = false) => {
  await resetPool(verify);
  await upgradePToken(verify);
  await upgradeNToken(verify);
  console.log("upgrade all finished!");
};
