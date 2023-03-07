import {fromBn} from "evm-bn";
import rawBRE from "hardhat";
import {
  getAllTokens,
  getNToken,
  getPoolProxy,
} from "../../helpers/contracts-getters";
import {ERC721TokenContractId} from "../../helpers/types";
import {NToken} from "../../types";

const getTokens = async (ntoken: NToken, user: string) => {
  const balance = (await ntoken.balanceOf(user)).toNumber();
  const res: string[] = [];
  for (let i = 0; i < balance; i++) {
    const tokenId = await ntoken.tokenOfOwnerByIndex(user, i);
    if (!(await ntoken.isUsedAsCollateral(tokenId))) {
      continue;
    }
    res.push(tokenId.toString());
  }
  return res;
};

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
  const ntokens = [nBAYC, nMAYC, nBAKC, nOTHR, nAZUKI];

  const users: {
    [user: string]: {
      [asset: string]: {
        avgMultiplier: string;
        traitBoostedTokenIds: string[];
        tokenIds: string[];
      };
    };
  } = {};

  for (const ntoken of ntokens) {
    const filter = ntoken.filters.AvgMultiplierUpdated(undefined, undefined);
    const events = await ntoken.queryFilter(filter);

    for (const e of events) {
      if (!users[e.args.owner]) {
        users[e.args.owner] = {};
      }

      const tokenIds = (
        await ntoken.queryFilter(
          ntoken.filters.TraitMultiplierSet(e.args.owner)
        )
      ).map((x) => x.args.tokenId.toString());

      users[e.args.owner][await ntoken.symbol()] = {
        avgMultiplier: fromBn(await ntoken.avgMultiplierOf(e.args.owner)),
        traitBoostedTokenIds: tokenIds,
        tokenIds: await getTokens(ntoken, e.args.owner),
      };
    }
  }

  console.log(JSON.stringify(users, null, 4));

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
