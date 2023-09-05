import {
  constants,
  Contract,
  ContractFactory,
  Signer,
  utils,
  BigNumber,
  Wallet,
} from "ethers";
import {signTypedData_v4} from "eth-sig-util";
import {fromRpcSig, ECDSASignature} from "ethereumjs-util";
import {
  defaultAbiCoder,
  Fragment,
  isAddress,
  solidityKeccak256,
} from "ethers/lib/utils";
import {isZeroAddress} from "ethereumjs-util";
import {
  DRE,
  getDb,
  waitForTx,
  isLocalTestnet,
  getParaSpaceConfig,
  isFork,
  sleep,
  DbEntry,
  shouldVerifyContract,
} from "./misc-utils";
import {
  iFunctionSignature,
  tEthereumAddress,
  eContractid,
  tStringTokenSmallUnits,
  ConstructorArgs,
  LibraryAddresses,
  ParaSpaceLibraryAddresses,
  Action,
  DryRunExecutor,
  TimeLockData,
  TimeLockOperation,
  EtherscanVerificationProvider,
} from "./types";
import {
  ConsiderationItem,
  OfferItem,
  OrderParameters,
} from "./seaport-helpers/types";
import {
  convertSignatureToEIP2098,
  randomHex,
  toBN,
} from "./seaport-helpers/encoding";
import {orderType as seaportOrderType} from "./seaport-helpers/eip-712-types/order";
import {splitSignature} from "ethers/lib/utils";
import blurOrderType from "./blur-helpers/eip-712-types/order";
import {
  ACLManager__factory,
  AutoCompoundApe__factory,
  BlurExchange,
  ConduitController,
  ERC20,
  ERC20__factory,
  ERC721,
  ERC721__factory,
  ExecutorWithTimelock__factory,
  IERC20Detailed__factory,
  ICurve__factory,
  InitializableAdminUpgradeabilityProxy__factory,
  IPool__factory,
  MultiSendCallOnly__factory,
  NToken__factory,
  ParaSpaceOracle__factory,
  PausableZoneController,
  PoolAddressesProvider__factory,
  PoolConfigurator__factory,
  PoolParameters__factory,
  PToken__factory,
  ReservesSetupHelper__factory,
  Seaport,
  Seaport__factory,
  NTokenOtherdeed__factory,
  TimeLock__factory,
  P2PPairStaking__factory,
  NFTFloorOracle__factory,
} from "../types";
import {
  Artifact,
  HardhatRuntimeEnvironment,
  HttpNetworkConfig,
} from "hardhat/types";
import {
  getFirstSigner,
  getSafeSdkAndService,
  getTimeLockExecutor,
} from "./contracts-getters";
import {getDefenderRelaySigner, usingDefender} from "./defender-utils";
import {usingTenderly, verifyAtTenderly} from "./tenderly-utils";
import {SignerWithAddress} from "../test/helpers/make-suite";
import {verifyEtherscanContract} from "./etherscan";
import {InitializableImmutableAdminUpgradeabilityProxy} from "../types";
import {decodeEvents} from "./seaport-helpers/events";
import {Order, SignatureVersion} from "./blur-helpers/types";
import {expect} from "chai";
import {ABI, Libraries} from "hardhat-deploy/dist/types";
import {ethers} from "ethers";
import {
  GLOBAL_OVERRIDES,
  DEPLOY_INCREMENTAL,
  JSONRPC_VARIANT,
  DRY_RUN,
  TIME_LOCK_BUFFERING_TIME,
  VERBOSE,
  FORK,
  TIME_LOCK_DEFAULT_OPERATION,
  VERSION,
  FLASHBOTS_RELAY_RPC,
  MULTI_SIG_NONCE,
  MULTI_SEND_CHUNK_SIZE,
  PKG_DATA,
  COMPILER_VERSION,
  COMPILER_OPTIMIZER_RUNS,
  DEPLOY_MAX_RETRIES,
  ETHERSCAN_KEY,
  ETHERSCAN_APIS,
  ETHERSCAN_VERIFICATION_PROVIDER,
  DEPLOY_RETRY_INTERVAL,
  eContractidToContractName,
} from "./hardhat-constants";
import {chunk, first, pick} from "lodash";
import InputDataDecoder from "ethereum-input-data-decoder";
import {
  OperationType,
  SafeTransactionDataPartial,
} from "@safe-global/safe-core-sdk-types";
import {encodeMulti, MetaTransaction} from "ethers-multisend";
import {
  FlashbotsBundleProvider,
  FlashbotsBundleRawTransaction,
  FlashbotsBundleTransaction,
} from "@flashbots/ethers-provider-bundle";
import {configureReservesByHelper, initReservesByHelper} from "./init-helpers";
import shell from "shelljs";
import walkdir from "walkdir";
import fs from "fs";
import * as zk from "zksync-web3";
import {hexlify} from "ethers/lib/utils";
import {Overrides} from "./hardhat-constants";
import {mapLimit} from "async";

export type ERC20TokenMap = {[symbol: string]: ERC20};
export type ERC721TokenMap = {[symbol: string]: ERC721};

export const getZkSyncBytecodeHashes = () => {
  const obj = {};
  walkdir.sync("./artifacts-zk", (path, stat) => {
    if (
      stat.isDirectory() ||
      !path.endsWith(".json") ||
      path.endsWith("dbg.json")
    ) {
      return;
    }
    try {
      const artifact = JSON.parse(fs.readFileSync(path, "utf8"));
      if (artifact.contractName && artifact.bytecode) {
        const bytecodeHash = hexlify(zk.utils.hashBytecode(artifact.bytecode));
        obj[bytecodeHash] = artifact.contractName;
        obj[artifact.contractName] = bytecodeHash;
      }
    } catch (e) {
      //
    }
  });
  return obj;
};

export const registerContractInDb = async (
  id: string,
  instance: Contract,
  constructorArgs: ConstructorArgs = [],
  libraries?: LibraryAddresses,
  signatures?: iFunctionSignature[]
) => {
  const currentNetwork = DRE.network.name;
  const key = `${id}.${DRE.network.name}`;

  if (isFork() || !isLocalTestnet()) {
    console.log(`*** ${id} ***\n`);
    console.log(`Network: ${currentNetwork}`);
    console.log(`tx: ${instance.deployTransaction?.hash}`);
    console.log(`contract address: ${instance.address}`);
    console.log(`deployer address: ${instance.deployTransaction?.from}`);
    console.log(`gas price: ${instance.deployTransaction?.gasPrice}`);
    console.log(`gas used: ${instance.deployTransaction?.gasLimit}`);
    console.log(`\n******`);
    console.log();
  }

  const value = {
    address: instance.address,
    deployer: instance.deployTransaction?.from,
    constructorArgs,
    verified: false,
    package: PKG_DATA,
  };

  if (libraries) value["libraries"] = libraries;
  if (signatures?.length) value["signatures"] = signatures;

  await getDb().set(key, value).write();
};

export const insertContractAddressInDb = async (
  id: eContractid | string,
  address: tEthereumAddress,
  verifiable = true
) => {
  const key = `${id}.${DRE.network.name}`;
  const old = (await getDb().get(key).value()) || {};
  const newValue = {
    ...old,
    address,
    version: VERSION,
    package: PKG_DATA,
  };
  if (!Array.isArray(newValue.constructorArgs) && verifiable) {
    newValue["constructorArgs"] = [];
  }
  await getDb().set(key, newValue).write();
};

export const insertTimeLockDataInDb = async ({
  action,
  actionHash,
  queueData,
  executeData,
  cancelData,
  executeTime,
  queueExpireTime,
  executeExpireTime,
}: TimeLockData) => {
  const key = `${eContractid.TimeLockExecutor}.${DRE.network.name}`;
  const oldValue = (await getDb().get(key).value()) || {};
  const queue = oldValue.queue || [];
  queue.push({
    action,
    actionHash,
    queueData,
    executeData,
    cancelData,
    executeTime: new Date(+executeTime * 1000).toLocaleString(),
    queueExpireTime: new Date(+queueExpireTime * 1000).toLocaleString(),
    executeExpireTime: new Date(+executeExpireTime * 1000).toLocaleString(),
  });
  const newValue = {
    ...oldValue,
    queue,
  };
  await getDb().set(key, newValue).write();
};

export const getTimeLockDataInDb = async (): Promise<
  {
    action: Action;
    actionHash: string;
    queueData: string;
    executeData: string;
    cancelData: string;
  }[]
> => {
  const key = `${eContractid.TimeLockExecutor}.${DRE.network.name}`;
  const oldValue = (await getDb().get(key).value()) || {};
  const queue = oldValue.queue || [];
  return queue.map((x) =>
    pick(x, ["action", "actionHash", "queueData", "executeData", "cancelData"])
  );
};

export const getContractAddressInDb = async (id: eContractid | string) => {
  return ((await getDb().get(`${id}.${DRE.network.name}`).value()) || {})
    .address;
};

export const getEthersSigners = async (): Promise<Signer[]> => {
  const ethersSigners = await Promise.all(await DRE.ethers.getSigners());

  if (usingDefender()) {
    const [, ...users] = ethersSigners;
    return [await getDefenderRelaySigner(), ...users];
  }
  return ethersSigners;
};

export const getEthersSignersAddresses = async (): Promise<
  tEthereumAddress[]
> =>
  await Promise.all(
    (await getEthersSigners()).map((signer) => signer.getAddress())
  );

export const verifyContracts = async (limit = 1) => {
  const db = getDb();
  const network = DRE.network.name;
  const entries = Object.entries<DbEntry>(db.getState()).filter(
    ([key, value]) => {
      // constructorArgs must be Array to make the contract verifiable
      return (
        shouldVerifyContract(key) &&
        !!value[network] &&
        Array.isArray(value[network].constructorArgs)
      );
    }
  );

  await mapLimit(entries, limit, async ([key, value]) => {
    const {address, constructorArgs = [], libraries} = value[network];
    let artifact: Artifact | undefined = undefined;
    try {
      artifact = await DRE.artifacts.readArtifact(
        eContractidToContractName[key] || key
      );
    } catch (e) {
      //
    }
    await verifyContract(key, address, artifact, constructorArgs, libraries);
  });
};

export const verifyContract = async (
  id: string,
  address: tEthereumAddress,
  artifact: Artifact | undefined,
  constructorArgs: ConstructorArgs,
  libraries?: LibraryAddresses
) => {
  if (usingTenderly()) {
    await verifyAtTenderly(id, address);
  }

  let contractFQN: string | undefined = undefined;
  if (artifact) {
    contractFQN = artifact.sourceName + ":" + artifact.contractName;
  }

  if (
    ETHERSCAN_VERIFICATION_PROVIDER == EtherscanVerificationProvider.hardhat
  ) {
    await verifyEtherscanContract(
      id,
      address,
      contractFQN,
      constructorArgs,
      libraries
    );
  } else if (
    ETHERSCAN_VERIFICATION_PROVIDER == EtherscanVerificationProvider.foundry &&
    artifact
  ) {
    const forgeVerifyContractCmd = `ETHERSCAN_API_KEY=${ETHERSCAN_KEY} ETH_RPC_URL=${
      (DRE.network.config as HttpNetworkConfig).url
    } VERIFIER_URL=${
      ETHERSCAN_APIS[DRE.network.name || FORK]
    } forge verify-contract ${address} \
  --chain-id ${DRE.network.config.chainId} \
  --num-of-optimizations ${COMPILER_OPTIMIZER_RUNS} \
  --watch \
  ${contractFQN} \
${
  constructorArgs.length
    ? `--constructor-args \
  $(cast abi-encode "constructor(${first(artifact.abi)
    .inputs.map((x) => x.type)
    .join(",")})" ${constructorArgs
        .map((x) => (Array.isArray(x) ? `"[${x}"]` : `"${x}"`))
        .join(" ")})`
    : ""
} \
${
  libraries
    ? (
        await Promise.all(
          Object.entries(libraries).map(async ([k, v]) => {
            const sourceName =
              (
                await DRE.artifacts.readArtifact(
                  eContractidToContractName[k] || k
                )
              )?.sourceName || "";
            return `--libraries ${sourceName}:${k}:${v}`;
          })
        )
      ).join(" ")
    : ""
} \
  --compiler-version v${COMPILER_VERSION}`;
    console.log(forgeVerifyContractCmd);
    shell.exec(forgeVerifyContractCmd);
  }
};

export const normalizeLibraryAddresses = (
  libraries?: ParaSpaceLibraryAddresses
): LibraryAddresses | undefined => {
  if (libraries) {
    return Object.keys(libraries).reduce((ite, cur) => {
      const parts = cur.split(":");
      ite[parts[parts.length - 1]] = libraries[cur];
      return ite;
    }, {});
  }
};

export const retry = async (fn: any, retries = 0) => {
  try {
    return await fn();
  } catch (e: any) {
    if (++retries < DEPLOY_MAX_RETRIES) {
      console.log("retrying..., error code:", e?.code);
      await sleep(DEPLOY_RETRY_INTERVAL);
      return await retry(fn, retries);
    } else {
      throw e;
    }
  }
};

export const withSaveAndVerify = async (
  {
    artifact,
    factory,
    customData,
  }: {
    artifact: Artifact;
    factory: ContractFactory;
    customData: any;
  },
  id: string,
  args: ConstructorArgs,
  verify = true,
  proxy = false,
  libraries?: ParaSpaceLibraryAddresses,
  signatures?: iFunctionSignature[]
) =>
  retry(async () => {
    const addressInDb = await getContractAddressInDb(id);
    if (DEPLOY_INCREMENTAL && isNotFalsyOrZeroAddress(addressInDb)) {
      console.log("contract address is already in db", id);
      return await factory.attach(addressInDb);
    }

    const normalizedLibraries = normalizeLibraryAddresses(libraries);
    const deployArgs = proxy ? args.slice(0, args.length - 2) : args;
    const [impl, initData] = (
      proxy ? args.slice(args.length - 2) : []
    ) as string[];

    if (customData) {
      GLOBAL_OVERRIDES.customData = customData;
    }
    const instance = await factory.deploy(...deployArgs, GLOBAL_OVERRIDES);
    delete GLOBAL_OVERRIDES.customData;
    await waitForTx(instance.deployTransaction);
    await registerContractInDb(
      id,
      instance,
      deployArgs,
      normalizedLibraries,
      signatures
    );

    if (proxy) {
      await waitForTx(
        await (
          instance as InitializableImmutableAdminUpgradeabilityProxy
        ).initialize(impl, initData, GLOBAL_OVERRIDES)
      );
    }

    if (verify) {
      await verifyContract(
        id,
        instance.address,
        artifact,
        deployArgs,
        normalizedLibraries
      );
    }

    return instance;
  });

