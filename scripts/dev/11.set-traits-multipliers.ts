import {toBn} from "evm-bn";
import rawBRE from "hardhat";
import {
  getAllTokens,
  getNToken,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {dryRunEncodedData} from "../../helpers/contracts-helpers";
import {DRY_RUN} from "../../helpers/hardhat-constants";
import {waitForTx} from "../../helpers/misc-utils";
import {ERC721TokenContractId} from "../../helpers/types";

const setTraitsMultipliers = async () => {
  console.time("set-traits-multipliers");
  const allTokens = await getAllTokens();
  const pool = await getPoolProxy();

  const bayc = allTokens[ERC721TokenContractId.BAYC];
  const mayc = allTokens[ERC721TokenContractId.MAYC];
  const bakc = allTokens[ERC721TokenContractId.BAKC];
  const othr = allTokens[ERC721TokenContractId.OTHR];
  const azuki = allTokens[ERC721TokenContractId.AZUKI];

  const nBAYC = await getNToken(
    (
      await pool.getReserveData(bayc.address)
    ).xTokenAddress
  );
  const nMAYC = await getNToken(
    (
      await pool.getReserveData(mayc.address)
    ).xTokenAddress
  );
  const nBAKC = await getNToken(
    (
      await pool.getReserveData(bakc.address)
    ).xTokenAddress
  );
  const nOTHR = await getNToken(
    (
      await pool.getReserveData(othr.address)
    ).xTokenAddress
  );
  const nAZUKI = await getNToken(
    (
      await pool.getReserveData(azuki.address)
    ).xTokenAddress
  );

  if (DRY_RUN) {
    const encodedData1 = nBAYC.interface.encodeFunctionData(
      "setTraitsMultipliers",
      [
        ["46", "77", "49", "42", "69"],
        [toBn("6"), toBn("2.5"), toBn("2.7"), toBn("1.8"), toBn("1.2")],
      ]
    );
    await dryRunEncodedData(nBAYC.address, encodedData1);

    const encodedData2 = nMAYC.interface.encodeFunctionData(
      "setTraitsMultipliers",
      [
        ["51", "59", "87", "78", "44"],
        [toBn("2.6"), toBn("1.8"), toBn("1.4"), toBn("1.2"), toBn("1.2")],
      ]
    );
    await dryRunEncodedData(nMAYC.address, encodedData2);

    const encodedData3 = nBAKC.interface.encodeFunctionData(
      "setTraitsMultipliers",
      [
        ["98", "110", "64"],
        [toBn("1.8"), toBn("1.2"), toBn("1.2")],
      ]
    );
    await dryRunEncodedData(nBAKC.address, encodedData3);

    const encodedData4 = nOTHR.interface.encodeFunctionData(
      "setTraitsMultipliers",
      [["10000"], [toBn("6")]]
    );
    await dryRunEncodedData(nOTHR.address, encodedData4);

    const encodedData5 = nAZUKI.interface.encodeFunctionData(
      "setTraitsMultipliers",
      [
        ["97", "21", "22", "49", "48", "58", "53", "88"],
        [
          toBn("6.5"),
          toBn("4"),
          toBn("4"),
          toBn("2.7"),
          toBn("2.5"),
          toBn("2.5"),
          toBn("2.3"),
          toBn("2"),
        ],
      ]
    );
    await dryRunEncodedData(nAZUKI.address, encodedData5);
  } else {
    await waitForTx(
      await nBAYC.setTraitsMultipliers(
        ["46", "77", "49", "42", "69"],
        [toBn("6"), toBn("2.5"), toBn("2.7"), toBn("1.8"), toBn("1.2")]
      )
    );
    await waitForTx(
      await nMAYC.setTraitsMultipliers(
        ["51", "59", "87", "78", "44"],
        [toBn("2.6"), toBn("1.8"), toBn("1.4"), toBn("1.2"), toBn("1.2")]
      )
    );
    await waitForTx(
      await nBAKC.setTraitsMultipliers(
        ["98", "110", "64"],
        [toBn("1.8"), toBn("1.2"), toBn("1.2")]
      )
    );
    await waitForTx(await nOTHR.setTraitsMultipliers(["10000"], [toBn("6")]));
    await waitForTx(
      await nAZUKI.setTraitsMultipliers(
        ["97", "21", "22", "49", "48", "58", "53", "88"],
        [
          toBn("6.5"),
          toBn("4"),
          toBn("4"),
          toBn("2.7"),
          toBn("2.5"),
          toBn("2.5"),
          toBn("2.3"),
          toBn("2"),
        ]
      )
    );
  }

  console.timeEnd("set-traits-multipliers");
};

async function main() {
  await rawBRE.run("set-DRE");
  await setTraitsMultipliers();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
