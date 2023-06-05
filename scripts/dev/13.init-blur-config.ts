import { ethers } from "ethers";
import rawBRE from "hardhat";
import { DRE } from "../../helpers/misc-utils";
import { deployPriceOracle } from "../../helpers/contracts-deployments";
import { getAllTokens } from "../../helpers/contracts-getters";

const initBlurConfig = async () => {

  await DRE.run("set-DRE");
  const { getPoolProxy, getBlurExchangeProxy, getParaSpaceOracle } = await import(
    "../../helpers/contracts-getters"
  );
  const { impersonateAddress } = await import("../../helpers/contracts-helpers");
  const pool = await getPoolProxy();
  const oracle = await getParaSpaceOracle();

  // the maximum number of ongoing valid requests
  const limit = 5;
  // keeper must have enough eth balance on mainnet.
  const blurExchangeKeeper = process.env.KEEPER_ADDRESS_1;
  const acceptBlurBidsKeeper = process.env.KEEPER_ADDRESS_2;

  // initialize blur config
  await pool.enableBlurExchange();
  await pool.enableAcceptBlurBids();
  await pool.setBlurOngoingRequestLimit(limit);
  await pool.setAcceptBlurBidsOngoingRequestLimit(limit);
  if (blurExchangeKeeper && acceptBlurBidsKeeper) {
    await pool.setBlurExchangeKeeper(blurExchangeKeeper);
    await pool.setAcceptBlurBidsKeeper(acceptBlurBidsKeeper);
    await impersonateAddress(blurExchangeKeeper);
    await impersonateAddress(acceptBlurBidsKeeper);
  }

  const blurOwner = await impersonateAddress(
    "0xFA9fB502534761dBDDAcf5B7e2Aa84684815F1bb"
  );
  const blurExchange = await getBlurExchangeProxy(
    "0x000000000000Ad05Ccc4F10045630fb830B95127"
  );
  await blurExchange.connect(blurOwner.signer).setBlockRange(1000000);

  const fallbackOracle = await deployPriceOracle(false);
  const allTokens = await getAllTokens();

  await fallbackOracle.setAssetPrice(
    allTokens.VSL.address,
    await oracle.getAssetPrice(allTokens.VSL.address)
  );
  await fallbackOracle.setAssetPrice(
    allTokens.EXP.address,
    await oracle.getAssetPrice(allTokens.EXP.address)
  );
  await fallbackOracle.setAssetPrice(
    allTokens.KODA.address,
    await oracle.getAssetPrice(allTokens.KODA.address)
  );
  await fallbackOracle.setAssetPrice(
    allTokens.DEGODS.address,
    await oracle.getAssetPrice(allTokens.DEGODS.address)
  );
  await fallbackOracle.setAssetPrice(
    allTokens.BLOCKS.address,
    await oracle.getAssetPrice(allTokens.BLOCKS.address)
  );
  await fallbackOracle.setAssetPrice(
    allTokens.MEEBITS.address,
    await oracle.getAssetPrice(allTokens.MEEBITS.address)
  );
  await fallbackOracle.setAssetPrice(
    allTokens.BAKC.address,
    await oracle.getAssetPrice(allTokens.BAKC.address)
  );
  await fallbackOracle.setAssetPrice(
    allTokens.HVMTL.address,
    await oracle.getAssetPrice(allTokens.HVMTL.address)
  );

  await oracle.setAssetSources(
    [
      allTokens.VSL.address,
      allTokens.EXP.address,
      allTokens.KODA.address,
      allTokens.DEGODS.address,
      allTokens.BLOCKS.address,
      allTokens.MEEBITS.address,
      allTokens.BAKC.address,
      allTokens.SEWER.address,
      allTokens.HVMTL.address,
    ],
    [
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
    ]
  );
  await oracle.setFallbackOracle(fallbackOracle.address);

  await DRE.network.provider.send("evm_setAutomine", [false]);
  await DRE.network.provider.send("evm_setIntervalMining", [5000]);
};

async function main() {
  await rawBRE.run("set-DRE");
  await initBlurConfig();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });