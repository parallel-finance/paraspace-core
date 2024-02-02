import {ethers} from "hardhat";
import {
  BigNumberish,
  BytesLike,
  providers,
  Signer,
  utils,
  Wallet,
} from "ethers";
import {
  InitializableAdminUpgradeabilityProxy,
  NFTFloorOracleProvider,
} from "../../types";
import {ALCHEMY_KEY} from "../../helpers/hardhat-constants";
import {getERC20} from "../../helpers/contracts-getters";
import {parseEther} from "ethers/lib/utils";
import {DRE} from "../../helpers/misc-utils";
import {convertSignatureToEIP2098} from "../../helpers/seaport-helpers/encoding";

//testnet
// const SourceChainProviderURL = `https://avalanche-fuji.infura.io/v3/865c34dcc8214c72bdd7f771f57c3821`;
// const SourceChainRouter = "0x554472a2720E5E7D5D3C817529aBA05EEd5F82D8";
// const SourceChainSelector = "14767482510784806043";
// const SourceChainLinkToken = "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846";
// const DestChainProviderURL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
// const DestChainRouter = "0xD0daae2231E9CB96b94C8512223533293C3693Bf";
// const DestChainSelector = "16015286601757825753";
// const SourceChainOracleAdmin = "0x018281853eCC543Aa251732e8FDaa7323247eBeB"; //source chain oracle admin
// const DestChainOracleAdmin = "0x018281853eCC543Aa251732e8FDaa7323247eBeB"; //dest chain oracle admin
// const SourceChainUpgradeAdmin = "0x4858CbD0691081EcA4F0182B0c706BDcaa670439"; //upgrade source chain oracle provider implementation
// const MessageIdSinger = "0x018281853eCC543Aa251732e8FDaa7323247eBeB";

//mainnet
const SourceChainProviderURL = `https://avalanche-mainnet.infura.io/v3/865c34dcc8214c72bdd7f771f57c3821`;
const SourceChainRouter = "0x27F39D0af3303703750D4001fCc1844c6491563c";
const SourceChainSelector = "6433500567565415381";
const SourceChainLinkToken = "0x5947BB275c521040051D82396192181b413227A3";
const DestChainProviderURL = `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`;
const DestChainRouter = "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D";
const DestChainSelector = "5009297550715157269";
const SourceChainOracleAdmin = "0xFF4c2F99815A30119eA55483D301Bd94632D2A14"; //source chain oracle admin
const DestChainOracleAdmin = "0xf2B18c20Ed5E5a6ABB15377D619C1879639339AD"; //dest chain oracle admin
const SourceChainUpgradeAdmin = "0xf2B18c20Ed5E5a6ABB15377D619C1879639339AD"; //upgrade source chain oracle provider implementation
const MessageIdSinger = "0x9d80F33eCdAb2515C3abcDD11e1dC3c7F7681eE7";

const WALLET_KEY = process.env.PRIVATE_KEY || "KEY NOT SET";

const SourceChainProvider = new providers.JsonRpcProvider(
  SourceChainProviderURL
);
const DestChainProvider = new providers.JsonRpcProvider(DestChainProviderURL);

const SourceChainWalletInstance = new Wallet(WALLET_KEY, SourceChainProvider);
const DestChainWalletInstance = new Wallet(WALLET_KEY, DestChainProvider);

const deployDestchainOracle = async () => {
  const nftOracleFactory = await ethers.getContractFactory("NFTFloorOracle");
  const nftOracle = await nftOracleFactory
    .connect(DestChainWalletInstance)
    .deploy(
      DestChainRouter,
      DestChainOracleAdmin,
      SourceChainSelector,
      "0x75B3B424fb782dA0e8DCf9E30396001E60e4Cc3B",
      43114,
      MessageIdSinger,
      {
        maxPriorityFeePerGas: "1000000000",
        maxFeePerGas: "30000000000",
        gasLimit: "2000000",
      }
    );
  await nftOracle.deployTransaction.wait(1);
  console.log("2. dest chain oracle deployed to:", nftOracle.address);
};

const deployCrossChainNftOracle = async () => {
  console.time("deploy cross chain nft oracle");
  console.log("start deploy cross chain nft oracle");

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
  //const pxoxy = await proxyFactory.attach("0x75B3B424fb782dA0e8DCf9E30396001E60e4Cc3B");

  // 2. deploy dest chain nft oracle
  const nftOracleFactory = await ethers.getContractFactory("NFTFloorOracle");
  const nftOracle = await nftOracleFactory
    .connect(DestChainWalletInstance)
    .deploy(
      DestChainRouter,
      DestChainOracleAdmin,
      SourceChainSelector,
      pxoxy.address,
      await SourceChainWalletInstance.getChainId(),
      MessageIdSinger
    );
  await nftOracle.deployTransaction.wait(1);
  console.log("2. dest chain oracle deployed to:", nftOracle.address);
  //const nftOracle = await nftOracleFactory.attach("0xe771bBe38A75586Cd565a6CA86ea6F2CdF6B478B");

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
      nftOracle.address,
      MessageIdSinger
    );
  await nftOracleProviderImpl.deployTransaction.wait(1);
  console.log(
    "3. source chain oracle provider implementation deployed to:",
    nftOracleProviderImpl.address
  );
  //const nftOracleProviderImpl = await nftOracleProviderFactory.attach("0x6C371408B66E6BcE852d694c542f199923578Def");

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
  ](nftOracleProviderImpl.address, SourceChainUpgradeAdmin, initData, {
    gasLimit: "1000000",
  });
  console.log("4. source chain oracle provider initialized");

  console.log("deploy cross chain nft oracle success");
  console.timeEnd("deploy cross chain nft oracle");
};