export const convertToCurrencyDecimals = async (
  tokenAddress: tEthereumAddress,
  amount: string
) => {
  const url = (DRE.network.config as HttpNetworkConfig).url;
  const token = await IERC20Detailed__factory.connect(
    tokenAddress,
    url ? new ethers.providers.JsonRpcProvider(url) : DRE.ethers.provider
  );
  const decimals = (await token.decimals()).toString();

  return DRE.ethers.utils.parseUnits(amount, decimals);
};

export const buildPermitParams = (
  chainId: number,
  token: tEthereumAddress,
  revision: string,
  tokenName: string,
  owner: tEthereumAddress,
  spender: tEthereumAddress,
  nonce: number,
  deadline: string,
  value: tStringTokenSmallUnits
) => ({
  types: {
    EIP712Domain: [
      {name: "name", type: "string"},
      {name: "version", type: "string"},
      {name: "chainId", type: "uint256"},
      {name: "verifyingContract", type: "address"},
    ],
    Permit: [
      {name: "owner", type: "address"},
      {name: "spender", type: "address"},
      {name: "value", type: "uint256"},
      {name: "nonce", type: "uint256"},
      {name: "deadline", type: "uint256"},
    ],
  },
  primaryType: "Permit" as const,
  domain: {
    name: tokenName,
    version: revision,
    chainId: chainId,
    verifyingContract: token,
  },
  message: {
    owner,
    spender,
    value,
    nonce,
    deadline,
  },
});

export const getSignatureFromTypedData = (
  privateKey: string,
  // eslint-disable-next-line
  typedData: any // TODO: should be TypedData, from eth-sig-utils, but TS doesn't accept it
): ECDSASignature => {
  const signature = signTypedData_v4(
    Buffer.from(privateKey.substring(2, 66), "hex"),
    {
      data: typedData,
    }
  );
  return fromRpcSig(signature);
};

export const buildDelegationWithSigParams = (
  chainId: number,
  token: tEthereumAddress,
  revision: string,
  tokenName: string,
  delegatee: tEthereumAddress,
  nonce: number,
  deadline: string,
  value: tStringTokenSmallUnits
) => ({
  types: {
    EIP712Domain: [
      {name: "name", type: "string"},
      {name: "version", type: "string"},
      {name: "chainId", type: "uint256"},
      {name: "verifyingContract", type: "address"},
    ],
    DelegationWithSig: [
      {name: "delegatee", type: "address"},
      {name: "value", type: "uint256"},
      {name: "nonce", type: "uint256"},
      {name: "deadline", type: "uint256"},
    ],
  },
  primaryType: "DelegationWithSig" as const,
  domain: {
    name: tokenName,
    version: revision,
    chainId: chainId,
    verifyingContract: token,
  },
  message: {
    delegatee,
    value,
    nonce,
    deadline,
  },
});

export const getProxyImplementation = async (proxyAddress: string) => {
  const EIP1967_IMPL_SLOT =
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implStorageSlot = await DRE.ethers.provider.getStorageAt(
    proxyAddress,
    EIP1967_IMPL_SLOT,
    "latest"
  );
  const implAddress = utils.defaultAbiCoder
    .decode(["address"], implStorageSlot)
    .toString();
  return utils.getAddress(implAddress);
};

export const getProxyAdmin = async (proxyAddress: string) => {
  const EIP1967_ADMIN_SLOT =
    "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminStorageSlot = await DRE.ethers.provider.getStorageAt(
    proxyAddress,
    EIP1967_ADMIN_SLOT,
    "latest"
  );
  const adminAddress = utils.defaultAbiCoder
    .decode(["address"], adminStorageSlot)
    .toString();
  return utils.getAddress(adminAddress);
};

export const impersonateAddress = async (
  address: tEthereumAddress
): Promise<SignerWithAddress> => {
  const forkednetProvider = new ethers.providers.JsonRpcProvider(
    (DRE.network.config as HttpNetworkConfig).url
  );

  if (!usingTenderly()) {
    await (DRE as HardhatRuntimeEnvironment).network.provider.request({
      method: `${JSONRPC_VARIANT}_impersonateAccount`,
      params: [address],
    });
  }

  const signer = isLocalTestnet()
    ? (DRE as HardhatRuntimeEnvironment).ethers.provider.getSigner(address)
    : forkednetProvider.getSigner(address);

  return {
    signer,
    address,
  };
};

export const latest = async (): Promise<number> => {
  return (
    await DRE.ethers.provider.getBlock(
      await DRE.ethers.provider.getBlockNumber()
    )
  ).timestamp;
};

export const createSeaportOrder = async <
  T extends {signer: Signer; address: string}
