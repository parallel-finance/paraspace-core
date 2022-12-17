import {
  RunInput,
  X2Y2Order,
  X2Y2OrderItem,
  SettleDetail,
  SettleShared,
  Fee,
} from "@x2y2-io/sdk/dist/types";
import {BigNumber, Signature, Signer, utils, Wallet} from "ethers";
import {latest} from "./contracts-helpers";
import {DRE} from "./misc-utils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {convertSignatureToEIP2098} from "./seaport-helpers/encoding";
import {accounts} from "../wallets";

var INTENT_SELL = 1;
var INTENT_AUCTION = 2;
var INTENT_BUY = 3;
var OP_COMPLETE_SELL_OFFER = 1; // COMPLETE_SELL_OFFER

var OP_COMPLETE_BUY_OFFER = 2; // COMPLETE_BUY_OFFER

var OP_CANCEL_OFFER = 3; // CANCEL_OFFER

var OP_BID = 4; // BID

var OP_COMPLETE_AUCTION = 5; // COMPLETE_AUCTION

var OP_REFUND_AUCTION = 6; // REFUND_AUCTION

var OP_REFUND_AUCTION_STUCK_ITEM = 7; // REFUND_AUCTION_STUCK_ITEM

var DELEGATION_TYPE_INVALID = 0;
var DELEGATION_TYPE_ERC721 = 1;
var DELEGATION_TYPE_ERC1155 = 2;

const orderItemParamType = `tuple(uint256 price, bytes data)`;
const orderParamTypes = [
  `uint256`,
  `address`,
  `uint256`,
  `uint256`,
  `uint256`,
  `uint256`,
  `address`,
  `bytes`,
  `uint256`,
  `${orderItemParamType}[]`,
];
const feeParamType = `tuple(uint256 percentage, address to)`;
const settleDetailParamType = `tuple(uint8 op, uint256 orderIdx, uint256 itemIdx, uint256 price, bytes32 itemHash, address executionDelegate, bytes dataReplacement, uint256 bidIncentivePct, uint256 aucMinIncrementPct, uint256 aucIncDurationSecs, ${feeParamType}[] fees)`;
const settleSharedParamType = `tuple(uint256 salt, uint256 deadline, uint256 amountToEth, uint256 amountToWeth, address user, bool canFail)`;

export const encodeItemData = (data) => {
  return DRE.ethers.utils.defaultAbiCoder.encode(
    ["tuple(address token, uint256 tokenId)[]"],
    [data]
  );
};

export const X2Y2_EIP_712_TYPE = {
  Params: [
    {name: "orders", type: "Order[]"},
    {name: "details", type: "SettleDetail[]"},
    {name: "shared", type: "SettleShared"},
    {name: "r", type: "bytes32"},
    {name: "s", type: "bytes32"},
    {name: "v", type: "uint8"},
    {name: "nonce", type: "uint256"},
  ],
  Order: [
    {name: "salt", type: "uint256"},
    {name: "user", type: "address"},
    {name: "network", type: "uint256"},
    {name: "intent", type: "uint256"},
    {name: "delegateType", type: "uint256"},
    {name: "deadline", type: "uint256"},
    {name: "currency", type: "address"},
    {name: "dataMask", type: "bytes"},
    {name: "items", type: "OrderItem[]"},
    {name: "r", type: "bytes32"},
    {name: "s", type: "bytes32"},
    {name: "v", type: "uint8"},
    {name: "signVersion", type: "uint8"},
  ],
  OrderItem: [
    {name: "price", type: "uint256"},
    {name: "data", type: "bytes"},
  ],
  SettleDetail: [
    {name: "op", type: "uint8"},
    {name: "orderIdx", type: "uint256"},
    {name: "itemIdx", type: "uint256"},
    {name: "price", type: "uint256"},
    {name: "itemHash", type: "bytes32"},
    {name: "executionDelegate", type: "address"},
    {name: "dataReplacement", type: "bytes"},
    {name: "bidIncentivePct", type: "uint256"},
    {name: "aucMinIncrementPct", type: "uint256"},
    {name: "aucIncDurationSecs", type: "uint256"},
    {name: "fees", type: "Fee[]"},
  ],
  Fee: [
    {name: "percentage", type: "uint256"},
    {name: "to", type: "address"},
  ],
  SettleShared: [
    {name: "salt", type: "uint256"},
    {name: "deadline", type: "uint256"},
    {name: "amountToEth", type: "uint256"},
    {name: "amountToWeth", type: "uint256"},
    {name: "user", type: "address"},
    {name: "canFail", type: "bool"},
  ],
};

export const hashItem = (order: X2Y2Order, item: X2Y2OrderItem) => {
  return DRE.ethers.utils.keccak256(
    DRE.ethers.utils.defaultAbiCoder.encode(
      [
        "uint256",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "address",
        "bytes",
        "(uint256 price, bytes data)",
      ],
      [
        order.salt,
        order.user,
        order.network,
        order.intent,
        order.delegateType,
        order.deadline,
        order.currency,
        order.dataMask,
        [item.price, item.data],
      ]
    )
  );
};

function makeSellOrder(
  chainId: number,
  user: string,
  expirationTime: BigNumber,
  items: {price: BigNumber; data: string}[],
  currency: string
): X2Y2Order {
  const salt = randomSalt();
  return {
    salt,
    user,
    network: chainId,
    intent: INTENT_SELL,
    delegateType: DELEGATION_TYPE_ERC721,
    deadline: expirationTime,
    currency: currency,
    dataMask: "0x",
    items,
    r: "",
    s: "",
    v: 0,
    signVersion: 1,
  };
}

