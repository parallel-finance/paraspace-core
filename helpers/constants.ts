// ----------------
// MATH
// ----------------

import {BigNumber} from "ethers";
import {parseUnits, solidityKeccak256} from "ethers/lib/utils";

export const PERCENTAGE_FACTOR = "10000";
export const HALF_PERCENTAGE = BigNumber.from(PERCENTAGE_FACTOR)
  .div(2)
  .toString();
export const WAD = BigNumber.from(10).pow(18).toString();
export const HALF_WAD = BigNumber.from(WAD).div(2).toString();
export const RAY = BigNumber.from(10).pow(27).toString();
export const HALF_RAY = BigNumber.from(RAY).div(2).toString();
export const WAD_RAY_RATIO = parseUnits("1", 9).toString();
export const oneEther = parseUnits("1", 18);
export const oneRay = parseUnits("1", 27);
export const MAX_UINT_AMOUNT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
export const MAX_BORROW_CAP = "68719476735";
export const MAX_SUPPLY_CAP = "68719476735";
export const MAX_UNBACKED_MINT_CAP = "68719476735";
export const ONE_YEAR = "31536000";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const ONE_ADDRESS = "0x0000000000000000000000000000000000000001";
export const SAPE_ADDRESS = ONE_ADDRESS;

// ----------------
// MARKETPLACE
// ----------------
export const OPENSEA_SEAPORT_ID = solidityKeccak256(
  ["string"],
  ["Opensea/seaport/v1.1"]
);

export const PARASPACE_SEAPORT_ID = solidityKeccak256(
  ["string"],
  ["ParaSpace/seaport/v1.1"]
);

export const LOOKSRARE_ID = solidityKeccak256(["string"], ["LooksRare/v1.1"]);
export const X2Y2_ID = solidityKeccak256(["string"], ["X2Y2/v1"]);
export const BLUR_ID = solidityKeccak256(["string"], ["Blur/v1"]);