>(
  seaport: Seaport,
  signer: T,
  offerItems: OfferItem[],
  considerations: ConsiderationItem[],
  orderType = 0,
  zone = constants.AddressZero,
  conduitKey = constants.HashZero
) => {
  const domainData = {
    name: "ParaSpace",
    version: "1.1",
    chainId: (await DRE.ethers.provider.getNetwork()).chainId,
    verifyingContract: seaport.address,
  };
  const constants = DRE.ethers.constants;

  const orderParameters: OrderParameters = {
    offerer: signer.address,
    zone,
    offer: offerItems,
    consideration: considerations,
    totalOriginalConsiderationItems: considerations.length,
    orderType, // FULL_OPEN
    zoneHash: constants.HashZero,
    salt: randomHex(),
    conduitKey,
    startTime: 0, // 1970-01-01T00:00:00.000Z
    endTime: toBN("2147483647000"), // 2038-01-19T03:14:07.000Z
  };

  const orderComponents = {
    ...orderParameters,
    counter: await seaport.getCounter(signer.address),
  };

  const signature = await DRE.ethers.provider
    .getSigner(signer.address)
    ._signTypedData(domainData, seaportOrderType, orderComponents);

  return {
    parameters: orderParameters,
    signature: convertSignatureToEIP2098(signature),
    numerator: 1, // only used for advanced orders
    denominator: 1, // only used for advanced orders
    extraData: "0x", // only used for advanced orders
  };
};

export const createZone = async (
  pausableZoneController: PausableZoneController,
  owner: Signer,
  salt?: string
) => {
  const tx = await pausableZoneController.createZone(
    salt ?? randomHex(),
    GLOBAL_OVERRIDES
  );

  const zoneContract = await DRE.ethers.getContractFactory(
    "PausableZone",
    owner
  );

  const events = await decodeEvents(tx, [
    {eventName: "ZoneCreated", contract: pausableZoneController},
    // eslint-disable-next-line
    {eventName: "Unpaused", contract: zoneContract as any},
  ]);
  expect(events.length).to.be.equal(2);

  const [unpauseEvent, zoneCreatedEvent] = events;
  expect(unpauseEvent.eventName).to.equal("Unpaused");
  expect(zoneCreatedEvent.eventName).to.equal("ZoneCreated");

  return zoneCreatedEvent.data.zone as string;
};

export const createConduit = async (
  conduitController: ConduitController,
  owner: Signer,
  conduitKey?: string,
  overrides?: Overrides
) => {
  const ownerAddress = await owner.getAddress();
  const assignedConduitKey =
    conduitKey ?? ownerAddress + randomHex(12).slice(2);

  const {conduit: conduitAddress} = await conduitController.getConduit(
    assignedConduitKey
  );

  await conduitController
    .connect(owner)
    .createConduit(assignedConduitKey, ownerAddress, overrides);

  return conduitAddress;
};

export const createBlurOrder = async <
  T extends {signer: Signer; address: string}
>(
  blur: BlurExchange,
  signer: T,
  order: Order
) => {
  const domainData = {
    name: "Blur Exchange",
    version: "1.0",
    chainId: (await DRE.ethers.provider.getNetwork()).chainId,
    verifyingContract: blur.address,
  };

  const signature = await DRE.ethers.provider
    .getSigner(signer.address)
    ._signTypedData(domainData, blurOrderType, {
      ...order,
      nonce: await blur.nonces(signer.address),
    });

  const {r, s, v} = splitSignature(signature);

  return {
    order,
    v,
    r,
    s,
    extraSignature: "0x",
    signatureVersion: SignatureVersion.Single,
    blockNumber: 0,
  };
};

export const getParaSpaceAdmins = async (): Promise<{
  paraSpaceAdminAddress: tEthereumAddress;
  emergencyAdminAddresses: tEthereumAddress[];
  riskAdminAddress: tEthereumAddress;
  gatewayAdminAddress: tEthereumAddress;
}> => {
  const signers = await getEthersSigners();
  const {
    ParaSpaceAdmin,
    EmergencyAdmins,
    RiskAdmin,
    GatewayAdmin,
    ParaSpaceAdminIndex,
    EmergencyAdminIndex,
    RiskAdminIndex,
    GatewayAdminIndex,
  } = getParaSpaceConfig();
  return {
    paraSpaceAdminAddress:
      ParaSpaceAdmin || (await signers[ParaSpaceAdminIndex].getAddress()),
    emergencyAdminAddresses:
      EmergencyAdmins.length > 0
        ? EmergencyAdmins
        : [await signers[EmergencyAdminIndex].getAddress()],
    riskAdminAddress: RiskAdmin || (await signers[RiskAdminIndex].getAddress()),
    gatewayAdminAddress:
      GatewayAdmin || (await signers[GatewayAdminIndex].getAddress()),
  };
};

export const getFunctionSignatures = (
  abi: string | ReadonlyArray<Fragment | Fragment | string> | Readonly<ABI>
): Array<iFunctionSignature> => {
  const i = new utils.Interface(abi);
  return Object.keys(i.functions).map((f) => {
    return {
      name: f,
      signature: i.getSighash(i.functions[f]),
    };
  });
};

