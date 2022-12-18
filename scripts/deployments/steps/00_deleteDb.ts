import fs from "fs";
import {DB_PATH} from "../../../helpers/hardhat-constants";

export const step_00 = async () => {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
};
