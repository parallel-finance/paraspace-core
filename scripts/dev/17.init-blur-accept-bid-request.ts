import rawBRE from "hardhat";
import {DRE, waitForTx} from "../../helpers/misc-utils";
import axios from "axios";
import {first} from "lodash";
import {impersonateAddress} from "../../helpers/contracts-helpers";
import {toBN} from "../../helpers/seaport-helpers/encoding";
import {ethers} from "ethers";
import {getAllTokens, getERC721} from "../../helpers/contracts-getters";

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

const initBlurAcceptBidRequest = async () => {
  await DRE.run("set-DRE");
  const {getPoolProxy} = await import("../../helpers/contracts-getters");
  const {getEthersSigners} = await import("../../helpers/contracts-helpers");

  const signer = first(await getEthersSigners());
  const pool = await getPoolProxy();
  const allTokens = await getAllTokens();

  // get Vessls listing from Reservior
  const contract = "0x5b1085136a811e55b2bb2ca1ea456ba82126a376";
  const url = `https://api.reservoir.tools/orders/bids/v5?source=blur.io&sortBy=price&status=active&contracts=${contract}&includeRawData=true`;
  const {
    data: {orders},
  } = await axios.get(url, {
    headers: {
      "x-api-key": process.env.RESERVIOR_kEY,
    },
  });

  const bid = orders[0];
  const tokenId = 28169;

  const { xTokenAddress } = await pool.getReserveData(contract);
  const nToken = await getERC721(xTokenAddress);
  const initiator = await nToken.ownerOf(tokenId);
  const initiatorSigner = await impersonateAddress(initiator);

  const blurRequest = {
    initiator,
    paymentToken: allTokens.WETH.address,
    bidingPrice: bid.price.amount.raw,
    marketPlaceFee: toBN(bid.price.amount.raw)
      .mul(toBN(bid.feeBps))
      .div(toBN(10000)),
    collection: bid.contract,
    tokenId,
    bidOrderHash: bid.id,
  };
  console.dir(blurRequest, {depth: null});

  // send initiateBlurExchangeRequest transaction.
  const tx = await waitForTx(
    await pool.connect(initiatorSigner.signer).initiateAcceptBlurBidsRequest([blurRequest])
  );
  console.log(tx)
  console.log("init blur request done.");
};

async function main() {
  await rawBRE.run("set-DRE");
  await syncToMainnet();
  await initBlurAcceptBidRequest();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
