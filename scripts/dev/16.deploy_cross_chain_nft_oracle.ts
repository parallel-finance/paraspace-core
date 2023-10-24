import {ethers} from "hardhat";
import {providers, Wallet} from "ethers";
import {InitializableAdminUpgradeabilityProxy} from "../../types";
import {ALCHEMY_KEY} from "../../helpers/hardhat-constants";

const SourceChainProviderURL = `https://arb-goerli.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const SourceChainRouter = "0x88E492127709447A5ABEFdaB8788a15B4567589E";
const SourceChainSelector = "6101244977088475029";
const SourceChainLinkToken = "0xd14838A68E8AFBAdE5efb411d5871ea0011AFd28";
const DestChainProviderURL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const DestChainRouter = "0xD0daae2231E9CB96b94C8512223533293C3693Bf";
const DestChainSelector = "16015286601757825753";
const SourceChainOracleAdmin = "0x018281853eCC543Aa251732e8FDaa7323247eBeB"; //source chain oracle admin
const DestChainOracleAdmin = "0x018281853eCC543Aa251732e8FDaa7323247eBeB"; //dest chain oracle admin
const SourceChainUpgradeAdmin = "0x4858CbD0691081EcA4F0182B0c706BDcaa670439"; //upgrade source chain oracle provider implementation
const WALLET_KEY = process.env.PRIVATE_KEY || "KEY NOT SET";

const deployCrossChainNftOracle = async () => {
  console.time("deploy cross chain nft oracle");
  console.log("start deploy cross chain nft oracle");

  const SourceChainProvider = new providers.JsonRpcProvider(
    SourceChainProviderURL
  );
  const DestChainProvider = new providers.JsonRpcProvider(DestChainProviderURL);

  const SourceChainWalletInstance = new Wallet(WALLET_KEY, SourceChainProvider);
  const DestChainWalletInstance = new Wallet(WALLET_KEY, DestChainProvider);

  // 1. deploy source chain oracle provider proxy
  const proxyFactory = await ethers.getContractFactory(
    "InitializableAdminUpgradeabilityProxy"
  );
  const pxoxy = await proxyFactory.connect(SourceChainWalletInstance).deploy();
  await pxoxy.deployTransaction.wait(1);
  console.log(
    "1. source chain oracle provider proxy deployed to:",
    pxoxy.address
  );

  // 2. deploy dest chain nft oracle
  const nftOracleFactory = await ethers.getContractFactory("NFTFloorOracle");
  const nftOracle = await nftOracleFactory
    .connect(DestChainWalletInstance)
    .deploy(
      DestChainRouter,
      DestChainOracleAdmin,
      SourceChainSelector,
      pxoxy.address
    );
  await nftOracle.deployTransaction.wait(1);
  console.log("2. dest chain oracle deployed to:", nftOracle.address);

  // 3. deploy source chain oracle provider implementation
  const nftOracleProviderFactory = await ethers.getContractFactory(
    "NFTFloorOracleProvider"
  );
  const nftOracleProviderImpl = await nftOracleProviderFactory
    .connect(SourceChainWalletInstance)
    .deploy(
      SourceChainRouter,
      SourceChainLinkToken,
      DestChainSelector,
      nftOracle.address
    );
  await nftOracleProviderImpl.deployTransaction.wait(1);
  console.log(
    "3. source chain oracle provider implementation deployed to:",
    nftOracleProviderImpl.address
  );

  // 4. init source chain oracle provider
  const initData = nftOracleProviderFactory.interface.encodeFunctionData(
    "initialize",
    [SourceChainOracleAdmin, [], []]
  );
  const proxyInstance = proxyFactory
    .attach(pxoxy.address)
    .connect(SourceChainWalletInstance);
  await (proxyInstance as InitializableAdminUpgradeabilityProxy)[
    "initialize(address,address,bytes)"
  ](nftOracleProviderImpl.address, SourceChainUpgradeAdmin, initData);
  console.log("4. source chain oracle provider initialized");

  console.log("deploy cross chain nft oracle success");
  console.timeEnd("deploy cross chain nft oracle");
};

async function main() {
  //not need to set DRE
  //await rawBRE.run("set-DRE");
  await deployCrossChainNftOracle();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