export const getFunctionSignaturesFromDb = async (
  id: eContractid
): Promise<string[]> => {
  const value = (await getDb().get(`${id}.${DRE.network.name}`).value()) || {};
  const signatures = value.signatures || [];
  return signatures.map(({signature}) => signature);
};

export const getContractAddresses = (contracts: {[name: string]: Contract}) => {
  return Object.entries(contracts).reduce(
    (accum: {[name: string]: tEthereumAddress}, [name, contract]) => ({
      ...accum,
      [name]: contract.address,
    }),
    {}
  );
};

export const isNotFalsyOrZeroAddress = (
  address: tEthereumAddress | null | undefined
): boolean => {
  if (!address) {
    return false;
  }
  return isAddress(address) && !isZeroAddress(address);
};

export const isBorrowing = (conf, id) =>
  conf
    .div(BigNumber.from(2).pow(BigNumber.from(id).mul(2)))
    .and(1)
    .gt(0);

export const isUsingAsCollateral = (conf, id) =>
  conf
    .div(BigNumber.from(2).pow(BigNumber.from(id).mul(2).add(1)))
    .and(1)
    .gt(0);

export const getCurrentTime = async () => {
  const blockNumber = await DRE.ethers.provider.getBlockNumber();
  const timestamp = (await DRE.ethers.provider.getBlock(blockNumber)).timestamp;
  return BigNumber.from(timestamp);
};

export const getExecutionTime = async () => {
  const blockNumber = await DRE.ethers.provider.getBlockNumber();
  const timestamp = (await DRE.ethers.provider.getBlock(blockNumber)).timestamp;
  return BigNumber.from(timestamp).add(TIME_LOCK_BUFFERING_TIME).toString();
};

export const getTimeLockData = async (
  target: string,
  data: string,
  executionTime?: string
) => {
  const timeLock = await getTimeLockExecutor();
  executionTime = executionTime || (await getExecutionTime());
  const action: Action = [target, 0, "", data, executionTime, false];
  const actionHash = solidityKeccak256(
    ["bytes"],
    [
      defaultAbiCoder.encode(
        ["address", "uint256", "string", "bytes", "uint256", "bool"],
        action
      ),
    ]
  );
  const isActionQueued = await timeLock.isActionQueued(actionHash);
  const gracePeriod = await timeLock.GRACE_PERIOD();
  const delay = await timeLock.getDelay();
  const executeTime = BigNumber.from(executionTime).add(delay).toString();
  const queueExpireTime = BigNumber.from(executionTime).sub(delay).toString();
  const executeExpireTime = BigNumber.from(executionTime)
    .add(gracePeriod)
    .toString();
  const queueData = timeLock.interface.encodeFunctionData(
    "queueTransaction",
    action
  );
  const executeData = timeLock.interface.encodeFunctionData(
    "executeTransaction",
    action
  );
  const cancelData = timeLock.interface.encodeFunctionData(
    "cancelTransaction",
    action
  );
  if (VERBOSE) {
    console.log();
    console.log("isActionQueued:", isActionQueued);
    console.log("timeLock:", timeLock.address);
    console.log("target:", target);
    console.log("data:", data);
    console.log("executionTime:", executionTime);
    console.log("action:", action.toString());
    console.log("actionHash:", actionHash);
    console.log("queueData:", queueData);
    console.log("executeData:", executeData);
    console.log("cancelData:", cancelData);
    console.log();
  }
  const newTarget = timeLock.address;
  const newData =
    TIME_LOCK_DEFAULT_OPERATION == TimeLockOperation.Execute
      ? executeData
      : TIME_LOCK_DEFAULT_OPERATION == TimeLockOperation.Cancel
      ? cancelData
      : queueData;
  return {
    timeLock,
    action,
    actionHash,
    queueData,
    executeData,
    cancelData,
    executeTime,
    queueExpireTime,
    executeExpireTime,
    newTarget,
    newData,
  };
};

export const dryRunEncodedData = async (
  target: tEthereumAddress,
  data: string,
  executionTime?: string
) => {
  if (
    DRY_RUN == DryRunExecutor.TimeLock &&
    (await getContractAddressInDb(eContractid.TimeLockExecutor))
  ) {
    const timeLockData = await getTimeLockData(target, data, executionTime);
    await insertTimeLockDataInDb(timeLockData);
  } else if (DRY_RUN === DryRunExecutor.SafeWithTimeLock) {
    const {newTarget, newData} = await getTimeLockData(
      target,
      data,
      executionTime
    );
    await proposeSafeTransaction(newTarget, newData);
  } else if (DRY_RUN === DryRunExecutor.Safe) {
    await proposeSafeTransaction(target, data);
  } else if (DRY_RUN === DryRunExecutor.Run) {
    const signer = await getFirstSigner();
    await waitForTx(
      await signer.sendTransaction({
        to: target,
        data,
        ...GLOBAL_OVERRIDES,
      })
    );
  } else {
    console.log(`target: ${target}, data: ${data}`);
  }
};

