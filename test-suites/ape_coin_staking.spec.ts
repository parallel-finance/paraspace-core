import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {MAX_UINT_AMOUNT} from "../deploy/helpers/constants";
import { getPoolProxy, getProtocolDataProvider } from "../deploy/helpers/contracts-getters";
import {convertToCurrencyDecimals} from "../deploy/helpers/contracts-helpers";
import {waitForTx} from "../deploy/helpers/misc-utils";
import {ProtocolErrors} from "../deploy/helpers/types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";


import {
  borrowAndValidate,
  supplyAndValidate,
  switchCollateralAndValidate,
  withdrawAndValidate,
} from "./helpers/validated-steps";

describe("ape coin staking", () => {
    let testEnv: TestEnv;
    before(async () => {
      testEnv = await loadFixture(testEnvFixture);
    });

  it("User 1 deposits BAYC", async () => {

    const {
      users: [user1],
      bayc,
      nBAYC
    } = testEnv;
    const pool = await getPoolProxy();


    await supplyAndValidate(bayc, "1", user1, true);
    // await waitForTx(
    //     await bayc.connect(user1.signer)["mint(address)"](user1.address)
    //   );

    // await bayc.connect(user1.signer).approve(pool.address, 0);

    // await pool
    // .connect(user1.signer)
    // .supplyERC721(
    //   bayc.address,
    //   [{tokenId: 0, useAsCollateral: true}],
    //   user1.address,
    //   "0"
    // );


    // console.log(await nBAYC.balanceOf(user1.address))

  });




  it("User 1 stakes some apecoing with their BAYC", async () => {
    const {
      users: [user1],
      bayc,
      nBAYC,
      ape
    } = testEnv;

    const amount = await convertToCurrencyDecimals(ape.address, "20")

    await waitForTx(
        await ape
          .connect(user1.signer)
          ["mint(address,uint256)"](user1.address, amount)
      );

      console.log(
          "apecoinnnn", ape.address
      )

    
    await waitForTx(
    await ape
        .connect(user1.signer)
        .approve(nBAYC.address, MAX_UINT_AMOUNT)
    );

    
    nBAYC.connect(user1.signer).depositBAYC([{tokenId: 0, amount: amount}]);
  });





//   it("User 2 deposits 10k DAI and User 1 borrows 8K DAI", async () => {
//     const {
//       users: [user1, user2],
//       dai,
//     } = testEnv;

    // await supplyAndValidate(dai, firstDaiDeposit, user2, true);

//     // User 1 - Borrow dai
//     await borrowAndValidate(dai, "8000", user1);
//   });




});