function getNetworkMeta() {
  return {
    id: 1,
    rpcUrl: "https://rpc.ankr.com/eth",
    marketContract: "0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3",
    wethContract: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    apiBaseURL: "https://api.x2y2.org",
  };
}

function randomSalt() {
  var randomHex = DRE.ethers.BigNumber.from(
    DRE.ethers.utils.randomBytes(16)
  ).toHexString();
  return DRE.ethers.utils.hexZeroPad(randomHex, 64);
}

export const signSellOrder = async (signer, order: X2Y2Order) => {
  const orderData = DRE.ethers.utils.defaultAbiCoder.encode(orderParamTypes, [
    order.salt,
    order.user,
    order.network,
    order.intent,
    order.delegateType,
    order.deadline,
    order.currency,
    order.dataMask,
    order.items.length,
    order.items,
  ]);
  const orderHash = DRE.ethers.utils.keccak256(orderData); // signMessage
  const orderSig = await signer.signMessage(
    DRE.ethers.utils.arrayify(orderHash)
  );
  order.r = "0x" + orderSig.slice(2, 66);
  order.s = "0x" + orderSig.slice(66, 130);
  order.v = parseInt(orderSig.slice(130, 132), 16);
  fixSignature(order);
  return order;
};

function fixSignature(data: X2Y2Order) {
  // in geth its always 27/28, in ganache its 0/1. Change to 27/28 to prevent
  // signature malleability if version is 0/1
  // see https://github.com/ethereum/go-ethereum/blob/v1.8.23/internal/ethapi/api.go#L465
  if (data.v < 27) {
    data.v = data.v + 27;
  }
}

export declare type CreateOrderInput = {
  chainId: number;
  signer: Signer;
  tokenAddress: string;
  tokenId: number;
  price: BigNumber;
  currency: string;
  expirationTime: BigNumber;
};

export const createX2Y2Order = async ({
  chainId,
  signer,
  tokenAddress,
  tokenId,
  price,
  currency,
  expirationTime,
}: CreateOrderInput): Promise<X2Y2Order> => {
  const accountAddress = await signer.getAddress();

  const data = encodeItemData([{token: tokenAddress, tokenId}]);
  const order: X2Y2Order = makeSellOrder(
    chainId,
    accountAddress,
    expirationTime,
    [{price, data}],
    currency
  );
  await signOrder(signer, order);
  return order;
};

async function signOrder(signer: Signer, order: X2Y2Order): Promise<void> {
  const orderData: string = utils.defaultAbiCoder.encode(orderParamTypes, [
    order.salt,
    order.user,
    order.network,
    order.intent,
    order.delegateType,
    order.deadline,
    order.currency,
    order.dataMask,
    order.items.length,
    order.items,
  ]);
  const orderHash = DRE.ethers.utils.keccak256(orderData);
  // signMessage
  const orderSig = await signer.signMessage(utils.arrayify(orderHash));
  order.r = `0x${orderSig.slice(2, 66)}`;
  order.s = `0x${orderSig.slice(66, 130)}`;
  order.v = parseInt(orderSig.slice(130, 132), 16);
  fixSignature(order);
}

export const createRunput = async (
  signerAddress: string,
  delegate: string,
  order: X2Y2Order,
  taker: string,
  fees: Fee[]
): Promise<RunInput> => {
  const detail: SettleDetail = {
    op: OP_COMPLETE_SELL_OFFER,
    orderIdx: 0,
    itemIdx: 0,
    price: order.items[0].price,
    itemHash: hashItem(order, order.items[0]),
    executionDelegate: delegate,
    bidIncentivePct: 0,
    aucMinIncrementPct: 0,
    aucIncDurationSecs: 0,
    dataReplacement: "0x",
    fees: fees,
  };
  const shared = {
    amountToEth: 0,
    amountToWeth: 0,
    deadline: (await latest()) + 1000,
    salt: randomSalt(),
    user: taker,
    canFail: false,
  };
  const input: RunInput = {
    orders: [order],
    details: [detail],
    shared,
    r: "",
    s: "",
    v: 0,
  };
  const hash: string = hashRuninput(input);

  const signer = new Wallet(await findPrivateKey(signerAddress)!);
  const sig: Signature = signer._signingKey().signDigest(hash);

  input.r = sig.r;
  input.s = sig.s;
  input.v = sig.v;
  return input;
};

export const findPrivateKey = (address: string): string | undefined => {
  return accounts.find((a) => {
    const wallet = new Wallet(a.privateKey);
    return wallet.address === address;
  })?.privateKey;
};

export const hashRuninput = (input: RunInput): string => {
  const length = input.details.length;
  const details = input.details.map((i) => [
    i.op,
    i.orderIdx,
    i.itemIdx,
    i.price,
    i.itemHash,
    i.executionDelegate,
    i.dataReplacement,
    i.bidIncentivePct,
    i.aucMinIncrementPct,
    i.aucIncDurationSecs,
    i.fees.map((j) => [j.percentage, j.to]),
  ]);
  return DRE.ethers.utils.keccak256(
    DRE.ethers.utils.defaultAbiCoder.encode(
      [`${settleSharedParamType}`, "uint256", `${settleDetailParamType}[]`],
      [
        [
          input.shared.salt,
          input.shared.deadline,
          input.shared.amountToEth,
          input.shared.amountToWeth,
          input.shared.user,
          input.shared.canFail,
        ],
        length,
        details,
      ]
    )
  );
};