export const dryRunMultipleEncodedData = async (
  target: tEthereumAddress[],
  data: string[],
  executionTime: (string | undefined)[]
) => {
  if (
    DRY_RUN == DryRunExecutor.TimeLock &&
    (await getContractAddressInDb(eContractid.TimeLockExecutor))
  ) {
    for (let i = 0; i < target.length; i++) {
      const timeLockData = await getTimeLockData(
        target[i],
        data[i],
        executionTime[i] || (await getExecutionTime())
      );
      await insertTimeLockDataInDb(timeLockData);
    }
  } else if (DRY_RUN === DryRunExecutor.SafeWithTimeLock) {
    const metaTransactions: MetaTransaction[] = [];
    for (let i = 0; i < target.length; i++) {
      const {newTarget, newData} = await getTimeLockData(
        target[i],
        data[i],
        executionTime[i] || (await getExecutionTime())
      );
      metaTransactions.push({
        to: newTarget,
        data: newData,
        value: "0",
      });
    }
    await proposeMultiSafeTransactions(metaTransactions);
  } else if (DRY_RUN === DryRunExecutor.Safe) {
    const metaTransactions: MetaTransaction[] = [];
    for (let i = 0; i < target.length; i++) {
      metaTransactions.push({
        to: target[i],
        data: data[i],
        value: "0",
      });
    }
    await proposeMultiSafeTransactions(metaTransactions);
  } else if (DRY_RUN === DryRunExecutor.Run) {
    const signer = await getFirstSigner();
    for (let i = 0; i < target.length; i++) {
      await waitForTx(
        await signer.sendTransaction({
          to: target[i],
          data: data[i],
          ...GLOBAL_OVERRIDES,
        })
      );
    }
  } else {
    console.log(`target: ${target}, data: ${data}`);
  }
};

export const decodeInputData = (data: string) => {
  const ABI = [
    ...IPool__factory.abi,
    ...ReservesSetupHelper__factory.abi,
    ...ExecutorWithTimelock__factory.abi,
    ...PoolAddressesProvider__factory.abi,
    ...PoolConfigurator__factory.abi,
    ...ParaSpaceOracle__factory.abi,
    ...ACLManager__factory.abi,
    ...MultiSendCallOnly__factory.abi,
    ...ERC20__factory.abi,
    ...ERC721__factory.abi,
    ...NToken__factory.abi,
    ...PToken__factory.abi,
    ...AutoCompoundApe__factory.abi,
    ...PoolParameters__factory.abi,
    ...Seaport__factory.abi,
    ...InitializableAdminUpgradeabilityProxy__factory.abi,
    ...ICurve__factory.abi,
    ...NTokenOtherdeed__factory.abi,
    ...TimeLock__factory.abi,
    ...P2PPairStaking__factory.abi,
    ...NFTFloorOracle__factory.abi,
  ];

  const decoder = new InputDataDecoder(ABI);
  const inputData = decoder.decodeData(data.toString());
  const normalized = JSON.stringify(inputData, (k, v) => {
    return v ? (v.type === "BigNumber" ? +v.hex.toString(10) : v) : v;
  });
  return JSON.parse(normalized);
};

export const proposeSafeTransaction = async (
  target: tEthereumAddress,
  data: string,
  nonce?: number,
  idx = 0,
  operation = OperationType.Call,
  withTimeLock = false
) => {
  const signer = await getFirstSigner();
  const MULTI_SIG = getParaSpaceConfig().Governance.Multisig;
  const {safeSdk, safeService} = await getSafeSdkAndService(MULTI_SIG);

  if (withTimeLock) {
    const {newTarget, newData} = await getTimeLockData(target, data);
    target = newTarget;
    data = newData;
  }

  const staticNonce = nonce || MULTI_SIG_NONCE;

  const safeTransactionData: SafeTransactionDataPartial = {
    to: target,
    value: "0",
    nonce:
      staticNonce != undefined
        ? staticNonce + idx
        : await safeService.getNextNonce(MULTI_SIG),
    operation,
    data,
  };
  const safeTransaction = await safeSdk.createTransaction({
    safeTransactionData,
  });

  const signature = await safeSdk.signTypedData(safeTransaction);
  safeTransaction.addSignature(signature);

  const safeHash = await safeSdk.getTransactionHash(safeTransaction);
  console.log(safeHash);

  try {
    await safeService.estimateSafeTransaction(MULTI_SIG, {
      ...safeTransactionData,
      operation: safeTransactionData.operation as number,
    });
  } catch (e) {
    console.log(e);
  }

  await safeService.proposeTransaction({
    safeAddress: MULTI_SIG,
    safeTransactionData: safeTransaction.data,
    safeTxHash: safeHash,
    senderAddress: await signer.getAddress(),
    senderSignature: signature.data,
  });
};

