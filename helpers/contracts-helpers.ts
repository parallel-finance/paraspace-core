import {
  constants,
  Contract,
  ContractFactory,
  Signer,
  utils,
  BigNumber,
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
  BlurExchange,
  ConduitController,
  ERC20,
  ERC721,
  PausableZoneController,
  Seaport,
} from "../types";
import {HardhatRuntimeEnvironment, HttpNetworkConfig} from "hardhat/types";
import {getIErc20Detailed, getTimeLockExecutor} from "./contracts-getters";
import {getDefenderRelaySigner, usingDefender} from "./defender-utils";
import {usingTenderly, verifyAtTenderly} from "./tenderly-utils";
import {SignerWithAddress} from "../test/helpers/make-suite";
import {verifyEtherscanContract} from "./etherscan-verification";
import {InitializableImmutableAdminUpgradeabilityProxy} from "../types";
import {decodeEvents} from "./seaport-helpers/events";
import {Order, SignatureVersion} from "./blur-helpers/types";
import {expect} from "chai";
import {ABI} from "hardhat-deploy/dist/types";
import {ethers} from "ethers";
import {
  GLOBAL_OVERRIDES,
  DEPLOY_INCREMENTAL,
  JSONRPC_VARIANT,
  DRY_RUN,
  TIME_LOCK_BUFFERING_TIME,
  VERBOSE,
} from "./hardhat-constants";

export type ERC20TokenMap = {[symbol: string]: ERC20};
export type ERC721TokenMap = {[symbol: string]: ERC721};

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
  };
  if (!Array.isArray(newValue.constructorArgs) && verifiable) {
    newValue["constructorArgs"] = [];
  }
  await getDb().set(key, newValue).write();
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

export const verifyContract = async (
  id: string,
  instance: Contract,
  args: ConstructorArgs,
  libraries?: LibraryAddresses
) => {
  if (usingTenderly()) {
    await verifyAtTenderly(id, instance);
  }
  await verifyEtherscanContract(id, instance.address, args, libraries);
  return instance;
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

export const withSaveAndVerify = async <C extends ContractFactory>(
  factory: C,
  id: string,
  args: ConstructorArgs,
  verify = true,
  proxy = false,
  libraries?: ParaSpaceLibraryAddresses,
  signatures?: iFunctionSignature[]
) => {
  const addressInDb = await getContractAddressInDb(id);
  if (DEPLOY_INCREMENTAL && isNotFalsyOrZeroAddress(addressInDb)) {
    console.log("contract address is already in db ", id);
    return await factory.attach(addressInDb);
  }

  const normalizedLibraries = normalizeLibraryAddresses(libraries);
  const deployArgs = proxy ? args.slice(0, args.length - 2) : args;
  const [impl, initData] = (
    proxy ? args.slice(args.length - 2) : []
  ) as string[];
  const instance = await factory.deploy(...deployArgs, GLOBAL_OVERRIDES);
  await waitForTx(instance.deployTransaction);
  await registerContractInDb(
    id,
    instance,
    deployArgs,
    normalizedLibraries,
    signatures
  );

  if (verify) {
    await verifyContract(id, instance, deployArgs, normalizedLibraries);
  }

  if (proxy) {
    await waitForTx(
      await (
        instance as InitializableImmutableAdminUpgradeabilityProxy
      ).initialize(impl, initData, GLOBAL_OVERRIDES)
    );
  }

  return instance;
};

export const convertToCurrencyDecimals = async (
  tokenAddress: tEthereumAddress,
  amount: string
) => {
  const token = await getIErc20Detailed(tokenAddress);
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

export const getProxyImplementation = async (
  proxyAdminAddress: string,
  proxyAddress: string
) => {
  // Impersonate proxy admin
  const proxyAdminSigner = (await impersonateAddress(proxyAdminAddress)).signer;

  // failing here
  const proxy = (await DRE.ethers.getContractAt(
    "InitializableImmutableAdminUpgradeabilityProxy",
    proxyAddress,
    proxyAdminSigner
  )) as InitializableImmutableAdminUpgradeabilityProxy;

  const implementationAddress = await proxy.callStatic.implementation();
  return implementationAddress;
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
  conduitKey?: string
) => {
  const ownerAddress = await owner.getAddress();
  const assignedConduitKey =
    conduitKey ?? ownerAddress + randomHex(12).slice(2);

  const {conduit: conduitAddress} = await conduitController.getConduit(
    assignedConduitKey
  );

  await conduitController
    .connect(owner)
    .createConduit(assignedConduitKey, ownerAddress, GLOBAL_OVERRIDES);

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
  abi: string | ReadonlyArray<Fragment | Fragment | string> | ABI
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
  const timeLock = await getTimeLockExecutor();
  const delay = await timeLock.getDelay();
  const blockNumber = await DRE.ethers.provider.getBlockNumber();
  const timestamp = (await DRE.ethers.provider.getBlock(blockNumber)).timestamp;
  return delay.add(timestamp).add(TIME_LOCK_BUFFERING_TIME).toString();
};

export const getActionAndData = async (
  target: string,
  data: string,
  executionTime?: string
) => {
  const timeLock = await getTimeLockExecutor();
  const action: Action = [
    target,
    0,
    "",
    data,
    executionTime || (await getExecutionTime()),
    false,
  ];
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
  }
  return {action, actionHash, queueData, executeData, cancelData};
};

export const printEncodedData = async (
  target: tEthereumAddress,
  data: string,
  executionTime?: string
) => {
  if (
    DRY_RUN == DryRunExecutor.TimeLock &&
    (await getContractAddressInDb(eContractid.TimeLockExecutor))
  ) {
    await getActionAndData(target, data, executionTime);
  }
  console.log(`target: ${target}, data: ${data}`);
};
