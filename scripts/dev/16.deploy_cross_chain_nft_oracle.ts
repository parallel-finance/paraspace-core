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

const BAYC = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
const PPG = "0xbd3531da5cf5857e7cfaa92426877b022e612cf8";
const PUNKS = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb";
const MAYC = "0x60E4d786628Fea6478F785A6d7e704777c86a7c6";
const OTHR = "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258";
const AZUKI = "0xed5af388653567af2f388e6224dc7c4b3241c544";
const BAKC = "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623";
const MOONBIRD = "0x23581767a106ae21c074b2276d25e5c3e136a68b";
const CLONEX = "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b";
const DOODLE = "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e";
const MEEBITS = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";
const BEANZ = "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949";
const BLOCKS = "0x059EDD72Cd353dF5106D2B9cC5ab83a52287aC3a";
const EXP = "0x790b2cf29ed4f310bf7641f013c65d4560d28371";
const VSL = "0x5b1085136a811e55b2bb2ca1ea456ba82126a376";
const KODA = "0xe012baf811cf9c05c408e879c399960d1f305903";
const DEGODS = "0x8821bee2ba0df28761afff119d66390d594cd280";
const HVMTL = "0x4b15a9c28034dC83db40CD810001427d3BD7163D";
const ELEM = "0xB6a37b5d14D502c3Ab0Ae6f3a0E058BC9517786e";
const MBEAN = "0x3Af2A97414d1101E2107a70E7F33955da1346305";
const GHOST = "0x9401518f4ebba857baa879d9f76e1cc8b31ed197";

//testnet
// const SourceChainProviderURL = `https://avalanche-fuji.infura.io/v3/865c34dcc8214c72bdd7f771f57c3821`;
// const SourceChainRouter = "0xF694E193200268f9a4868e4Aa017A0118C9a8177";
// const SourceChainSelector = "14767482510784806043";
// const SourceChainLinkToken = "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846";
// const DestChainProviderURL = `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
// const DestChainRouter = "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59";
// const DestChainSelector = "16015286601757825753";
// const SourceChainOracleAdmin = "0x018281853eCC543Aa251732e8FDaa7323247eBeB"; //source chain oracle admin
// const DestChainOracleAdmin = "0x018281853eCC543Aa251732e8FDaa7323247eBeB"; //dest chain oracle admin
// const SourceChainUpgradeAdmin = "0x4858CbD0691081EcA4F0182B0c706BDcaa670439"; //upgrade source chain oracle provider implementation
// const MessageIdSinger = "0x018281853eCC543Aa251732e8FDaa7323247eBeB";
// const SourceChainID = "43113";
// /*deployed info, only used for upgrade*/
// const SourceChainOracleProvider = "0x5745553b21242d55798cf19E889cD721Df9cFfD7";
// const DestChainOracle = "0x00b90a6805324a11E24EfA8a9021ABf64e31Ffc6";

//mainnet
const SourceChainProviderURL = `https://avalanche-mainnet.infura.io/v3/865c34dcc8214c72bdd7f771f57c3821`;
const SourceChainRouter = "0xF4c7E640EdA248ef95972845a62bdC74237805dB";
const SourceChainSelector = "6433500567565415381";
const SourceChainLinkToken = "0x5947BB275c521040051D82396192181b413227A3";
const DestChainProviderURL = `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`;
const DestChainRouter = "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D";
const DestChainSelector = "5009297550715157269";
const SourceChainOracleAdmin = "0xFF4c2F99815A30119eA55483D301Bd94632D2A14"; //source chain oracle admin
const DestChainOracleAdmin = "0xf2B18c20Ed5E5a6ABB15377D619C1879639339AD"; //dest chain oracle admin
const SourceChainUpgradeAdmin = "0xf2B18c20Ed5E5a6ABB15377D619C1879639339AD"; //upgrade source chain oracle provider implementation
const MessageIdSinger = "0x9d80F33eCdAb2515C3abcDD11e1dC3c7F7681eE7";
const SourceChainID = "43114";
/*deployed info, only used for upgrade*/
const SourceChainOracleProvider = "0x75B3B424fb782dA0e8DCf9E30396001E60e4Cc3B";
const DestChainOracle = "0x84A30Ee3A5801479F58A61106a811Eb85B1153D9";

const WALLET_KEY = process.env.DEPLOYER_PRIVATE_KEY || "KEY NOT SET";

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
      SourceChainOracleProvider,
      SourceChainID,
      MessageIdSinger,
      {
        maxPriorityFeePerGas: "1000000000",
        maxFeePerGas: "30000000000",
        gasLimit: "2000000",
      }
    );
  await nftOracle.deployTransaction.wait(1);
  console.log("dest chain oracle deployed to:", nftOracle.address);

  const nftOracleInstrance = await nftOracleFactory
    .connect(DestChainWalletInstance)
    .attach(nftOracle.address);
  await nftOracleInstrance
    .connect(DestChainWalletInstance)
    .initialPrice([
      BAYC,
      PPG,
      PUNKS,
      MAYC,
      OTHR,
      AZUKI,
      BAKC,
      MOONBIRD,
      CLONEX,
      DOODLE,
      MEEBITS,
      BEANZ,
      BLOCKS,
      EXP,
      VSL,
      KODA,
      DEGODS,
      HVMTL,
      ELEM,
      MBEAN,
      GHOST,
    ]);
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
    SourceChainOracleProvider
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
    SourceChainOracleProvider
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
    SourceChainOracleProvider
  );

  await nftOracleProvider
    .connect(SourceChainWalletInstance)
    .setGasConfig(500000, 10000, 0, {
      gasLimit: "1000000",
    });
  console.log("-----------updateGasConfig");
}

async function upgradeProvider() {
  const SourceChainUpgraderInstance = new Wallet(
    //"9dd35f770d6f9dd87fdeea1ecf8e53208cecbe6a1409eea77d71a0fa398d1372",//test key
    WALLET_KEY,
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
      DestChainOracle,
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
  //
  // const proxyFactory = await ethers.getContractFactory(
  //   "InitializableAdminUpgradeabilityProxy"
  // );
  // await proxyFactory
  //   .attach(SourceChainOracleProvider)
  //   .connect(SourceChainUpgraderInstance)
  //   .upgradeTo(nftOracleProviderImpl.address, {
  //     gasLimit: "1000000",
  //   });
  // console.log("2. upgraded");
}

async function fetchPrice() {
  const nftOracleFactory = await ethers.getContractFactory("NFTFloorOracle");
  const nftOracle = await nftOracleFactory
    .attach(DestChainOracle)
    .connect(DestChainWalletInstance);
  let price = await nftOracle.getPrice(
    "0x0000000000000000000000000000000000000001"
  );
  console.log("price:", price);
  price = await nftOracle.getPrice(
    "0x0000000000000000000000000000000000000002"
  );
  console.log("price:", price);
}

async function main() {
  //not need to set DRE
  //await rawBRE.run("set-DRE");
  //await deployCrossChainNftOracle();
  //await config();

  //await upgradeProvider();
  //await updateGasConfig();
  //await feedPrice();
  //await fetchPrice();
  await upgradeProvider();
  //await deployDestchainOracle();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
