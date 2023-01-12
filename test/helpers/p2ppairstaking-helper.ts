import {DRE} from "../../helpers/misc-utils";
import {MintableERC20, MintableERC721, P2PPairStaking} from "../../types";
import {SignerWithAddress} from "./make-suite";
import {convertSignatureToEIP2098} from "../../helpers/seaport-helpers/encoding";
import {BigNumberish, BytesLike} from "ethers";

export type ListingOrder = {
  stakingType: BigNumberish;
  offerer: string;
  token: string;
  tokenId: BigNumberish;
  share: BigNumberish;
  startTime: BigNumberish;
  endTime: BigNumberish;
  v: BigNumberish;
  r: BytesLike;
  s: BytesLike;
};

export async function getSignedListingOrder(
  p2pPairStaking: P2PPairStaking,
  stakingType: number,
  listingToken: MintableERC721 | MintableERC20,
  tokenId: number,
  share: number,
  signer: SignerWithAddress
): Promise<ListingOrder> {
  const domainData = {
    name: "ParaSpace",
    version: "1",
    chainId: (await DRE.ethers.provider.getNetwork()).chainId,
    verifyingContract: p2pPairStaking.address,
  };

  const signListingOrderType = {
    //"ListingOrder(uint8 stakingType,address offerer,address token,uint256 tokenId,uint256 share,uint256 startTime,uint256 endTime)"
    ListingOrder: [
      {name: "stakingType", type: "uint8"},
      {name: "offerer", type: "address"},
      {name: "token", type: "address"},
      {name: "tokenId", type: "uint256"},
      {name: "share", type: "uint256"},
      {name: "startTime", type: "uint256"},
      {name: "endTime", type: "uint256"},
    ],
  };

  const now = Math.floor(Date.now() / 1000);
  const order = {
    stakingType: stakingType,
    offerer: signer.address,
    token: listingToken.address,
    tokenId: tokenId,
    share: share,
    startTime: now - 3600,
    endTime: now + 3600,
  };

  const signature = await DRE.ethers.provider
    .getSigner(signer.address)
    ._signTypedData(domainData, signListingOrderType, order);

  const vrs = DRE.ethers.utils.splitSignature(
    convertSignatureToEIP2098(signature)
  );

  return {
    ...order,
    ...vrs,
  };
}