export const proposeMultiSafeTransactions = async (
  transactions: MetaTransaction[],
  operation = OperationType.DelegateCall,
  nonce?: number
) => {
  const paraSpaceConfig = getParaSpaceConfig();
  const newTarget = paraSpaceConfig.Governance.Multisend;
  const chunks = chunk(transactions, MULTI_SEND_CHUNK_SIZE);
  for (const [i, c] of chunks.entries()) {
    const {data: newData} = encodeMulti(c);
    await proposeSafeTransaction(newTarget, newData, nonce, i, operation);
  }
};

export const sendPrivateTransactions = async (
  bundledTransactions: Array<
    FlashbotsBundleTransaction | FlashbotsBundleRawTransaction
  >
) => {
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    DRE.ethers.provider,
    Wallet.createRandom(),
    FLASHBOTS_RELAY_RPC
  );

  // eslint-disable-next-line
  while (true) {
    const blockNumber = await DRE.ethers.provider.getBlockNumber();
    try {
      const nextBlock = blockNumber + 1;
      console.log(`Preparing bundle for block: ${nextBlock}`);

      const signedBundle = await flashbotsProvider.signBundle(
        bundledTransactions
      );
      const txBundle = await flashbotsProvider.sendRawBundle(
        signedBundle,
        nextBlock
      );

      if ("error" in txBundle) {
        console.log("bundle error:");
        console.warn(txBundle.error.message);
        continue;
      }

      console.log("Submitting bundle");
      const response = await txBundle.simulate();
      if ("error" in response) {
        console.log("Simulate error");
        console.error(response.error);
        process.exit(1);
      }

      console.log("response:", response);
    } catch (err) {
      console.log("Request error");
      console.error(err);
      process.exit(1);
    }

    await sleep(3000);
  }
};

export const initAndConfigureReserves = async (
  assets: {
    symbol: string;
    address: tEthereumAddress;
    aggregator: tEthereumAddress;
  }[],
  verify = false
) => {
  const paraSpaceConfig = getParaSpaceConfig();
  const reservesParams = paraSpaceConfig.ReservesConfig;
  const allTokenAddresses = assets.reduce(
    (accum: {[name: string]: tEthereumAddress}, {symbol, address}) => ({
      ...accum,
      [symbol]: address,
    }),
    {}
  );
  const {PTokenNamePrefix, VariableDebtTokenNamePrefix, SymbolPrefix} =
    paraSpaceConfig;
  const {paraSpaceAdminAddress} = await getParaSpaceAdmins();
  const treasuryAddress = paraSpaceConfig.Treasury;

  const reserves = Object.entries(reservesParams);

  await initReservesByHelper(
    reserves,
    allTokenAddresses,
    PTokenNamePrefix,
    VariableDebtTokenNamePrefix,
    SymbolPrefix,
    paraSpaceAdminAddress,
    treasuryAddress,
    paraSpaceConfig.IncentivesController,
    paraSpaceConfig.HotWallet,
    paraSpaceConfig.DelegationRegistry,
    verify
  );

  console.log("configuring reserves");
  await configureReservesByHelper(reserves, allTokenAddresses);
};

export const linkRawLibrary = (
  bytecode: string,
  libraryName: string,
  libraryAddress: string
): string => {
  const address = libraryAddress.replace("0x", "");
  let encodedLibraryName;
  if (libraryName.startsWith("$") && libraryName.endsWith("$")) {
    encodedLibraryName = libraryName.slice(1, libraryName.length - 1);
  } else {
    encodedLibraryName = solidityKeccak256(["string"], [libraryName]).slice(
      2,
      36
    );
  }
  const pattern = new RegExp(`_+\\$${encodedLibraryName}\\$_+`, "g");
  if (!pattern.exec(bytecode)) {
    throw new Error(
      `Can't link '${libraryName}' (${encodedLibraryName}) in \n----\n ${bytecode}\n----\n`
    );
  }
  return bytecode.replace(pattern, address);
};

export const linkRawLibraries = (
  bytecode: string,
  libraries: Libraries
): string => {
  for (const libName of Object.keys(libraries)) {
    const libAddress = libraries[libName];
    bytecode = linkRawLibrary(bytecode, libName, libAddress);
  }
  return bytecode;
};

export const linkLibraries = (
  artifact: {
    bytecode: string;
    linkReferences?: {
      [libraryFileName: string]: {
        [libraryName: string]: Array<{length: number; start: number}>;
      };
    };
  },
  libraries?: Libraries
) => {
  let bytecode = artifact.bytecode;

  if (libraries) {
    if (artifact.linkReferences) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [, fileReferences] of Object.entries(
        artifact.linkReferences
      )) {
        for (const [libName, fixups] of Object.entries(fileReferences)) {
          const addr = libraries[libName];
          if (addr === undefined) {
            continue;
          }

          for (const fixup of fixups) {
            bytecode =
              bytecode.substr(0, 2 + fixup.start * 2) +
              addr.substr(2) +
              bytecode.substr(2 + (fixup.start + fixup.length) * 2);
          }
        }
      }
    } else {
      bytecode = linkRawLibraries(bytecode, libraries);
    }
  }

  // TODO return libraries object with path name <filepath.sol>:<name> for names

  return bytecode;
};
