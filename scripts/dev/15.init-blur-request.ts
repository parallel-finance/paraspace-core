import rawBRE from "hardhat";
import {DRE, waitForTx} from "../../helpers/misc-utils";
import axios from "axios";
import {first} from "lodash";
import {} from "../../helpers/contracts-helpers";
import {toBN} from "../../helpers/seaport-helpers/encoding";
import {ethers} from "ethers";

const syncToMainnet = async () => {
  const mainnetProvider = new ethers.providers.StaticJsonRpcProvider(
    `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
    1
  );
  const mainnetBlock = await mainnetProvider.getBlock("latest");
  console.log(
    `current mainnet block:${mainnetBlock.number}, timestamp:${mainnetBlock.timestamp}`
  );

  const forkBlock = await DRE.ethers.provider.getBlock("latest");
  if (mainnetBlock.number > forkBlock.number) {
    for (
      let index = 0;
      index < mainnetBlock.number - forkBlock.number + 2;
      index++
    ) {
      await DRE.network.provider.send("evm_mine");
    }
  }

  const newForkBlock = await DRE.ethers.provider.getBlock("latest");
  console.log(
    `current fork block:${newForkBlock.number}, timestamp:${newForkBlock.timestamp}`
  );
};

const initBlurRequest = async () => {
  await DRE.run("set-DRE");
  const {getPoolProxy} = await import("../../helpers/contracts-getters");
  const {getEthersSigners} = await import("../../helpers/contracts-helpers");

  const signer = first(await getEthersSigners());
  const pool = await getPoolProxy();

  // get Vessls listing from Reservior
  const contract = "0x5b1085136a811e55b2bb2ca1ea456ba82126a376";
  const url = `https://api.reservoir.tools/orders/asks/v4?source=blur.io&sortBy=price&status=active&contracts=${contract}`;
  const {
    data: {orders},
  } = await axios.get(url, {
    headers: {
      "x-api-key": process.env.RESERVIOR_kEY,
    },
  });

  // init uses a different listing each time
  const listing = orders[9];

  const blurRequest = {
    initiator: (await signer?.getAddress()) || "",
    paymentToken: listing.price.currency.contract,
    listingPrice: listing.price.amount.raw,
    borrowAmount: 0,
    collection: listing.contract,
    tokenId: listing.criteria.data.token.tokenId,
  };
  console.dir(blurRequest, {depth: null});

  // send initiateBlurExchangeRequest transaction.
  await waitForTx(
    await pool.connect(signer).initiateBlurExchangeRequest(blurRequest, {
      value: toBN(blurRequest.listingPrice).sub(blurRequest.borrowAmount),
    })
  );
  console.log("init blur request done.");
};

async function main() {
  await rawBRE.run("set-DRE");
  await syncToMainnet();
  await initBlurRequest();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
