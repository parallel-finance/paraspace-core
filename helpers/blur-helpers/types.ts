import type {BigNumber} from "ethers";

export enum Side {
  Buy,
  Sell,
}
export enum SignatureVersion {
  Single,
  Bulk,
}
export enum AssetType {
  ERC721,
  ERC1155,
}

export type Fee = {
  rate: string | BigNumber | number;
  recipient: string;
};

export type Order = {
  trader: string;
  side: Side;
  matchingPolicy: string;
  collection: string;
  tokenId: string | BigNumber | number;
  amount: string | BigNumber | number;
  paymentToken: string;
  price: string | BigNumber | number;
  listingTime: string | BigNumber | number;
  expirationTime: string | BigNumber | number;
  fees: Fee[];
  salt: string | BigNumber | number;
  extraParams: string;
};

export type Input = {
  order: Order;
  v: string | BigNumber | number;
  r: string;
  s: string;
  extraSignature: string;
  signatureVersion: SignatureVersion;
  blockNumber: string | BigNumber | number;
};