async function config() {
  //1. provider add addFeeders
  const nftOracleProviderFactory = await ethers.getContractFactory(
    "NFTFloorOracleProvider"
  );
  const nftOracleProvider = await nftOracleProviderFactory.attach(
    "0x5745553b21242d55798cf19E889cD721Df9cFfD7"
  );
  // await nftOracleProvider
  //   .connect(SourceChainWalletInstance).addFeeders(["0x018281853eCC543Aa251732e8FDaa7323247eBeB"], {
  //       gasLimit: "1000000"
  //     });
  // console.log("add feeder...");

  //2. provider add asset
  await nftOracleProvider
    .connect(SourceChainWalletInstance)
    .addAssets(
      [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
        "0x0000000000000000000000000000000000000004",
      ],
      {
        gasLimit: "1000000",
      }
    );
  console.log("add asset...");
}

async function feedPrice() {
  const nftOracleProviderFactory = await ethers.getContractFactory(
    "NFTFloorOracleProvider"
  );
  const nftOracleProvider = await nftOracleProviderFactory.attach(
    "0x5745553b21242d55798cf19E889cD721Df9cFfD7"
  );

  const domainData = {
    name: "ParaSpace",
    version: "1",
    chainId: await SourceChainWalletInstance.getChainId(),
    verifyingContract: nftOracleProvider.address,
  };

  const signMessageType = {
    MessageId: [{name: "id", type: "uint256"}],
  };

  const messageId = await nftOracleProvider
    .connect(SourceChainWalletInstance)
    .sentMessageId();
  const nextMessageId = messageId.add(1);

  const message = {
    id: nextMessageId,
  };

  const signature = await SourceChainWalletInstance._signTypedData(
    domainData,
    signMessageType,
    message
  );

  const vrs = utils.splitSignature(convertSignatureToEIP2098(signature));

  await nftOracleProvider.connect(SourceChainWalletInstance).setEmergencyPrice(
    [
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
    ],
    [1, 2],
    {
      v: vrs.v,
      r: vrs.r,
      s: vrs.s,
    },
    {
      gasLimit: "1000000",
    }
  );
  console.log("-----------setEmergencyPrice");
}

async function updateGasConfig() {
  const nftOracleProviderFactory = await ethers.getContractFactory(
    "NFTFloorOracleProvider"
  );
  const nftOracleProvider = await nftOracleProviderFactory.attach(
    "0x5745553b21242d55798cf19E889cD721Df9cFfD7"
  );

  await nftOracleProvider
    .connect(SourceChainWalletInstance)
    .setGasConfig(100000, 10000, 0, {
      gasLimit: "1000000",
    });
  console.log("-----------updateGasConfig");
}

async function upgradeProvider() {
  const SourceChainUpgraderInstance = new Wallet(
    "9dd35f770d6f9dd87fdeea1ecf8e53208cecbe6a1409eea77d71a0fa398d1372",
    SourceChainProvider
  );
  const nftOracleProviderFactory = await ethers.getContractFactory(
    "NFTFloorOracleProvider"
  );
  const nftOracleProviderImpl = await nftOracleProviderFactory
    .connect(SourceChainUpgraderInstance)
    .deploy(
      SourceChainRouter,
      SourceChainLinkToken,
      DestChainSelector,
      "0xe771bBe38A75586Cd565a6CA86ea6F2CdF6B478B",
      MessageIdSinger,
      {
        gasLimit: "5000000",
      }
    );
  await nftOracleProviderImpl.deployTransaction.wait(1);
  console.log(
    "1. source chain oracle provider implementation deployed to:",
    nftOracleProviderImpl.address
  );

  const proxyFactory = await ethers.getContractFactory(
    "InitializableAdminUpgradeabilityProxy"
  );
  await proxyFactory
    .attach("0x5745553b21242d55798cf19E889cD721Df9cFfD7")
    .connect(SourceChainUpgraderInstance)
    .upgradeTo(nftOracleProviderImpl.address, {
      gasLimit: "1000000",
    });
  console.log("2. upgraded");
}

async function fetchPrice() {
  const nftOracleFactory = await ethers.getContractFactory("NFTFloorOracle");
  const nftOracle = await nftOracleFactory
    .attach("0xe771bBe38A75586Cd565a6CA86ea6F2CdF6B478B")
    .connect(DestChainWalletInstance);
  const price = await nftOracle.getPrice(
    "0x0000000000000000000000000000000000000001"
  );
  console.log("price:", price);
}

async function main() {
  //not need to set DRE
  //await rawBRE.run("set-DRE");
  //await deployCrossChainNftOracle();
  //await config();
  //await feedPrice();
  //await upgradeProvider();
  //await fetchPrice();
  //await updateGasConfig();
  await deployDestchainOracle();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
