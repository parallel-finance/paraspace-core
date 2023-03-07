import {fromBn} from "evm-bn";
import rawBRE from "hardhat";
import {ZERO_ADDRESS} from "../../helpers/constants";
import {
  getAllTokens,
  getNToken,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {ERC721TokenContractId} from "../../helpers/types";

const adHoc = async () => {
  console.time("ad-hoc");
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

  const filterBAYC = nBAYC.filters.TraitMultiplierSet(undefined, undefined);
  for (const e of (await nBAYC.queryFilter(filterBAYC)).filter(
    (x) => x.args.owner != ZERO_ADDRESS
  )) {
    console.log(
      "BAYC",
      e.args.owner,
      fromBn(await nBAYC.avgMultiplierOf(e.args.owner)),
      (
        await nBAYC.queryFilter(
          nBAYC.filters.TraitMultiplierSet(e.args.owner, undefined)
        )
      ).map((e) => e.args.tokenId.toString())
    );
  }

  const filterMAYC = nMAYC.filters.TraitMultiplierSet(undefined, undefined);
  for (const e of (await nMAYC.queryFilter(filterMAYC)).filter(
    (x) => x.args.owner != ZERO_ADDRESS
  )) {
    console.log(
      "MAYC",
      e.args.owner,
      fromBn(await nMAYC.avgMultiplierOf(e.args.owner)),
      (
        await nMAYC.queryFilter(
          nMAYC.filters.TraitMultiplierSet(e.args.owner, undefined)
        )
      ).map((e) => e.args.tokenId.toString())
    );
  }

  const filterBAKC = nBAKC.filters.TraitMultiplierSet(undefined, undefined);
  for (const e of (await nBAKC.queryFilter(filterBAKC)).filter(
    (x) => x.args.owner != ZERO_ADDRESS
  )) {
    console.log(
      "BAKC",
      e.args.owner,
      fromBn(await nBAKC.avgMultiplierOf(e.args.owner)),
      (
        await nBAKC.queryFilter(
          nBAKC.filters.TraitMultiplierSet(e.args.owner, undefined)
        )
      ).map((e) => e.args.tokenId.toString())
    );
  }

  const filterOTHR = nOTHR.filters.TraitMultiplierSet(undefined, undefined);
  for (const e of (await nOTHR.queryFilter(filterOTHR)).filter(
    (x) => x.args.owner != ZERO_ADDRESS
  )) {
    console.log(
      "OTHR",
      e.args.owner,
      fromBn(await nOTHR.avgMultiplierOf(e.args.owner)),
      (
        await nOTHR.queryFilter(
          nOTHR.filters.TraitMultiplierSet(e.args.owner, undefined)
        )
      ).map((e) => e.args.tokenId.toString())
    );
  }

  const filterAZUKI = nAZUKI.filters.TraitMultiplierSet(undefined, undefined);
  for (const e of (await nAZUKI.queryFilter(filterAZUKI)).filter(
    (x) => x.args.owner != ZERO_ADDRESS
  )) {
    console.log(
      "AZUKI",
      e.args.owner,
      fromBn(await nAZUKI.avgMultiplierOf(e.args.owner)),
      (
        await nAZUKI.queryFilter(
          nAZUKI.filters.TraitMultiplierSet(e.args.owner, undefined)
        )
      ).map((e) => e.args.tokenId.toString())
    );
  }

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
